import { Worker } from 'bullmq';
import { redisConnection } from '../utils/queue';
import { DeploymentService } from '../services/deployment.service';
import prisma from '@deployforge/database';
import { logger } from '../utils/logger';
import { AlertService } from '../services/alert.service';
import { CacheService } from '../services/cache.service';
import { EnvironmentService } from '../services/deployment/environment.service';
import path from 'node:path';
import { config } from '../config/env';
import { parseDeploymentJobPayload } from '../utils/deployment-job';
import { RollbackService } from '../services/rollback.service';
import { ResourcePolicyService } from '../services/resource-policy.service';

const lockTtlMs = config.security.deploymentLockTtlMs;

function publicJobError(error: any) {
    return JSON.stringify({
        message: String(error?.message || 'Deployment operation failed').slice(0, 500),
        errorCode: String(error?.errorCode || 'DEPLOYMENT_OPERATION_FAILED').slice(0, 100),
        stage: String(error?.stage || 'worker').slice(0, 100),
        ...(error?.details && typeof error.details === 'object' ? { details: error.details } : {}),
    }).slice(0, 4000);
}

async function currentReleaseId(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { activeReleaseId: true, candidateReleaseId: true } }).catch(() => null);
    return project?.candidateReleaseId || project?.activeReleaseId || undefined;
}

async function withDeploymentLocks<T>(projectId: string, vpsId: string, operation: () => Promise<T>): Promise<T> {
    const projectLock = await CacheService.acquireRenewableLock(`project-deploy:${projectId}`, lockTtlMs);
    if (!projectLock) throw new Error('Another deployment for this project is already running');

    const vpsLock = await CacheService.acquireRenewableLock(`vps-build:${vpsId}`, lockTtlMs);
    if (!vpsLock) {
        await projectLock.release();
        throw new Error('The VPS build slot is currently busy');
    }

    let lockLost = false;
    let renewing = false;
    const heartbeat = setInterval(async () => {
        if (renewing || lockLost) return;
        renewing = true;
        try {
            const [projectRenewed, vpsRenewed] = await Promise.all([
                projectLock.extend(),
                vpsLock.extend(),
            ]);
            lockLost = !projectRenewed || !vpsRenewed;
            if (lockLost) logger.error({ projectId, vpsId }, 'Deployment lock lease was lost');
        } catch (err) {
            lockLost = true;
            logger.error({ err, projectId, vpsId }, 'Deployment lock heartbeat failed');
        } finally {
            renewing = false;
        }
    }, Math.max(10000, Math.floor(lockTtlMs / 3)));
    heartbeat.unref();

    try {
        const result = await operation();
        if (lockLost) throw new Error('Deployment lock lease was lost; refusing to finalize this release');
        return result;
    } finally {
        clearInterval(heartbeat);
        await Promise.allSettled([vpsLock.release(), projectLock.release()]);
    }
}

export const deploymentWorker = new Worker(
    'deployment-queue',
    async (job) => {
        const { deploymentId, operation: jobOperation } = parseDeploymentJobPayload(job.data);
        if (jobOperation === 'sandbox-cleanup') {
            const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId }, select: { id: true, userId: true, mode: true, status: true } });
            if (deployment?.mode === 'sandbox' && deployment.status !== 'DELETED') {
                await DeploymentService.deleteDeployment(deployment.userId, deploymentId);
            }
            return;
        }

        const deploymentExists = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { project: true },
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
        logger.info({ jobId: job.id, deploymentId, projectId: deploymentExists.projectId, vpsId: deploymentExists.vpsId, operation: jobOperation }, 'Deployment job started');

        // Fetch deployment details for alert context
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            select: { id: true, userId: true, vpsId: true, name: true, vps: { select: { name: true } } },
        });

        try {
            await withDeploymentLocks(deploymentExists.projectId, deploymentExists.vpsId, async () => {
                if (jobOperation === 'rollback') {
                    await RollbackService.executeRollback(deploymentId);
                    return;
                }
                const env = deploymentExists.env ? JSON.parse(deploymentExists.env) : undefined;
                const source = deploymentExists.sourceType === 'github'
                    ? await (async () => {
                        const account = await prisma.gitHubAccount.findFirst({
                            where: { userId: { in: [deploymentExists.userId, deploymentExists.project.userId] } },
                        });
                        if (!account) throw new Error('GitHub account is no longer connected');
                        return {
                            type: 'github_repo' as const,
                            projectId: deploymentExists.projectId,
                            vpsId: deploymentExists.vpsId,
                            branch: deploymentExists.branch || deploymentExists.project.branch,
                            accessToken: EnvironmentService.decrypt(account.accessToken),
                            commitHash: deploymentExists.commitHash || undefined,
                            commitMessage: deploymentExists.commitMessage || undefined,
                            domainName: deploymentExists.domain || undefined,
                            env,
                            composeService: deploymentExists.composeService || undefined,
                            composePort: deploymentExists.composePort || undefined,
                            mode: deploymentExists.mode === 'sandbox' ? 'sandbox' as const : 'production' as const,
                        };
                    })()
                    : {
                        type: 'uploaded_file' as const,
                        projectId: deploymentExists.projectId,
                        vpsId: deploymentExists.vpsId,
                        uploadPath: deploymentExists.uploadPath || '',
                        originalFileName: path.basename(deploymentExists.uploadPath || 'upload.zip'),
                        domainName: deploymentExists.domain || undefined,
                        env,
                        composeService: deploymentExists.composeService || undefined,
                        composePort: deploymentExists.composePort || undefined,
                        mode: deploymentExists.mode === 'sandbox' ? 'sandbox' as const : 'production' as const,
                    };
                await DeploymentService.executeDeployment(deploymentId, source);
            });

            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: { status: 'SUCCESS' },
            });
            logger.info({ jobId: job.id, deploymentId, projectId: deploymentExists.projectId, releaseId: await currentReleaseId(deploymentExists.projectId), vpsId: deploymentExists.vpsId, operation: jobOperation }, 'Deployment job completed');

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
            logger.error({ err, jobId: job.id, deploymentId, projectId: deploymentExists.projectId, releaseId: await currentReleaseId(deploymentExists.projectId), vpsId: deploymentExists.vpsId, operation: jobOperation }, 'Deployment job operation failed');
            if (jobOperation === 'deploy') {
                await prisma.deployment.update({
                    where: { id: deploymentId },
                    data: { status: 'FAILED' },
                }).catch(() => undefined);
            }
            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: {
                    status: 'FAILED',
                    lastError: publicJobError(err),
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
        } finally {
            await ResourcePolicyService.releaseReservation(deploymentId).catch((err) => {
                logger.error({ err, deploymentId }, 'Failed to release deployment capacity reservation');
            });
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
