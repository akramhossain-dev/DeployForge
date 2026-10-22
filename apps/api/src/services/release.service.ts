import crypto from 'node:crypto';
import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { DeploymentError } from './deployment/error';
import { runCommand } from './deployment/runner';
import { shellQuote } from './deployment/utils';

type BeginReleaseInput = {
    deploymentId: string;
    projectId: string;
    vpsId: string;
    kind: 'STATIC' | 'CONTAINER' | 'COMPOSE';
    version: string;
    ingressPort: number;
    imageTag?: string;
    artifactPath?: string;
    workspacePath?: string;
    manifestPath?: string;
    composeService?: string;
    composePort?: number;
    env?: string | null;
    resourceTier?: 'STATIC' | 'SERVER' | 'FULLSTACK';
    cpuLimitMillis?: number;
    memoryLimitMiB?: number;
    pidsLimit?: number;
    storageLimitMiB?: number;
    activationReason?: 'DEPLOY' | 'ROLLBACK';
};

type ActivateReleaseInput = {
    releaseId: string;
    deploymentId: string;
    domain: string;
    routerId: string;
};

const ROUTE_DIR = '/etc/deployforge/traefik/dynamic';

export class ReleaseService {
    static alias(releaseId: string) {
        return `df-rel-${releaseId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20).toLowerCase()}`;
    }

    static async begin(input: BeginReleaseInput) {
        return prisma.$transaction(async (tx) => {
            const project = await tx.project.findUnique({
                where: { id: input.projectId },
                select: { candidateReleaseId: true },
            });
            if (project?.candidateReleaseId) {
                await tx.deploymentRelease.updateMany({
                    where: { id: project.candidateReleaseId, status: { not: 'ACTIVE' } },
                    data: { status: 'FAILED', readinessStatus: 'FAILED', readinessError: 'Superseded by a newer queued release' },
                });
            }

            const release = await tx.deploymentRelease.create({
                data: {
                    deploymentId: input.deploymentId,
                    projectId: input.projectId,
                    vpsId: input.vpsId,
                    kind: input.kind,
                    version: input.version,
                    ingressPort: input.ingressPort,
                    imageTag: input.imageTag,
                    artifactPath: input.artifactPath,
                    workspacePath: input.workspacePath,
                    manifestPath: input.manifestPath,
                    composeService: input.composeService,
                    composePort: input.composePort,
                    env: input.env,
                    resourceTier: input.resourceTier,
                    cpuLimitMillis: input.cpuLimitMillis,
                    memoryLimitMiB: input.memoryLimitMiB,
                    pidsLimit: input.pidsLimit,
                    storageLimitMiB: input.storageLimitMiB,
                    activationReason: input.activationReason || 'DEPLOY',
                    status: 'BUILDING',
                    readinessStatus: 'PENDING',
                },
            });
            await tx.project.update({
                where: { id: input.projectId },
                data: { candidateReleaseId: release.id },
            });
            return release;
        });
    }

    static async reconcileProject(ssh: SSHService, _deploymentId: string, projectId: string, domain: string, routerId: string) {
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { activeRelease: true, candidateRelease: true },
        });
        const candidate = project?.candidateRelease;
        if (!candidate || !['CANDIDATE', 'READY', 'ACTIVATING'].includes(candidate.status)) return;

        const active = project?.activeRelease;
        const routeFile = `${ROUTE_DIR}/${this.routeKey(projectId)}.yml`;
        if (!active && candidate.runtimeRef) {
            const candidateContainer = await this.ingressContainer(ssh, candidate.runtimeRef, candidate.composeService);
            const candidateAlias = this.alias(candidate.id);
            await ssh.execute(`docker network connect --alias ${shellQuote(candidateAlias)} deployforge-net ${shellQuote(candidateContainer)} 2>/dev/null || true`);
            try {
                await ssh.execute(`mkdir -p ${shellQuote(ROUTE_DIR)}`);
                await this.writeRoute(ssh, routeFile, this.renderRoute(routerId, domain, candidateAlias, candidate.ingressPort));
                await this.probeViaGateway(ssh, domain);
                await prisma.$transaction([
                    prisma.deploymentRelease.update({
                        where: { id: candidate.id },
                        data: { status: 'ACTIVE', activatedAt: new Date(), readinessStatus: 'PASSED', readinessCheckedAt: new Date(), readinessError: null },
                    }),
                    prisma.project.update({ where: { id: projectId }, data: { activeReleaseId: candidate.id, candidateReleaseId: null } }),
                ]);
                return;
            } catch {
                await ssh.execute(`rm -f ${shellQuote(routeFile)} && docker network disconnect deployforge-net ${shellQuote(candidateContainer)} 2>/dev/null || true`);
            }
        }
        if (active?.runtimeRef) {
            const activeContainer = await this.ingressContainer(ssh, active.runtimeRef, active.composeService);
            const activeAlias = this.alias(active.id);
            await ssh.execute(`docker network connect --alias ${shellQuote(activeAlias)} deployforge-net ${shellQuote(activeContainer)} 2>/dev/null || true`);
            await this.writeRoute(ssh, routeFile, this.renderRoute(routerId, domain, activeAlias, active.ingressPort));
        }
        if (candidate.runtimeRef) {
            const candidateContainer = await this.ingressContainer(ssh, candidate.runtimeRef, candidate.composeService).catch(() => '');
            if (candidateContainer) await ssh.execute(`docker network disconnect deployforge-net ${shellQuote(candidateContainer)} 2>/dev/null || true`);
        }
        await prisma.$transaction([
            prisma.deploymentRelease.update({
                where: { id: candidate.id },
                data: { status: 'FAILED', readinessStatus: 'FAILED', readinessError: 'Recovered an interrupted activation' },
            }),
            prisma.project.update({ where: { id: projectId }, data: { candidateReleaseId: null } }),
        ]);
    }

    static async updateDomainRoute(ssh: SSHService, projectId: string, domain: string, routerId: string) {
        const project = await prisma.project.findUnique({ where: { id: projectId }, include: { activeRelease: true } });
        const active = project?.activeRelease;
        if (!active?.runtimeRef) throw new Error('The project has no active release route');
        const container = await this.ingressContainer(ssh, active.runtimeRef, active.composeService);
        const alias = this.alias(active.id);
        await ssh.execute(`docker network connect --alias ${shellQuote(alias)} deployforge-net ${shellQuote(container)} 2>/dev/null || true`);
        const routeFile = `${ROUTE_DIR}/${this.routeKey(projectId)}.yml`;
        const backupFile = `${routeFile}.domain-previous`;
        await ssh.execute(`mkdir -p ${shellQuote(ROUTE_DIR)} && if [ -f ${shellQuote(routeFile)} ]; then cp ${shellQuote(routeFile)} ${shellQuote(backupFile)}; else rm -f ${shellQuote(backupFile)}; fi`);
        try {
            await this.writeRoute(ssh, routeFile, this.renderRoute(routerId, domain, alias, active.ingressPort));
            await this.probeViaGateway(ssh, domain);
            await ssh.execute(`rm -f ${shellQuote(backupFile)}`);
        } catch (error) {
            await ssh.execute(`if [ -f ${shellQuote(backupFile)} ]; then mv ${shellQuote(backupFile)} ${shellQuote(routeFile)}; else rm -f ${shellQuote(routeFile)}; fi`);
            throw error;
        }
    }

    static async recordRuntime(releaseId: string, runtimeRef: string, containerId?: string) {
        return prisma.deploymentRelease.update({
            where: { id: releaseId },
            data: { runtimeRef, containerId: containerId || null, status: 'CANDIDATE' },
        });
    }

    static async markReadinessFailed(releaseId: string, error: unknown) {
        const message = this.safeError(error);
        const release = await prisma.deploymentRelease.update({
            where: { id: releaseId },
            data: {
                status: 'FAILED',
                readinessStatus: 'FAILED',
                readinessCheckedAt: new Date(),
                readinessError: message,
            },
        }).catch(() => null);
        if (release) {
            await prisma.project.updateMany({
                where: { id: release.projectId, candidateReleaseId: releaseId },
                data: { candidateReleaseId: null },
            });
        }
    }

    static async activate(ssh: SSHService, input: ActivateReleaseInput) {
        const release = await prisma.deploymentRelease.findUnique({
            where: { id: input.releaseId },
            include: { project: { include: { activeRelease: true } } },
        });
        if (!release?.runtimeRef) {
            throw new DeploymentError('release_activation', 'Candidate runtime is missing', 'RELEASE_RUNTIME_MISSING');
        }

        const alias = this.alias(release.id);
        const active = release.project.activeRelease;
        const containerId = await this.ingressContainer(ssh, release.runtimeRef, release.composeService);
        const routeFile = `${ROUTE_DIR}/${this.routeKey(release.projectId)}.yml`;
        const backupFile = `${routeFile}.previous`;
        const token = crypto.randomBytes(24).toString('hex');
        let stableBackend: { alias: string; port: number } | undefined;

        await prisma.deploymentRelease.update({
            where: { id: release.id },
            data: { status: 'READY', readinessStatus: 'PASSED', readinessCheckedAt: new Date(), readinessError: null },
        });

        await runCommand(ssh, input.deploymentId, 'system', `docker network connect --alias ${shellQuote(alias)} deployforge-net ${shellQuote(containerId)} 2>/dev/null || true`);
        if (active?.runtimeRef) {
            const activeContainer = await this.ingressContainer(ssh, active.runtimeRef, active.composeService);
            const activeAlias = this.alias(active.id);
            await ssh.execute(`docker network connect --alias ${shellQuote(activeAlias)} deployforge-net ${shellQuote(activeContainer)} 2>/dev/null || true`);
            stableBackend = { alias: activeAlias, port: active.ingressPort };
        }
        await prisma.deploymentRelease.update({ where: { id: release.id }, data: { status: 'ACTIVATING' } });

        try {
            await runCommand(ssh, input.deploymentId, 'system', `mkdir -p ${shellQuote(ROUTE_DIR)} && if [ -f ${shellQuote(routeFile)} ]; then cp ${shellQuote(routeFile)} ${shellQuote(backupFile)}; else rm -f ${shellQuote(backupFile)}; fi`);
            await this.writeRoute(ssh, routeFile, this.renderRoute(input.routerId, input.domain, alias, release.ingressPort, token, stableBackend));
            await this.probeViaGateway(ssh, input.domain, token);

            await this.writeRoute(ssh, routeFile, this.renderRoute(input.routerId, input.domain, alias, release.ingressPort));
            await this.probeViaGateway(ssh, input.domain);

            await prisma.$transaction(async (tx) => {
                if (active && active.id !== release.id) {
                    await tx.deploymentRelease.update({
                        where: { id: active.id },
                        data: { status: 'SUPERSEDED', supersededAt: new Date() },
                    });
                }
                await tx.deploymentRelease.update({
                    where: { id: release.id },
                    data: { status: 'ACTIVE', activatedAt: new Date(), supersededAt: null, readinessStatus: 'PASSED' },
                });
                await tx.project.update({
                    where: { id: release.projectId },
                    data: { activeReleaseId: release.id, candidateReleaseId: null },
                });
            });

            if (active?.runtimeRef) {
                const oldContainer = await this.ingressContainer(ssh, active.runtimeRef, active.composeService).catch(() => '');
                if (oldContainer && oldContainer !== containerId) {
                    await ssh.execute(`docker network disconnect deployforge-net ${shellQuote(oldContainer)} 2>/dev/null || true`);
                }
            }
            await ssh.execute(`rm -f ${shellQuote(backupFile)}`);
            return release.id;
        } catch (error) {
            await ssh.execute(`if [ -f ${shellQuote(backupFile)} ]; then mv ${shellQuote(backupFile)} ${shellQuote(routeFile)}; else rm -f ${shellQuote(routeFile)}; fi`);
            await ssh.execute(`docker network disconnect deployforge-net ${shellQuote(containerId)} 2>/dev/null || true`);
            await this.markReadinessFailed(release.id, error);
            throw error;
        }
    }

    static renderRoute(
        routerId: string,
        domain: string,
        alias: string,
        port: number,
        canaryToken?: string,
        stableBackend?: { alias: string; port: number },
    ) {
        const safeRouter = this.routeKey(routerId);
        const host = domain.replace(/[^a-zA-Z0-9.-]/g, '');
        const stableAlias = stableBackend?.alias || alias;
        const stablePort = stableBackend?.port || port;
        const canary = canaryToken ? `
    ${safeRouter}-canary:
      rule: "Host(\`${host}\`) && Header(\`X-DeployForge-Probe\`, \`${canaryToken}\`)"
      priority: 11000
      entryPoints: [websecure]
      service: ${safeRouter}-candidate
      tls:
        certResolver: letsencrypt` : '';
        return `http:
  routers:
    ${safeRouter}:
      rule: "Host(\`${host}\`)"
      priority: 10000
      entryPoints: [websecure]
      service: ${safeRouter}-stable
      tls:
        certResolver: letsencrypt${canary}
  services:
    ${safeRouter}-stable:
      loadBalancer:
        servers:
          - url: "http://${stableAlias}:${stablePort}"
    ${safeRouter}-candidate:
      loadBalancer:
        servers:
          - url: "http://${alias}:${port}"
`;
    }

    private static async writeRoute(ssh: SSHService, routeFile: string, content: string) {
        const encoded = Buffer.from(content, 'utf8').toString('base64');
        const tempFile = `${routeFile}.${crypto.randomUUID()}.tmp`;
        const result = await ssh.execute(`printf %s ${shellQuote(encoded)} | base64 -d > ${shellQuote(tempFile)} && chmod 600 ${shellQuote(tempFile)} && mv ${shellQuote(tempFile)} ${shellQuote(routeFile)}`);
        if (result.code !== 0) throw new Error('Could not atomically update the gateway route');
    }

    private static async ingressContainer(ssh: SSHService, runtimeRef: string, composeService?: string | null) {
        if (!runtimeRef.startsWith('compose:')) return runtimeRef;
        const projectName = runtimeRef.slice('compose:'.length);
        const result = await ssh.execute(`docker ps --filter label=com.docker.compose.project=${shellQuote(projectName)} --filter label=com.docker.compose.service=${shellQuote(composeService || '')} -q | head -n1`);
        const id = result.stdout.trim();
        if (!id) throw new Error('Compose ingress container is not running');
        return id;
    }

    private static async probeViaGateway(ssh: SSHService, domain: string, token?: string) {
        const header = token ? ` -H ${shellQuote(`X-DeployForge-Probe: ${token}`)}` : '';
        const command = `for i in $(seq 1 15); do code=$(curl -k -sS -o /dev/null -w '%{http_code}' --resolve ${shellQuote(`${domain}:443:127.0.0.1`)}${header} ${shellQuote(`https://${domain}/`)} || true); case "$code" in 2*|3*) exit 0;; esac; sleep 2; done; exit 1`;
        const result = await ssh.execute(command);
        if (result.code !== 0) throw new Error(token ? 'Candidate gateway probe failed' : 'Public route probe failed');
    }

    private static routeKey(value: string) {
        return `df-${value.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 48).toLowerCase()}`;
    }

    private static safeError(error: unknown) {
        return String(error instanceof Error ? error.message : error || 'Release failed')
            .replace(/(token|password|secret|authorization)\s*[=:]\s*\S+/gi, '$1=[REDACTED]')
            .slice(0, 300);
    }
}
