import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { deploymentQueue } from '../utils/queue';
import { deploymentJobPayload } from '../utils/deployment-job';
import { verifyDeploymentOwnership } from '../utils/authz';
import { EnvironmentService } from './deployment/environment.service';
import { ValidationService } from './deployment/validation.service';
import { ReleaseService } from './release.service';
import { LoggingService } from './logging.service';

export class RollbackService {
    static async getHistory(deploymentId: string) {
        const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId }, select: { projectId: true } });
        if (!deployment) return [];
        return prisma.deploymentRelease.findMany({
            where: { projectId: deployment.projectId, status: { in: ['ACTIVE', 'SUPERSEDED'] } },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async rollback(userId: string, deploymentId: string, targetId?: string) {
        await verifyDeploymentOwnership(userId, deploymentId);
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { project: { include: { activeRelease: true } } },
        });
        if (!deployment) throw this.error('Deployment not found', 'DEPLOYMENT_NOT_FOUND', 404);

        let target = targetId
            ? await prisma.deploymentRelease.findFirst({ where: { id: targetId, projectId: deployment.projectId } })
            : null;
        if (!target && targetId) {
            const legacy = await prisma.deploymentHistory.findFirst({
                where: { id: targetId, deployment: { projectId: deployment.projectId } },
                select: { deploymentId: true, version: true },
            });
            if (legacy) {
                target = await prisma.deploymentRelease.findFirst({
                    where: { projectId: deployment.projectId, deploymentId: legacy.deploymentId, version: legacy.version },
                    orderBy: { createdAt: 'desc' },
                });
            }
        }
        if (!target && !targetId) {
            target = await prisma.deploymentRelease.findFirst({
                where: { projectId: deployment.projectId, status: 'SUPERSEDED', runtimeRef: { not: null } },
                orderBy: { createdAt: 'desc' },
            });
        }
        if (!target) throw this.error('Rollback release was not found', 'ROLLBACK_RELEASE_NOT_FOUND', 404);
        if (target.id === deployment.project.activeReleaseId) throw this.error('The selected release is already active', 'RELEASE_ALREADY_ACTIVE', 409);
        if (!target.runtimeRef) throw this.error('The selected legacy release has no verified runtime artifact', 'ROLLBACK_ARTIFACT_UNAVAILABLE', 409);

        await prisma.$transaction(async (tx) => {
            const currentCandidate = deployment.project.candidateReleaseId;
            if (currentCandidate && currentCandidate !== target.id) {
                await tx.deploymentRelease.updateMany({
                    where: { id: currentCandidate, status: { not: 'ACTIVE' } },
                    data: { status: 'FAILED', readinessStatus: 'FAILED', readinessError: 'Superseded by rollback request' },
                });
            }
            await tx.deploymentRelease.update({
                where: { id: target.id },
                data: { status: 'CANDIDATE', readinessStatus: 'PENDING', readinessError: null, activationReason: 'ROLLBACK', retentionPinnedAt: new Date(), retentionPinReason: 'ROLLBACK_IN_PROGRESS' },
            });
            await tx.project.update({ where: { id: deployment.projectId }, data: { candidateReleaseId: target.id } });
        });
        await deploymentQueue.add('rollback', deploymentJobPayload(target.deploymentId, 'rollback'), {
            jobId: `rollback-${deployment.projectId}-${target.id}-${Date.now()}`,
        });
        return { queued: true, candidateReleaseId: target.id };
    }

    static async executeRollback(deploymentId: string) {
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { project: { include: { activeRelease: { include: { deployment: true } } } }, vps: true },
        });
        if (!deployment || deployment.project.candidateReleaseId == null) {
            throw this.error('Rollback candidate is missing', 'ROLLBACK_CANDIDATE_MISSING', 409);
        }
        const release = await prisma.deploymentRelease.findUnique({ where: { id: deployment.project.candidateReleaseId } });
        if (!release?.runtimeRef) throw this.error('Rollback runtime is unavailable', 'ROLLBACK_ARTIFACT_UNAVAILABLE', 409);

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...(deployment.vps.authType === 'key'
                    ? { privateKey: EnvironmentService.decrypt(deployment.vps.encryptedPrivateKey!) }
                    : { password: EnvironmentService.decrypt(deployment.vps.encryptedPassword!) }),
            });
            const alias = ReleaseService.alias(release.id);
            const ingressContainer = await this.ingressContainer(ssh, release.runtimeRef, release.composeService);
            await this.enforceRuntimePolicy(ssh, release.runtimeRef, {
                cpuMillis: release.cpuLimitMillis,
                memoryMiB: release.memoryLimitMiB,
                pids: release.pidsLimit,
            });
            await ssh.execute('docker network inspect deployforge-validation >/dev/null 2>&1 || docker network create --driver bridge --internal deployforge-validation');
            await ssh.execute(`docker network connect --alias ${quote(alias)} deployforge-validation ${quote(ingressContainer)} 2>/dev/null || true`);
            await ValidationService.healthCheckCandidate(ssh, deployment.id, alias, release.ingressPort);

            const activeDeployment = deployment.project.activeRelease?.deployment;
            const domain = activeDeployment?.domain
                || deployment.domain
                || `${safeName(deployment.project.name)}-${deployment.projectId.slice(0, 8)}.${deployment.vps.ipAddress}.sslip.io`;
            await ReleaseService.activate(ssh, {
                releaseId: release.id,
                deploymentId: deployment.id,
                domain,
                routerId: `df-${deployment.projectId}`,
            });
            await prisma.deployment.updateMany({
                where: { projectId: deployment.projectId, status: 'RUNNING', id: { not: release.deploymentId } },
                data: { status: 'STOPPED' },
            });
            await prisma.deployment.update({
                where: { id: release.deploymentId },
                data: { status: 'ROLLED_BACK', containerId: release.runtimeRef, lastStableVersion: release.version },
            });
            await LoggingService.log(release.deploymentId, `Rollback activated release ${release.version}`, 'system');
            return { success: true, releaseId: release.id, version: release.version };
        } finally {
            ssh.disconnect();
            await prisma.deploymentRelease.updateMany({
                where: { id: deployment.project.candidateReleaseId || undefined, retentionPinReason: 'ROLLBACK_IN_PROGRESS' },
                data: { retentionPinnedAt: null, retentionPinReason: null },
            }).catch(() => undefined);
        }
    }

    private static async enforceRuntimePolicy(ssh: SSHService, runtimeRef: string, policy: { cpuMillis: number; memoryMiB: number; pids: number }) {
        const ids = runtimeRef.startsWith('compose:')
            ? (await ssh.execute(`docker ps -q --filter label=com.docker.compose.project=${quote(runtimeRef.slice('compose:'.length))}`)).stdout.trim().split(/\s+/).filter(Boolean)
            : [runtimeRef];
        if (!ids.length) throw this.error('Rollback runtime is unavailable', 'ROLLBACK_RUNTIME_UNAVAILABLE', 409);
        for (const id of ids) {
            const update = await ssh.execute(`docker update --cpus ${(policy.cpuMillis / 1000).toFixed(3)} --memory ${policy.memoryMiB}m --memory-swap ${policy.memoryMiB}m --pids-limit ${policy.pids} ${quote(id)}`);
            if (update.code !== 0) throw this.error('Rollback runtime could not be isolated safely', 'ROLLBACK_RESOURCE_POLICY_FAILED', 409);
        }
    }

    private static async ingressContainer(ssh: SSHService, runtimeRef: string, composeService?: string | null) {
        if (!runtimeRef.startsWith('compose:')) return runtimeRef;
        const project = runtimeRef.slice('compose:'.length);
        const result = await ssh.execute(`docker ps --filter label=com.docker.compose.project=${quote(project)} --filter label=com.docker.compose.service=${quote(composeService || '')} -q | head -n1`);
        if (!result.stdout.trim()) throw this.error('Compose rollback ingress is not running', 'ROLLBACK_RUNTIME_UNAVAILABLE', 409);
        return result.stdout.trim();
    }

    private static error(message: string, errorCode: string, statusCode: number) {
        return Object.assign(new Error(message), { errorCode, statusCode, stage: 'rollback' });
    }
}

function quote(value: string) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function safeName(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';
}
