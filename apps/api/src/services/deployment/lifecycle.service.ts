import prisma from '@deployforge/database';
import { deploymentQueue } from '../../utils/queue';
import { deploymentJobPayload } from '../../utils/deployment-job';
import { CacheService } from '../cache.service';
import { LoggingService } from '../logging.service';
import { ResourcePolicyService } from '../resource-policy.service';
import { DeploymentError } from './error';
import { isCancellableQueueJobState } from '../../utils/deployment-slot';
import { deploymentCancellationKey } from '../../utils/deployment-cancellation';

export class DeploymentLifecycleService {
    private static async verifyDeploymentAndRole(userId: string, deploymentId: string, allowedRoles: ('OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER')[]): Promise<any> {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId },
            include: {
                vps: true,
                domains: true,
                project: {
                    include: {
                        members: {
                            where: { userId }
                        }
                    }
                },
                history: { orderBy: { createdAt: 'desc' } }
            }
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');

        const isDirectOwner = deployment.userId === userId || deployment.project.userId === userId;
        if (isDirectOwner) return deployment;

        const member = deployment.project.members[0];
        if (!member || !allowedRoles.includes(member.role as any)) {
            throw new DeploymentError('forbidden', 'Access denied: insufficient project role permissions', 'FORBIDDEN');
        }

        return deployment;
    }

    static async cancelDeployment(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        if (['CANCELED', 'CANCELLED'].includes(deployment.status)) {
            await ResourcePolicyService.releaseReservation(deploymentId);
            return { success: true, canceled: true, state: 'CANCELED' };
        }
        if (deployment.status === 'CANCELING') {
            return { success: true, canceled: false, state: 'CANCELING' };
        }

        const jobRecord = await prisma.deploymentJob.findFirst({
            where: { deploymentId },
            orderBy: { createdAt: 'desc' },
        });
        if (!jobRecord || !['QUEUED', 'RUNNING'].includes(jobRecord.status) || !jobRecord.queueJobId) {
            throw new DeploymentError('queue', 'Only a queued or active deployment can be canceled', 'DEPLOYMENT_NOT_CANCELLABLE', 409);
        }

        if (jobRecord.status === 'QUEUED') {
            let queuedOperation = 'deploy';
            const queuedJob = await deploymentQueue.getJob(jobRecord.queueJobId);
            if (queuedJob) {
                queuedOperation = typeof queuedJob.data?.operation === 'string' ? queuedJob.data.operation : 'deploy';
                const state = await queuedJob.getState();
                if (!isCancellableQueueJobState(state)) {
                    throw new DeploymentError('queue', `Deployment job is already ${state}`, 'QUEUE_JOB_NOT_CANCELLABLE', 409, { state });
                }
                try {
                    await queuedJob.remove();
                } catch {
                    throw new DeploymentError('queue', 'Deployment job started before cancellation completed', 'QUEUE_JOB_NOT_CANCELLABLE', 409, { state: 'active' });
                }
            }

            await prisma.$transaction(async (tx) => {
                const updated = await tx.deploymentJob.updateMany({
                    where: { id: jobRecord.id, status: 'QUEUED' },
                    data: { status: 'CANCELED', waitReason: null, lastError: null },
                });
                if (updated.count !== 1) {
                    throw new DeploymentError('queue', 'Deployment job started before cancellation completed', 'QUEUE_JOB_NOT_CANCELLABLE', 409);
                }
                if (queuedOperation === 'deploy') {
                    await tx.deployment.update({
                        where: { id: deploymentId },
                        data: { status: 'CANCELED' },
                    });
                }
                await tx.capacityReservation.updateMany({
                    where: { deploymentId, status: 'RESERVED' },
                    data: { status: 'RELEASED', releasedAt: new Date() },
                });
            });
            await LoggingService.log(deploymentId, `Queued ${queuedOperation} operation canceled by userId=${userId}`, 'system', 'info').catch(() => undefined);
            return { success: true, canceled: true, state: 'CANCELED' };
        }

        const candidate = await prisma.deploymentRelease.findFirst({
            where: { deploymentId },
            orderBy: { createdAt: 'desc' },
            select: { status: true },
        });
        if (candidate && ['ACTIVATING', 'ACTIVE'].includes(candidate.status)) {
            throw new DeploymentError('cancellation', 'Traffic activation has already started; cancellation is no longer safe', 'DEPLOYMENT_NOT_CANCELLABLE', 409);
        }
        await CacheService.set(deploymentCancellationKey(deploymentId), { requestedAt: new Date().toISOString(), userId }, 10 * 60);
        await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'CANCELING' } });
        await LoggingService.log(deploymentId, `Cancellation requested by userId=${userId}; stopping the active remote process.`, 'system', 'warn').catch(() => undefined);
        return { success: true, canceled: false, state: 'CANCELING' };
    }

    static async getStatus(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: {
                id: deploymentId,
                OR: [
                    { userId },
                    {
                        project: {
                            OR: [
                                { userId },
                                { members: { some: { userId } } }
                            ]
                        }
                    }
                ]
            },
            include: {
                project: { include: { activeRelease: true, candidateRelease: true, releases: { where: { status: 'SUPERSEDED', runtimeRef: { not: null } }, take: 1, orderBy: { createdAt: 'desc' } } } },
                vps: true,
                domains: true,
                deploymentLogs: { take: 25, orderBy: { createdAt: 'desc' } },
                history: { take: 5, orderBy: { createdAt: 'desc' } },
                jobs: { take: 1, orderBy: { createdAt: 'desc' } },
                preflightChecks: { orderBy: [{ status: 'desc' }, { category: 'asc' }, { title: 'asc' }] },
            },
        });
        if (!deployment) throw new DeploymentError('status', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        return deployment;
    }

    static async approvePreflightWarnings(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        if (deployment.status !== 'AWAITING_PREFLIGHT') {
            throw new DeploymentError('preflight', 'This deployment is not awaiting preflight warning approval', 'PREFLIGHT_NOT_AWAITING_APPROVAL', 409);
        }
        const checks = await prisma.deploymentPreflightCheck.findMany({ where: { deploymentId } });
        if (checks.some((check) => check.status === 'BLOCKED')) {
            throw new DeploymentError('preflight', 'Blocked preflight checks cannot be overridden', 'PREFLIGHT_BLOCKED', 409);
        }
        if (!checks.some((check) => check.status === 'WARNING')) {
            throw new DeploymentError('preflight', 'No preflight warnings require approval', 'PREFLIGHT_NO_WARNINGS', 409);
        }

        const policy = await ResourcePolicyService.resolve(deployment.projectId, deployment.requestedResourceTier);
        if (policy) await ResourcePolicyService.reserve(deploymentId, policy);
        try {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { preflightWarningsAccepted: true, status: 'PENDING' },
            });
            await LoggingService.log(deploymentId, `Preflight warnings approved by userId=${userId}; deployment queued again`, 'system');
            const job = await deploymentQueue.add('deploy', deploymentJobPayload(deploymentId, 'deploy'), {
                jobId: `preflight-approved-${deploymentId}-${Date.now()}`,
            });
            return { queued: true, jobId: String(job.id) };
        } catch (error) {
            await ResourcePolicyService.releaseReservation(deploymentId);
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'AWAITING_PREFLIGHT' } }).catch(() => undefined);
            throw error;
        }
    }

    static async retryBlockedPreflight(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        if (deployment.status !== 'PREFLIGHT_BLOCKED') {
            throw new DeploymentError('preflight', 'This deployment is not blocked by preflight checks', 'PREFLIGHT_NOT_BLOCKED', 409);
        }
        const policy = await ResourcePolicyService.resolve(deployment.projectId, deployment.requestedResourceTier);
        if (policy) await ResourcePolicyService.reserve(deploymentId, policy);
        try {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { preflightWarningsAccepted: false, status: 'PENDING' },
            });
            await LoggingService.log(deploymentId, `Blocked preflight retry requested by userId=${userId}`, 'system');
            const job = await deploymentQueue.add('deploy', deploymentJobPayload(deploymentId, 'deploy'), {
                jobId: `preflight-retry-${deploymentId}-${Date.now()}`,
            });
            return { queued: true, jobId: String(job.id) };
        } catch (error) {
            await ResourcePolicyService.releaseReservation(deploymentId);
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'PREFLIGHT_BLOCKED' } }).catch(() => undefined);
            throw error;
        }
    }

}
