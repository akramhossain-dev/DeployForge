import { DelayedError, UnrecoverableError, Worker } from 'bullmq';
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
import { LoggingService } from '../services/logging.service';
import { deploymentRetryDecision, type DeploymentRetryClassification } from '../utils/deployment-retry';
import { DeploymentSlotBusyError } from '../utils/deployment-slot';

const lockTtlMs = config.security.deploymentLockTtlMs;

function publicJobError(error: any, classification?: DeploymentRetryClassification, attempt?: number, maxAttempts?: number) {
    return JSON.stringify({
        message: String(error?.message || 'Deployment operation failed').slice(0, 500),
        errorCode: String(classification?.errorCode || error?.errorCode || error?.code || 'DEPLOYMENT_OPERATION_FAILED').slice(0, 100),
        stage: String(error?.stage || 'worker').slice(0, 100),
        ...(classification ? { retryable: classification.retryable } : {}),
        ...(attempt ? { attempt } : {}),
        ...(maxAttempts ? { maxAttempts } : {}),
        ...(error?.details && typeof error.details === 'object' ? { details: error.details } : {}),
    }).slice(0, 4000);
}

async function currentReleaseId(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { activeReleaseId: true, candidateReleaseId: true } }).catch(() => null);
    return project?.candidateReleaseId || project?.activeReleaseId || undefined;
}

async function withDeploymentLocks<T>(projectId: string, vpsId: string, operation: () => Promise<T>): Promise<T> {
    const projectLock = await CacheService.acquireRenewableLock(`project-deploy:${projectId}`, lockTtlMs);
    if (!projectLock) throw new DeploymentSlotBusyError('PROJECT');

    const vpsLock = await CacheService.acquireRenewableLock(`vps-build:${vpsId}`, lockTtlMs);
    if (!vpsLock) {
        await projectLock.release();
        throw new DeploymentSlotBusyError('VPS');
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
    async (job, token) => {
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

        const queueJobId = String(job.id || `${deploymentId}-${job.timestamp}`);
        const jobRecord = await prisma.deploymentJob.upsert({
            where: { queueJobId },
            create: {
                queueJobId,
                deploymentId,
                status: 'RUNNING',
                retryCount: job.attemptsMade,
            },
            update: {
                retryCount: job.attemptsMade,
            },
        });
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            select: { id: true, userId: true, vpsId: true, name: true, vps: { select: { name: true } } },
        });

        let retainReservationForRetry = false;
        try {
            await withDeploymentLocks(deploymentExists.projectId, deploymentExists.vpsId, async () => {
                await prisma.deploymentJob.update({
                    where: { id: jobRecord.id },
                    data: { status: 'RUNNING', waitReason: null, lastError: null, retryCount: job.attemptsMade },
                });
                logger.info({ jobId: job.id, deploymentId, projectId: deploymentExists.projectId, vpsId: deploymentExists.vpsId, operation: jobOperation }, 'Deployment job started');
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
                data: { status: 'SUCCESS', waitReason: null, lastError: null, retryCount: job.attemptsMade },
            });
            logger.info({ jobId: job.id, deploymentId, projectId: deploymentExists.projectId, releaseId: await currentReleaseId(deploymentExists.projectId), vpsId: deploymentExists.vpsId, operation: jobOperation }, 'Deployment job completed');

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
            if (err instanceof DeploymentSlotBusyError) {
                retainReservationForRetry = true;
                const waitReason = err.scope === 'VPS' ? 'VPS_BUSY' : 'PROJECT_BUSY';
                await prisma.deploymentJob.update({
                    where: { id: jobRecord.id },
                    data: {
                        status: 'QUEUED',
                        waitReason,
                        lastError: null,
                        retryCount: job.attemptsMade,
                    },
                });
                if (jobOperation === 'deploy') {
                    await prisma.deployment.update({
                        where: { id: deploymentId },
                        data: {
                            status: 'PENDING',
                            domain: deploymentExists.domain,
                            hostType: deploymentExists.domain ? 'domain' : 'ip',
                        },
                    }).catch(() => undefined);
                }
                if (jobRecord.waitReason !== waitReason) {
                    await LoggingService.log(
                        deploymentId,
                        err.scope === 'VPS'
                            ? 'Waiting for the VPS build slot. The deployment remains queued.'
                            : 'Waiting for another deployment of this project to finish.',
                        'system',
                        'info',
                    ).catch(() => undefined);
                }
                logger.info({ jobId: job.id, deploymentId, vpsId: deploymentExists.vpsId, scope: err.scope }, 'Deployment is waiting for an available build slot');
                await job.moveToDelayed(Date.now() + 5000, token);
                throw new DelayedError();
            }

            const decision = deploymentRetryDecision(err, job.attemptsMade, Number(job.opts.attempts || 1));
            retainReservationForRetry = decision.shouldRetry;
            logger.error({ err, retryable: decision.retryable, shouldRetry: decision.shouldRetry, attempt: decision.attempt, maxAttempts: decision.maxAttempts, jobId: job.id, deploymentId, projectId: deploymentExists.projectId, releaseId: await currentReleaseId(deploymentExists.projectId), vpsId: deploymentExists.vpsId, operation: jobOperation }, 'Deployment job operation failed');
            if (jobOperation === 'deploy' && decision.shouldRetry) {
                await prisma.deployment.update({
                    where: { id: deploymentId },
                    data: {
                        status: 'PENDING',
                        domain: deploymentExists.domain,
                        hostType: deploymentExists.domain ? 'domain' : 'ip',
                    },
                }).catch(() => undefined);
                await LoggingService.log(
                    deploymentId,
                    `Transient failure (${decision.errorCode}). Retry ${decision.attempt + 1} of ${decision.maxAttempts} scheduled.`,
                    'system',
                    'warn',
                ).catch(() => undefined);
            } else if (jobOperation === 'deploy') {
                await prisma.deployment.update({
                    where: { id: deploymentId },
                    data: { status: 'FAILED' },
                }).catch(() => undefined);
            }
            await prisma.deploymentJob.update({
                where: { id: jobRecord.id },
                data: {
                    status: decision.shouldRetry ? 'QUEUED' : 'FAILED',
                    waitReason: null,
                    lastError: publicJobError(err, decision, decision.attempt, decision.maxAttempts),
                    retryCount: decision.attempt,
                },
            });

            if (decision.shouldRetry) {
                logger.warn({ jobId: job.id, deploymentId, attempt: decision.attempt, maxAttempts: decision.maxAttempts, errorCode: decision.errorCode }, 'Transient deployment failure; retry scheduled');
            } else if (deployment) {
                AlertService.handleDeploymentEvent(
                    deployment.userId,
                    deployment.vpsId,
                    deployment.vps?.name || 'Unknown',
                    'DEPLOYMENT_FAILED',
                    deployment.name || undefined,
                ).catch(() => undefined);
            }

            if (!decision.retryable) {
                throw new UnrecoverableError(String(err?.message || 'Permanent deployment failure'));
            }
            throw err;
        } finally {
            if (!retainReservationForRetry) {
                await ResourcePolicyService.releaseReservation(deploymentId).catch((err) => {
                    logger.error({ err, deploymentId }, 'Failed to release deployment capacity reservation');
                });
            }
        }
    },
    {
        connection: redisConnection as any,
        concurrency: 5, 
    }
);

deploymentWorker.on('failed', (job, err) => {
    const maxAttempts = Number(job?.opts.attempts || 1);
    const retrying = Boolean(job && !(err instanceof UnrecoverableError) && job.attemptsMade < maxAttempts);
    if (retrying) {
        logger.warn({ err, jobId: job?.id, attempt: job?.attemptsMade, maxAttempts }, 'Deployment attempt failed; job will retry');
        return;
    }
    logger.error({ err, jobId: job?.id, attemptsMade: job?.attemptsMade, maxAttempts }, 'Deployment job failed permanently');
});
