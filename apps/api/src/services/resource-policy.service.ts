import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { CacheService } from './cache.service';
import { EnvironmentService } from './deployment/environment.service';
import { DeploymentError } from './deployment/error';
import { shellQuote } from './deployment/utils';
import { capacityDetails, capacityFailure, CapacitySnapshot, EffectiveResourcePolicy, RESOURCE_DEFAULTS, ResourceTierName } from './resource-policy';
export { capacityDetails, capacityFailure, RESOURCE_DEFAULTS, tierForRuntime, splitComposePolicy } from './resource-policy';
export type { CapacitySnapshot, EffectiveResourcePolicy, ResourceTierName } from './resource-policy';

export class ResourcePolicyService {
    static async validateOverride(vpsId: string, policy: EffectiveResourcePolicy) {
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps) throw new DeploymentError('capacity', 'VPS not found', 'VPS_NOT_FOUND');
        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...(vps.authType === 'key'
                    ? { privateKey: EnvironmentService.decrypt(vps.encryptedPrivateKey!) }
                    : { password: EnvironmentService.decrypt(vps.encryptedPassword!) }),
            });
            const failure = capacityFailure(await this.snapshot(ssh), await this.committed(vpsId, '__override__'), policy);
            if (failure) throw new DeploymentError('capacity', 'Override exceeds validated VPS capacity', failure);
        } finally {
            ssh.disconnect();
        }
    }

    static async resolve(projectId: string, requested?: ResourceTierName | null): Promise<EffectiveResourcePolicy | null> {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { resourcePolicy: true },
        });
        if (!project) throw new DeploymentError('capacity', 'Project not found', 'PROJECT_NOT_FOUND');
        if (!requested) return null;
        const tier = requested;
        const base = RESOURCE_DEFAULTS[tier as ResourceTierName];
        const override = project.resourcePolicy;
        return {
            tier: tier as ResourceTierName,
            cpuMillis: override?.cpuLimitMillis || base.cpuMillis,
            memoryMiB: override?.memoryLimitMiB || base.memoryMiB,
            pids: override?.pidsLimit || base.pids,
            storageMiB: override?.storageLimitMiB || base.storageMiB,
        };
    }

    static async enforceActiveProjectLimit(ownerId: string, projectId: string) {
        const rows = await prisma.deployment.findMany({
            where: {
                project: { userId: ownerId },
                status: { in: ['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'PREFLIGHT', 'DEPLOYING', 'RUNNING', 'PAUSED', 'ROLLED_BACK'] },
                projectId: { not: projectId },
            },
            distinct: ['projectId'],
            select: { projectId: true },
        });
        if (rows.length >= 10) throw new DeploymentError('capacity', 'Active project limit reached (maximum 10)', 'DEPLOYMENT_LIMIT_REACHED');
    }

    static async reserve(deploymentId: string, policy: EffectiveResourcePolicy) {
        const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId }, include: { project: true, vps: true } });
        if (!deployment) throw new DeploymentError('capacity', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        await this.enforceActiveProjectLimit(deployment.project.userId, deployment.projectId);
        const lock = await CacheService.acquireRenewableLock(`vps-capacity:${deployment.vpsId}`, 60_000);
        if (!lock) throw new DeploymentError('capacity', 'VPS capacity is being updated; retry shortly', 'VPS_CAPACITY_BUSY');
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
            const snapshot = await this.snapshot(ssh);
            const committed = await this.committed(deployment.vpsId, deploymentId, deployment.projectId);
            const failure = capacityFailure(snapshot, committed, policy);
            if (failure) {
                throw new DeploymentError(
                    'capacity',
                    `VPS does not have enough reserved capacity for ${policy.tier}`,
                    failure,
                    409,
                    capacityDetails(snapshot, committed, policy),
                );
            }
            await prisma.$transaction([
                prisma.deployment.update({
                    where: { id: deploymentId },
                    data: {
                        resourceTier: policy.tier,
                        resourcePolicyEnabled: true,
                        cpuLimitMillis: policy.cpuMillis,
                        memoryLimitMiB: policy.memoryMiB,
                        pidsLimit: policy.pids,
                        storageLimitMiB: policy.storageMiB,
                    },
                }),
                prisma.capacityReservation.upsert({
                    where: { deploymentId },
                    create: {
                        deploymentId,
                        projectId: deployment.projectId,
                        vpsId: deployment.vpsId,
                        cpuMillis: policy.cpuMillis,
                        memoryMiB: policy.memoryMiB,
                        storageMiB: policy.storageMiB,
                        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
                    },
                    update: {
                        status: 'RESERVED',
                        releasedAt: null,
                        cpuMillis: policy.cpuMillis,
                        memoryMiB: policy.memoryMiB,
                        storageMiB: policy.storageMiB,
                        expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
                    },
                }),
            ]);
        } finally {
            ssh.disconnect();
            await lock.release();
        }
    }

    static async reconcileDetectedTier(deploymentId: string, detectedTier: ResourceTierName) {
        const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
        if (!deployment) throw new DeploymentError('capacity', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        if (deployment.requestedResourceTier && deployment.requestedResourceTier !== detectedTier) {
            throw new DeploymentError('capacity', `Requested ${deployment.requestedResourceTier} tier does not match detected ${detectedTier} workload`, 'RESOURCE_TIER_MISMATCH');
        }
        const policy = await this.resolve(deployment.projectId, deployment.requestedResourceTier);
        if (!policy) {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { resourceTier: detectedTier, resourcePolicyEnabled: false },
            });
            await this.releaseReservation(deploymentId);
            return null;
        }
        await this.reserve(deploymentId, policy);
        return policy;
    }

    static async releaseReservation(deploymentId: string) {
        await prisma.capacityReservation.updateMany({
            where: { deploymentId, status: 'RESERVED' },
            data: { status: 'RELEASED', releasedAt: new Date() },
        });
    }

    static async assertWorkspaceBudget(ssh: SSHService, _deploymentId: string, projectId: string, username: string, storageMiB: number) {
        const base = `/home/${username.replace(/[^a-zA-Z0-9_-]/g, '')}/deployforge/projects/${projectId}`;
        const result = await ssh.execute(`test ! -d ${shellQuote(base)} || du -sm ${shellQuote(base)} | awk '{print $1}'`);
        const used = Number(result.stdout.trim() || 0);
        if (!Number.isFinite(used) || used > storageMiB) {
            throw new DeploymentError('capacity', `Project workspace uses ${used || 'unknown'} MiB; limit is ${storageMiB} MiB`, 'PROJECT_STORAGE_BUDGET_EXCEEDED');
        }
    }

    static dockerFlags(policy: EffectiveResourcePolicy | null | undefined, hardStorageLimit: boolean) {
        const logging = '--log-driver json-file --log-opt max-size=10m --log-opt max-file=10';
        if (!policy) return logging;
        return `--cpus ${(policy.cpuMillis / 1000).toFixed(3)} --memory ${policy.memoryMiB}m --memory-swap ${policy.memoryMiB}m --pids-limit ${policy.pids} ${logging}${hardStorageLimit ? ` --storage-opt size=${policy.storageMiB}M` : ''}`;
    }

    static async supportsHardStorageLimit(ssh: SSHService) {
        const result = await ssh.execute(`docker info --format '{{.Driver}} {{json .DriverStatus}}' 2>/dev/null`);
        const value = result.stdout.toLowerCase();
        return result.code === 0 && value.includes('overlay2') && value.includes('xfs') && (value.includes('projectquota') || value.includes('pquota'));
    }

    private static async snapshot(ssh: SSHService): Promise<CapacitySnapshot> {
        const result = await ssh.execute(`printf '%s ' "$(nproc)" "$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)" "$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)" "$(df -Pm / | awk 'NR==2{print $2}')" "$(df -Pm / | awk 'NR==2{print $4}')"`);
        const [cores, totalMemoryMiB, availableMemoryMiB, totalDiskMiB, availableDiskMiB] = result.stdout.trim().split(/\s+/).map(Number);
        if (![cores, totalMemoryMiB, availableMemoryMiB, totalDiskMiB, availableDiskMiB].every(Number.isFinite)) {
            throw new DeploymentError('capacity', 'Could not read VPS capacity', 'VPS_CAPACITY_UNAVAILABLE');
        }
        return { cpuMillis: cores * 1000, totalMemoryMiB, availableMemoryMiB, totalDiskMiB, availableDiskMiB };
    }

    private static async committed(vpsId: string, excludeDeploymentId: string, excludeStorageProjectId?: string) {
        const releases = await prisma.deploymentRelease.findMany({
            where: { vpsId, resourcePolicyEnabled: true, purgedAt: null, status: { in: ['CANDIDATE', 'READY', 'ACTIVATING', 'ACTIVE'] } },
            select: { projectId: true, cpuLimitMillis: true, memoryLimitMiB: true, storageLimitMiB: true },
        });
        const reservations = await prisma.capacityReservation.findMany({
            where: { vpsId, status: 'RESERVED', expiresAt: { gt: new Date() }, deploymentId: { not: excludeDeploymentId } },
            select: { projectId: true, cpuMillis: true, memoryMiB: true, storageMiB: true },
        });
        const projectStorage = new Map<string, number>();
        let cpuMillis = 0;
        let memoryMiB = 0;
        for (const item of releases) {
            cpuMillis += item.cpuLimitMillis;
            memoryMiB += item.memoryLimitMiB;
            projectStorage.set(item.projectId, Math.max(projectStorage.get(item.projectId) || 0, item.storageLimitMiB));
        }
        for (const item of reservations) {
            cpuMillis += item.cpuMillis;
            memoryMiB += item.memoryMiB;
            projectStorage.set(item.projectId, Math.max(projectStorage.get(item.projectId) || 0, item.storageMiB));
        }
        if (excludeStorageProjectId) projectStorage.delete(excludeStorageProjectId);
        return { cpuMillis, memoryMiB, storageMiB: [...projectStorage.values()].reduce((sum, value) => sum + value, 0) };
    }
}
