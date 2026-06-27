import { Worker } from 'bullmq';
import { redisConnection } from '../utils/queue';
import { DeploymentService } from '../services/deployment.service';
import prisma from '@deployforge/database';
import { logger } from '../utils/logger';
import { AlertService } from '../services/alert.service';

export const deploymentWorker = new Worker(
    'deployment-queue',
    async (job) => {
        const { deploymentId, source } = job.data;
        if (job.name === 'sandbox-cleanup') {
            const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId }, select: { id: true, userId: true, mode: true, status: true } });
            if (deployment?.mode === 'sandbox' && deployment.status !== 'DELETED') {
                await DeploymentService.deleteDeployment(deployment.userId, deploymentId);
            }
            return;
        }

        const deploymentExists = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            select: { id: true },
        });

        if (!deploymentExists) {
            logger.warn({ deploymentId, jobId: job.id }, 'Deployment record not found in database. Skipping job.');
            return;
        }

        const jobRecord = await prisma.deploymentJob.create({
            data: {
                deploymentId,
                status: 'RUNNING',
            },
        });

        // Fetch deployment details for alert context
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            select: { id: true, userId: true, vpsId: true, name: true, vps: { select: { name: true } } },
        });

        try {
            if (!source?.type) throw new Error('Deployment source is missing');
            await DeploymentService.executeDeployment(deploymentId, source);

            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: { status: 'SUCCESS' },
            });

            // Alert: deployment completed
            if (deployment) {
                AlertService.handleDeploymentEvent(
                    deployment.userId,
                    deployment.vpsId,
                    deployment.vps?.name || 'Unknown',
                    'DEPLOYMENT_COMPLETED',
                    deployment.name || undefined,
                ).catch(() => undefined);
            }

        } catch (err: any) {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { status: 'FAILED' },
            }).catch(() => undefined);
            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: {
                    status: 'FAILED',
                    lastError: err.message,
                    retryCount: job.attemptsMade,
                },
            });

            // Alert: deployment failed
            if (deployment) {
                AlertService.handleDeploymentEvent(
                    deployment.userId,
                    deployment.vpsId,
                    deployment.vps?.name || 'Unknown',
                    'DEPLOYMENT_FAILED',
                    deployment.name || undefined,
                ).catch(() => undefined);
            }

            throw err; 
        }
    },
    {
        connection: redisConnection as any,
        concurrency: 5, 
    }
);

deploymentWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id }, 'Deployment job failed');
});
