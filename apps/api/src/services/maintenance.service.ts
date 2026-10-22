import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { CacheService } from './cache.service';
import { EnvironmentService } from './deployment/environment.service';
import { shellQuote } from './deployment/utils';
import { logger } from '../utils/logger';
import { retentionCandidates } from './maintenance-policy';
export { retentionCandidates } from './maintenance-policy';
import { HardeningService } from './hardening.service';

export class MaintenanceService {
    static async runDaily() {
        await this.releaseStaleReservations();
        const projects = await prisma.project.findMany({ select: { activeReleaseId: true, candidateReleaseId: true } });
        const releases = await prisma.deploymentRelease.findMany({
            where: { purgedAt: null, purgeRetryCount: { lt: 8 }, OR: [{ purgeNextRetryAt: null }, { purgeNextRetryAt: { lte: new Date() } }] },
            orderBy: { createdAt: 'desc' },
            include: { vps: true },
        });
        const ids = retentionCandidates(
            releases,
            new Set(projects.map((project) => project.activeReleaseId).filter(Boolean) as string[]),
            new Set(projects.map((project) => project.candidateReleaseId).filter(Boolean) as string[]),
        );
        const vpsIds = (await prisma.vPS.findMany({ select: { id: true } })).map((vps) => vps.id);
        for (const vpsId of vpsIds) {
            await this.cleanupVps(vpsId, new Set(ids));
        }
        await HardeningService.runDataRetentionCleanup();
    }

    static async releaseStaleReservations() {
        const stale = await prisma.capacityReservation.findMany({
            where: { status: 'RESERVED', expiresAt: { lt: new Date() } },
            include: { deployment: { include: { jobs: { where: { status: { in: ['QUEUED', 'RUNNING'] } }, take: 1 } } } },
        });
        const releasable = stale.filter((item) => item.deployment.jobs.length === 0 && !['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING'].includes(item.deployment.status));
        if (releasable.length) {
            await prisma.capacityReservation.updateMany({
                where: { id: { in: releasable.map((item) => item.id) } },
                data: { status: 'RELEASED', releasedAt: new Date() },
            });
        }
    }

    private static async cleanupVps(vpsId: string, eligibleIds: Set<string>) {
        const lock = await CacheService.acquireRenewableLock(`vps-maintenance:${vpsId}`, 120_000);
        if (!lock) return;
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps) {
            await lock.release();
            return;
        }
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
            const releases = await prisma.deploymentRelease.findMany({ where: { vpsId, id: { in: [...eligibleIds] }, purgedAt: null } });
            for (const release of releases) {
                const projectLock = await CacheService.acquireRenewableLock(`project-deploy:${release.projectId}`, 120_000);
                if (!projectLock) continue;
                try {
                    await this.purgeRelease(ssh, release, vps.username);
                } finally {
                    await projectLock.release();
                }
            }
            await this.removeLabelledOrphans(ssh, vpsId, vps.username);
        } catch (err) {
            logger.error({ err, vpsId }, 'VPS maintenance cleanup failed');
        } finally {
            ssh.disconnect();
            await lock.release();
        }
    }

    private static async purgeRelease(ssh: SSHService, release: any, username: string) {
        try {
            const current = await prisma.deploymentRelease.findUnique({
                where: { id: release.id },
                include: { project: { select: { activeReleaseId: true, candidateReleaseId: true } } },
            });
            if (!current || current.purgedAt || current.retentionPinnedAt || current.project.activeReleaseId === current.id || current.project.candidateReleaseId === current.id || ['ACTIVE', 'CANDIDATE', 'READY', 'ACTIVATING'].includes(current.status)) return;
            release = current;
            if (release.runtimeRef?.startsWith('compose:')) {
                const composeProject = release.runtimeRef.slice('compose:'.length);
                if (/^[a-zA-Z0-9_.-]+$/.test(composeProject)) {
                    const containers = await ssh.execute(`docker ps -aq --filter label=com.docker.compose.project=${shellQuote(composeProject)}`);
                    const ids = containers.stdout.trim().split(/\s+/).filter(Boolean);
                    for (const id of ids) {
                        const managed = await ssh.execute(`docker inspect -f '{{index .Config.Labels "com.deployforge.managed"}}' ${shellQuote(id)} 2>/dev/null`);
                        if (managed.stdout.trim() === 'true') await ssh.execute(`docker rm -f ${shellQuote(id)} >/dev/null 2>&1 || true`);
                    }
                }
                const sharedDeployment = await prisma.deploymentRelease.count({ where: { deploymentId: release.deploymentId, id: { not: release.id }, purgedAt: null } });
                if (!sharedDeployment) {
                    const images = await ssh.execute(`docker image ls -q --filter label=com.deployforge.managed=true --filter label=com.deployforge.deployment=${shellQuote(release.deploymentId)}`);
                    for (const imageId of [...new Set(images.stdout.trim().split(/\s+/).filter(Boolean))]) {
                        await ssh.execute(`docker image rm ${shellQuote(imageId)} >/dev/null 2>&1 || true`);
                    }
                }
            } else if (release.runtimeRef) {
                const stillReferenced = await prisma.deploymentRelease.count({ where: { runtimeRef: release.runtimeRef, id: { not: release.id }, purgedAt: null } });
                if (!stillReferenced) {
                    const managed = await ssh.execute(`docker inspect -f '{{index .Config.Labels "com.deployforge.managed"}}' ${shellQuote(release.runtimeRef)} 2>/dev/null`);
                    if (managed.stdout.trim() === 'true') await ssh.execute(`docker rm -f ${shellQuote(release.runtimeRef)} >/dev/null 2>&1 || true`);
                }
            }
            if (release.imageTag) {
                const shared = await prisma.deploymentRelease.count({ where: { imageTag: release.imageTag, id: { not: release.id }, purgedAt: null } });
                const managed = await ssh.execute(`docker image inspect -f '{{index .Config.Labels "com.deployforge.managed"}}' ${shellQuote(release.imageTag)} 2>/dev/null`);
                if (!shared && managed.stdout.trim() === 'true') await ssh.execute(`docker image rm ${shellQuote(release.imageTag)} >/dev/null 2>&1 || true`);
            }
            for (const target of [release.workspacePath, release.artifactPath]) {
                if (!target) continue;
                const base = `/home/${username.replace(/[^a-zA-Z0-9_-]/g, '')}/deployforge/projects/${release.projectId}/`;
                if (target.startsWith(base) && target !== base) {
                    await ssh.execute(`resolved=$(realpath -m ${shellQuote(target)}); case "$resolved" in ${shellQuote(base)}*) rm -rf -- ${shellQuote(target)};; *) exit 42;; esac`);
                }
            }
            await prisma.deploymentRelease.update({ where: { id: release.id }, data: { purgedAt: new Date(), purgeError: null, purgeNextRetryAt: null } });
        } catch (err: any) {
            const retryCount = (release.purgeRetryCount || 0) + 1;
            const retryDelay = Math.min(24 * 60 * 60 * 1000, 15 * 60 * 1000 * 2 ** Math.max(0, retryCount - 1));
            await prisma.deploymentRelease.update({
                where: { id: release.id },
                data: { purgeError: String(err?.message || err).slice(0, 300), purgeRetryCount: retryCount, purgeNextRetryAt: new Date(Date.now() + retryDelay) },
            }).catch(() => undefined);
        }
    }

    private static async removeLabelledOrphans(ssh: SSHService, vpsId: string, username: string) {
        const liveReleases = await prisma.deploymentRelease.findMany({ where: { vpsId, purgedAt: null }, select: { deploymentId: true, projectId: true, workspacePath: true, artifactPath: true } });
        const liveDeploymentIds = new Set(liveReleases.map((item) => item.deploymentId));
        const result = await ssh.execute(`docker ps -a --filter label=com.deployforge.managed=true --format '{{.ID}} {{.CreatedAt}} {{index .Labels "com.deployforge.deployment"}}'`);
        for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
            const parts = line.trim().split(/\s+/);
            const id = parts[0];
            const deploymentId = parts[parts.length - 1];
            const inspected = await ssh.execute(`docker inspect -f '{{.Created}}' ${shellQuote(id)} 2>/dev/null`);
            const created = Date.parse(inspected.stdout.trim());
            if (!liveDeploymentIds.has(deploymentId) && Number.isFinite(created) && created < Date.now() - 24 * 60 * 60 * 1000) {
                await ssh.execute(`docker rm -f ${shellQuote(id)} >/dev/null 2>&1 || true`);
            }
        }

        const liveProjects = new Set(liveReleases.map((item) => `df-${item.projectId}`));
        const networks = await ssh.execute(`docker network ls --filter label=com.deployforge.managed=true --format '{{.ID}} {{index .Labels "com.deployforge.project"}}'`);
        for (const line of networks.stdout.trim().split('\n').filter(Boolean)) {
            const [id, projectLabel] = line.trim().split(/\s+/, 2);
            const inspected = await ssh.execute(`docker network inspect -f '{{.Created}}' ${shellQuote(id)} 2>/dev/null`);
            const created = Date.parse(inspected.stdout.trim());
            if (!liveProjects.has(projectLabel) && Number.isFinite(created) && created < Date.now() - 24 * 60 * 60 * 1000) {
                await ssh.execute(`docker network rm ${shellQuote(id)} >/dev/null 2>&1 || true`);
            }
        }

        const safeUser = username.replace(/[^a-zA-Z0-9_-]/g, '');
        const root = `/home/${safeUser}/deployforge/projects`;
        const livePaths = new Set(liveReleases.flatMap((item) => [item.workspacePath, item.artifactPath]).filter(Boolean));
        const workspaces = await ssh.execute(`test ! -d ${shellQuote(root)} || find ${shellQuote(root)} -mindepth 3 -maxdepth 3 -type d -path '*/releases/*' -printf '%T@ %p\\n'`);
        for (const line of workspaces.stdout.trim().split('\n').filter(Boolean)) {
            const separator = line.indexOf(' ');
            const modified = Number(line.slice(0, separator)) * 1000;
            const target = line.slice(separator + 1);
            if (!livePaths.has(target) && /^\/home\/[a-zA-Z0-9_-]+\/deployforge\/projects\/[0-9a-f-]{36}\/releases\/[0-9]+-[0-9a-f]{8}$/i.test(target) && modified < Date.now() - 24 * 60 * 60 * 1000) {
                await ssh.execute(`rm -rf -- ${shellQuote(target)}`);
            }
        }
    }
}
