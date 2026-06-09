import { Worker } from 'bullmq';
import { redisConnection } from '../utils/queue';
import { DeploymentService } from '../services/deployment.service';
import prisma from '@deployforge/database';

export const deploymentWorker = new Worker(
    'deployment-queue',
    async (job) => {
        const { deploymentId, projectId, vpsId, branch, accessToken } = job.data;

        // Create a job record in DB
        const jobRecord = await prisma.deploymentJob.create({
            data: {
                deploymentId,
                status: 'RUNNING',
            },
        });

        try {
            const project = await prisma.project.findUnique({ where: { id: projectId } });
            const vps = await prisma.vps.findUnique({ where: { id: vpsId } });

            if (!project || !vps) throw new Error('Project or VPS not found');

            // Execute actual deployment logic from Phase 5
            // (Mapping back to the execution method in DeploymentService)
            await (DeploymentService as any).executeDeployment(
                deploymentId,
                project,
                vps,
                branch,
                accessToken
            );

            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: { status: 'SUCCESS' },
            });

        } catch (err: any) {
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
        connection: redisConnection,
        concurrency: 5, // Limit concurrent deployments
    }
);

deploymentWorker.on('failed', (job, err) => {
    console.error(`Deployment job ${job?.id} failed: ${err.message}`);
});
