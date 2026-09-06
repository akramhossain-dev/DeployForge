import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import dns from 'dns';
import { promisify } from 'util';
import { Prisma } from '@deployforge/database';

const resolveA = promisify(dns.resolve4);
const resolveCname = promisify(dns.resolveCname);
const encryptionService = new EncryptionService(config.encryption.key);

export class DomainService {
    static async verifyDNS(domainName: string, expectedIp: string) {
        try {
            const addresses = await resolveA(domainName);
            return addresses.includes(expectedIp);
        } catch (err) {
            return false;
        }
    }

    static async verifyDNSDetailed(domainName: string, expectedIp: string) {
        const result: {
            isValid: boolean;
            resolvedIps: string[];
            cname: string | null;
            expectedIp: string;
            propagated: boolean;
            checkedAt: string;
        } = {
            isValid: false,
            resolvedIps: [],
            cname: null,
            expectedIp,
            propagated: false,
            checkedAt: new Date().toISOString(),
        };

        try {
            const addresses = await resolveA(domainName);
            result.resolvedIps = addresses;
            result.isValid = addresses.includes(expectedIp);
            result.propagated = result.isValid;
        } catch (_err) {
            // DNS resolution failed – no A records
        }

        try {
            const cnames = await resolveCname(domainName);
            result.cname = cnames[0] || null;
        } catch (_err) {
            // No CNAME record
        }

        return result;
    }

    static async attachDomain(userId: string, deploymentId: string, domainName: string) {
        const cleanDomain = normalizeDomain(domainName);
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { vps: true, domains: true, project: true },
        });
        if (!deployment) throw domainError('domain_bind', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        
        const isOwner = deployment.userId === userId;
        const isMember = await prisma.projectMember.findFirst({
            where: {
                projectId: deployment.projectId,
                userId,
                role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] }
            }
        });
        if (!isOwner && !isMember) throw domainError('domain_bind', 'Unauthorized', 'UNAUTHORIZED');

        const existing = await prisma.domain.findFirst({
            where: {
                domainName: cleanDomain,
                deploymentId: { not: deploymentId },
                deployment: { status: { not: 'DELETED' } },
            },
        });
        if (existing) throw domainError('domain_validation', 'Domain is already assigned to another deployment', 'DOMAIN_ALREADY_EXISTS');

        const vps = deployment.vps;
        if (!vps) throw domainError('domain_bind', 'The VPS linked to this deployment no longer exists.', 'VPS_NOT_FOUND');

        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            // Ensure Traefik and deployforge-net exist
            await ssh.execute('docker network inspect deployforge-net >/dev/null 2>&1 || docker network create --driver bridge --subnet 172.28.0.0/16 deployforge-net');

            const routerId = `df-${deployment.projectId}`;
            const safeProjectName = deployment.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
            const shortDeployId = deploymentId.slice(0, 8);

            // If deployment is running, update Traefik router Host rule on the container
            if (deployment.status === 'RUNNING' && deployment.containerId) {
                const isStatic = deployment.type === 'STATIC' || ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '');

                if (isStatic) {
                    const staticContainerName = `df-static-${safeProjectName}-${shortDeployId}`;
                    const staticDir = `/home/${vps.username}/deployforge/projects/${deployment.projectId}/static/${deployment.lastStableVersion || shortDeployId}`;
                    await ssh.execute(`docker rm -f ${shellQuote(staticContainerName)} 2>/dev/null || true`);
                    const createStaticCmd = `docker run -d \\
                        --name ${shellQuote(staticContainerName)} \\
                        --restart unless-stopped \\
                        --network deployforge-net \\
                        --label "traefik.enable=true" \\
                        --label "traefik.http.routers.${routerId}.rule=Host(\`${cleanDomain}\`)" \\
                        --label "traefik.http.routers.${routerId}.entrypoints=websecure" \\
                        --label "traefik.http.routers.${routerId}.tls=true" \\
                        --label "traefik.http.routers.${routerId}.tls.certresolver=letsencrypt" \\
                        --label "traefik.http.services.${routerId}.loadbalancer.server.port=80" \\
                        -v ${shellQuote(staticDir)}:/usr/share/nginx/html:ro \\
                        nginx:1.27-alpine`;
                    const { stdout: newCId } = await ssh.execute(createStaticCmd);
                    if (newCId.trim()) {
                        await prisma.deployment.update({ where: { id: deploymentId }, data: { containerId: newCId.trim() } });
                    }
                } else if (!deployment.containerId.startsWith('compose:')) {
                    // Inspect existing container image and env
                    const { stdout: inspectOut } = await ssh.execute(`docker inspect --format '{{.Config.Image}}' ${shellQuote(deployment.containerId)}`).catch(() => ({ stdout: '' }));
                    const imageTag = inspectOut.trim();
                    if (imageTag) {
                        const dockerName = `df-${safeProjectName}-${shortDeployId}`;
                        const appPort = ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '') ? 80 : 3000;
                        await ssh.execute(`docker rm -f ${shellQuote(deployment.containerId)} 2>/dev/null || true`);
                        const envPath = `/etc/deployforge/env/${deployment.id}.env`;
                        const hasEnv = (await ssh.execute(`[ -f ${shellQuote(envPath)} ]`)).code === 0;
                        const envFlag = hasEnv ? ` --env-file ${shellQuote(envPath)}` : '';

                        const createCmd = `docker run -d \\
                            --name ${shellQuote(dockerName)} \\
                            --restart unless-stopped \\
                            --network deployforge-net \\
                            --label "traefik.enable=true" \\
                            --label "traefik.http.routers.${routerId}.rule=Host(\`${cleanDomain}\`)" \\
                            --label "traefik.http.routers.${routerId}.entrypoints=websecure" \\
                            --label "traefik.http.routers.${routerId}.tls=true" \\
                            --label "traefik.http.routers.${routerId}.tls.certresolver=letsencrypt" \\
                            --label "traefik.http.services.${routerId}.loadbalancer.server.port=${appPort}" \\
                            --security-opt no-new-privileges \\
                            --cap-drop ALL${envFlag} \\
                            ${shellQuote(imageTag)}`;
                        const { stdout: newCId } = await ssh.execute(createCmd);
                        if (newCId.trim()) {
                            await prisma.deployment.update({ where: { id: deploymentId }, data: { containerId: newCId.trim() } });
                        }
                    }
                }
            }

            try {
                const savedDomain = await prisma.$transaction(async (tx) => {
                    const conflict = await tx.domain.findFirst({
                        where: {
                            domainName: cleanDomain,
                            deploymentId: { not: deploymentId },
                            deployment: { status: { not: 'DELETED' } },
                        },
                    });
                    if (conflict) throw domainError('domain_validation', 'Domain is already assigned to another deployment', 'DOMAIN_ALREADY_EXISTS');

                    await tx.domain.updateMany({
                        where: { deploymentId, domainName: { not: cleanDomain } },
                        data: { status: 'DELETED' },
                    });
                    await tx.deployment.update({
                        where: { id: deploymentId },
                        data: { domain: cleanDomain, hostType: 'domain' },
                    });

                    const current = await tx.domain.findUnique({ where: { domainName: cleanDomain } });
                    if (current) {
                        return tx.domain.update({
                            where: { id: current.id },
                            data: {
                                deploymentId,
                                vpsId: vps.id,
                                domainName: cleanDomain,
                                status: 'ACTIVE',
                                sslStatus: 'ISSUED',
                            },
                        });
                    }

                    return tx.domain.create({
                        data: {
                            deploymentId,
                            vpsId: vps.id,
                            domainName: cleanDomain,
                            status: 'ACTIVE',
                            sslStatus: 'ISSUED',
                        },
                    });
                });

                return savedDomain;
            } catch (err: any) {
                if (err?.code === 'P2002' || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
                    throw domainError('domain_validation', 'Domain is already assigned to another deployment', 'DOMAIN_ALREADY_EXISTS');
                }
                throw err;
            }
        } finally {
            ssh.disconnect();
        }
    }

    static async removeDomain(userId: string, domainId: string) {
        const domain = await prisma.domain.findFirst({
            where: {
                id: domainId,
                OR: [
                    { deployment: { userId } },
                    {
                        deployment: {
                            project: {
                                OR: [
                                    { userId },
                                    { members: { some: { userId, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                                ]
                            }
                        }
                    }
                ]
            },
            include: { vps: true, deployment: { include: { project: true } } },
        });
        if (!domain) throw Object.assign(new Error('Domain not found'), { statusCode: 404 });

        const vps = domain.vps;
        const deployment = domain.deployment;

        if (vps && deployment && deployment.status === 'RUNNING' && deployment.containerId) {
            const ssh = new SSHService();
            try {
                const auth = vps.authType === 'key'
                    ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                    : { password: this.decrypt(vps.encryptedPassword!) };

                await ssh.connect({ host: vps.ipAddress, port: vps.port, username: vps.username, ...auth });

                const safeProjectName = deployment.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                const shortDeployId = deployment.id.slice(0, 8);
                const fallbackDomain = `${safeProjectName}-${shortDeployId}.${vps.ipAddress}.sslip.io`;
                const routerId = `df-${deployment.projectId}`;
                const isStatic = deployment.type === 'STATIC' || ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '');

                if (isStatic) {
                    const staticContainerName = `df-static-${safeProjectName}-${shortDeployId}`;
                    const staticDir = `/home/${vps.username}/deployforge/projects/${deployment.projectId}/static/${deployment.lastStableVersion || shortDeployId}`;
                    await ssh.execute(`docker rm -f ${shellQuote(staticContainerName)} 2>/dev/null || true`);
                    const createStaticCmd = `docker run -d \\
                        --name ${shellQuote(staticContainerName)} \\
                        --restart unless-stopped \\
                        --network deployforge-net \\
                        --label "traefik.enable=true" \\
                        --label "traefik.http.routers.${routerId}.rule=Host(\`${fallbackDomain}\`)" \\
                        --label "traefik.http.routers.${routerId}.entrypoints=websecure" \\
                        --label "traefik.http.routers.${routerId}.tls=true" \\
                        --label "traefik.http.routers.${routerId}.tls.certresolver=letsencrypt" \\
                        --label "traefik.http.services.${routerId}.loadbalancer.server.port=80" \\
                        -v ${shellQuote(staticDir)}:/usr/share/nginx/html:ro \\
                        nginx:1.27-alpine`;
                    const { stdout: newCId } = await ssh.execute(createStaticCmd);
                    if (newCId.trim()) {
                        await prisma.deployment.update({ where: { id: deployment.id }, data: { containerId: newCId.trim() } });
                    }
                } else if (!deployment.containerId.startsWith('compose:')) {
                    const { stdout: inspectOut } = await ssh.execute(`docker inspect --format '{{.Config.Image}}' ${shellQuote(deployment.containerId)}`).catch(() => ({ stdout: '' }));
                    const imageTag = inspectOut.trim();
                    if (imageTag) {
                        const dockerName = `df-${safeProjectName}-${shortDeployId}`;
                        const appPort = ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '') ? 80 : 3000;
                        await ssh.execute(`docker rm -f ${shellQuote(deployment.containerId)} 2>/dev/null || true`);
                        const envPath = `/etc/deployforge/env/${deployment.id}.env`;
                        const hasEnv = (await ssh.execute(`[ -f ${shellQuote(envPath)} ]`)).code === 0;
                        const envFlag = hasEnv ? ` --env-file ${shellQuote(envPath)}` : '';

                        const createCmd = `docker run -d \\
                            --name ${shellQuote(dockerName)} \\
                            --restart unless-stopped \\
                            --network deployforge-net \\
                            --label "traefik.enable=true" \\
                            --label "traefik.http.routers.${routerId}.rule=Host(\`${fallbackDomain}\`)" \\
                            --label "traefik.http.routers.${routerId}.entrypoints=websecure" \\
                            --label "traefik.http.routers.${routerId}.tls=true" \\
                            --label "traefik.http.routers.${routerId}.tls.certresolver=letsencrypt" \\
                            --label "traefik.http.services.${routerId}.loadbalancer.server.port=${appPort}" \\
                            --security-opt no-new-privileges \\
                            --cap-drop ALL${envFlag} \\
                            ${shellQuote(imageTag)}`;
                        const { stdout: newCId } = await ssh.execute(createCmd);
                        if (newCId.trim()) {
                            await prisma.deployment.update({ where: { id: deployment.id }, data: { containerId: newCId.trim() } });
                        }
                    }
                }
            } catch {
                // Non-fatal
            } finally {
                ssh.disconnect();
            }
        }

        await prisma.domain.update({ where: { id: domainId }, data: { status: 'DELETED' } });

        await prisma.deployment.updateMany({
            where: { id: domain.deploymentId, domain: domain.domainName },
            data: { domain: null, hostType: 'ip' },
        });

        return { warning: null };
    }

    static async issueSSL(userId: string, domainId: string) {
        const domain = await prisma.domain.findFirst({
            where: {
                id: domainId,
                OR: [
                    { deployment: { userId } },
                    {
                        deployment: {
                            project: {
                                OR: [
                                    { userId },
                                    { members: { some: { userId, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                                ]
                            }
                        }
                    }
                ]
            },
            include: { vps: true },
        });

        if (!domain) {
            throw Object.assign(new Error('Domain not found'), { statusCode: 404, errorCode: 'DOMAIN_NOT_FOUND' });
        }

        if (domain.status !== 'ACTIVE') {
            throw Object.assign(
                new Error(`Domain is not active (current status: ${domain.status}). Ensure the domain is attached before issuing SSL.`),
                { statusCode: 422, errorCode: 'DOMAIN_NOT_ACTIVE' }
            );
        }

        const vps = domain.vps;
        if (!vps) {
            throw Object.assign(new Error('VPS not found for this domain'), { statusCode: 404, errorCode: 'VPS_NOT_FOUND' });
        }

        const isDnsValid = await this.verifyDNS(domain.domainName, vps.ipAddress);
        if (!isDnsValid) {
            throw Object.assign(
                new Error(`DNS check failed: ${domain.domainName} does not currently point to VPS IP ${vps.ipAddress}. Please ensure your A record is configured.`),
                { statusCode: 422, errorCode: 'DNS_NOT_POINTED' }
            );
        }

        // Traefik automatically negotiates Let's Encrypt certificates upon HTTPS traffic.
        // We trigger an outbound handshake request to initiate certificate issuance.
        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({ host: vps.ipAddress, port: vps.port, username: vps.username, ...auth });
            await ssh.execute(`curl -k -fsS https://${domain.domainName} >/dev/null 2>&1 || true`);
        } catch {
            // Non-fatal
        } finally {
            ssh.disconnect();
        }

        await prisma.domain.update({ where: { id: domainId }, data: { sslStatus: 'ISSUED' } });
        return { success: true, sslStatus: 'ISSUED' };
    }

    static async setAutoHttps(userId: string, domainId: string, enabled: boolean) {
        const domain = await prisma.domain.findFirst({
            where: {
                id: domainId,
                OR: [
                    { deployment: { userId } },
                    {
                        deployment: {
                            project: {
                                OR: [
                                    { userId },
                                    { members: { some: { userId, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                                ]
                            }
                        }
                    }
                ]
            },
            include: { vps: true },
        });
        if (!domain) throw Object.assign(new Error('Domain not found'), { statusCode: 404 });

        return prisma.domain.update({
            where: { id: domainId },
            data: { status: domain.status },
        });
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}

function normalizeDomain(domainName: string) {
    const clean = String(domainName || '').trim().toLowerCase();
    if (!clean || /^https?:\/\//i.test(clean) || clean.includes('/') || clean.includes(' ') || clean.includes('_')) {
        throw domainError('domain_validation', 'Domain must not include protocol, paths, spaces, or invalid characters', 'INVALID_DOMAIN_FORMAT');
    }
    if (clean.length > 253 || clean.includes('..') || !clean.includes('.')) {
        throw domainError('domain_validation', 'Enter a valid root domain or subdomain', 'INVALID_DOMAIN_FORMAT');
    }
    const labels = clean.split('.');
    if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || !/^[a-z]{2,63}$/.test(labels[labels.length - 1])) {
        throw domainError('domain_validation', 'Domain format is invalid', 'INVALID_DOMAIN_FORMAT');
    }
    return clean;
}

function domainError(stage: string, message: string, errorCode: string) {
    const error = new Error(message) as Error & { stage: string; errorCode: string };
    error.stage = stage;
    error.errorCode = errorCode;
    return error;
}

function shellQuote(value: string | number) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
