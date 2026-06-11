import { Worker } from 'bullmq';
import { redisConnection } from '../utils/queue';
import { DeploymentService } from '../services/deployment.service';
import prisma from '@deployforge/database';

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

        // Create a job record in DB
        const jobRecord = await prisma.deploymentJob.create({
            data: {
                deploymentId,
                status: 'RUNNING',
            },
        });

        try {
            if (!source?.type) throw new Error('Deployment source is missing');
            await DeploymentService.executeDeployment(deploymentId, source);

            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: { status: 'SUCCESS' },
            });

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
            throw err; // Allow BullMQ to retry
        }
    },
    {
        connection: redisConnection as any,
        concurrency: 5, // Limit concurrent deployments
    }
);

deploymentWorker.on('failed', (job, err) => {
    console.error(`Deployment job ${job?.id} failed: ${err.message}`);
});
