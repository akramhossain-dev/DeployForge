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
            include: { vps: true, domains: true },
        });
        if (!deployment) throw domainError('domain_bind', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        if (deployment.userId !== userId) throw domainError('domain_bind', 'Unauthorized', 'UNAUTHORIZED');
        if (!deployment.port) throw domainError('domain_bind', 'Deployment does not have an assigned port', 'DOMAIN_BIND_FAILED');

        const existing = await prisma.domain.findFirst({
            where: {
                domainName: cleanDomain,
                deploymentId: { not: deploymentId },
                deployment: { status: { not: 'DELETED' } },
            },
        });
        if (existing) throw domainError('domain_validation', 'Domain is already assigned to another deployment', 'DOMAIN_ALREADY_EXISTS');

        const vps = deployment.vps;
        if (!vps) throw domainError('domain_bind', 'The VPS linked to this deployment no longer exists. Please re-attach a VPS before adding a domain.', 'VPS_NOT_FOUND');

        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            const configPath = `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`;
            const nginxConfig = `server {\n    listen 80;\n    server_name ${cleanDomain};\n\n    location / {\n        proxy_pass http://127.0.0.1:${deployment.port};\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_cache_bypass $http_upgrade;\n    }\n}`;
            const command = `if ! command -v nginx >/dev/null 2>&1; then echo NGINX_MISSING; exit 2; fi; if [ ! -w /etc/nginx/conf.d ]; then echo NGINX_CONF_UNWRITABLE; exit 3; fi; printf '%s\\n' ${shellQuote(nginxConfig)} > ${shellQuote(configPath)} && nginx -t && nginx -s reload`;
            const result = await ssh.execute(command);
            if (result.code !== 0 && result.code !== null) {
                const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
                throw parseSshDomainError(output);
            }

            try {
                const savedDomain = await prisma.$transaction(async (tx) => {
                    // Re-check uniqueness inside the transaction with a FOR UPDATE-equivalent
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
                                sslStatus: 'NONE',
                                nginxConfigPath: configPath,
                            },
                        });
                    }

                    return tx.domain.create({
                        data: {
                            deploymentId,
                            vpsId: vps.id,
                            domainName: cleanDomain,
                            status: 'ACTIVE',
                            nginxConfigPath: configPath,
                        },
                    });
                });

                return savedDomain;
            } catch (err: any) {
                if (err?.code === 'P2002' || err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
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
            where: { id: domainId, deployment: { userId } },
            include: { vps: true },
        });
        if (!domain) throw Object.assign(new Error('Domain not found'), { statusCode: 404 });

        const vps = domain.vps;
        let nginxCleanupWarning: string | null = null;

        if (vps && domain.nginxConfigPath) {
            const ssh = new SSHService();
            try {
                const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                    ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                    : { password: this.decrypt(vps.encryptedPassword!) };

                await ssh.connect({ host: vps.ipAddress, port: vps.port, username: vps.username, ...auth });

                // Also remove the auto-https redirect config if it exists
                const redirectConfigPath = domain.nginxConfigPath.replace('.conf', '-redirect.conf');
                const cleanupCmd = [
                    `rm -f ${shellQuote(domain.nginxConfigPath)}`,
                    `rm -f ${shellQuote(redirectConfigPath)}`,
                    `nginx -t && nginx -s reload`,
                ].join(' && ');

                const result = await ssh.execute(cleanupCmd);
                if (result.code !== 0 && result.code !== null) {
                    const output = [result.stdout, result.stderr].filter(Boolean).join(' ').trim();
                    nginxCleanupWarning = `Nginx config could not be fully removed on VPS (${output || 'unknown error'}). Manual cleanup of ${domain.nginxConfigPath} may be required.`;
                }
            } catch (sshErr: any) {
                nginxCleanupWarning = `Could not connect to VPS to remove nginx config: ${sshErr?.message || 'SSH connection failed'}. Manual cleanup of ${domain.nginxConfigPath} may be required.`;
            } finally {
                ssh.disconnect();
            }
        }

        await prisma.domain.update({ where: { id: domainId }, data: { status: 'DELETED' } });

        // If this was the deployment's primary domain, clear it
        await prisma.deployment.updateMany({
            where: { id: domain.deploymentId, domain: domain.domainName },
            data: { domain: null, hostType: 'ip' },
        });

        return { warning: nginxCleanupWarning };
    }

    static async issueSSL(userId: string, domainId: string) {
        const domain = await prisma.domain.findFirst({
            where: { id: domainId, deployment: { userId } },
            include: { vps: true },
        });

        if (!domain) {
            throw Object.assign(new Error('Domain not found'), { statusCode: 404, errorCode: 'DOMAIN_NOT_FOUND' });
        }

        if (domain.status !== 'ACTIVE') {
            throw Object.assign(
                new Error(`Domain is not active (current status: ${domain.status}). Ensure the domain is attached and nginx is configured before issuing SSL.`),
                { statusCode: 422, errorCode: 'DOMAIN_NOT_ACTIVE' }
            );
        }

        const vps = domain.vps;
        if (!vps) {
            throw Object.assign(new Error('VPS not found for this domain'), { statusCode: 404, errorCode: 'VPS_NOT_FOUND' });
        }

        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({ host: vps.ipAddress, port: vps.port, username: vps.username, ...auth });

            const certbotEmail = config.superAdmin?.email
                || config.email?.fromEmail
                || `admin@${domain.domainName}`;

            const { code, stdout, stderr } = await ssh.execute(
                `certbot --nginx -d ${domain.domainName} --non-interactive --agree-tos --email ${certbotEmail}`
            );


            if (code === 0) {
                await prisma.domain.update({ where: { id: domainId }, data: { sslStatus: 'ISSUED' } });
            } else {
                await prisma.domain.update({ where: { id: domainId }, data: { sslStatus: 'FAILED' } });
                const output = [stdout, stderr].filter(Boolean).join(' ').trim();
                throw Object.assign(
                    new Error(`Certbot failed to issue SSL certificate: ${output || 'unknown error'}`),
                    { statusCode: 422, errorCode: 'CERTBOT_FAILED' }
                );
            }

        } finally {
            ssh.disconnect();
        }
    }

    static async setAutoHttps(userId: string, domainId: string, enabled: boolean) {
        const domain = await prisma.domain.findFirst({
            where: { id: domainId, deployment: { userId } },
            include: { vps: true },
        });
        if (!domain) throw Object.assign(new Error('Domain not found'), { statusCode: 404 });
        if (enabled && domain.sslStatus !== 'ISSUED') {
            throw Object.assign(
                new Error('SSL must be issued before enabling Auto-HTTPS'),
                { statusCode: 400, errorCode: 'SSL_NOT_ISSUED' }
            );
        }

        const vps = domain.vps;
        if (!vps) {
            throw Object.assign(new Error('VPS not found for this domain'), { statusCode: 404, errorCode: 'VPS_NOT_FOUND' });
        }

        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({ host: vps.ipAddress, port: vps.port, username: vps.username, ...auth });

            const redirectConfigPath = (domain.nginxConfigPath || `/etc/nginx/conf.d/deployforge-${domain.deploymentId}.conf`)
                .replace('.conf', '-redirect.conf');

            if (enabled) {
                const redirectBlock = [
                    `# Auto-HTTPS redirect managed by DeployForge — do not edit manually`,
                    `server {`,
                    `    listen 80;`,
                    `    server_name ${domain.domainName};`,
                    `    return 301 https://$host$request_uri;`,
                    `}`,
                ].join('\n');

                // Write (overwrite) the dedicated redirect file — idempotent
                const cmd = `printf '%s\n' ${shellQuote(redirectBlock)} > ${shellQuote(redirectConfigPath)} && nginx -t && nginx -s reload`;
                const result = await ssh.execute(cmd);
                if (result.code !== 0 && result.code !== null) {
                    const output = [result.stdout, result.stderr].filter(Boolean).join(' ').trim();
                    throw Object.assign(
                        new Error(`Failed to write Auto-HTTPS redirect config: ${output || 'nginx reload failed'}`),
                        { statusCode: 422, errorCode: 'AUTO_HTTPS_NGINX_ERROR' }
                    );
                }
            } else {
                // Remove the dedicated redirect config file — idempotent (rm -f never fails)
                const cmd = `rm -f ${shellQuote(redirectConfigPath)} && nginx -t && nginx -s reload`;
                const result = await ssh.execute(cmd);
                if (result.code !== 0 && result.code !== null) {
                    const output = [result.stdout, result.stderr].filter(Boolean).join(' ').trim();
                    throw Object.assign(
                        new Error(`Failed to remove Auto-HTTPS redirect config: ${output || 'nginx reload failed'}`),
                        { statusCode: 422, errorCode: 'AUTO_HTTPS_NGINX_ERROR' }
                    );
                }
            }
        } finally {
            ssh.disconnect();
        }

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

/**
 * Maps known SSH sentinel outputs from the nginx setup command into specific,
 * user-friendly domain errors. Falls back to a generic nginx config error
 * if the output doesn't match a known sentinel.
 */
function parseSshDomainError(output: string) {
    const normalized = output.trim().toUpperCase();

    if (normalized.includes('NGINX_MISSING')) {
        return domainError(
            'nginx_missing',
            'Nginx is not installed on your VPS. Please install it first by running: sudo apt install nginx -y',
            'NGINX_NOT_INSTALLED'
        );
    }

    if (normalized.includes('NGINX_CONF_UNWRITABLE')) {
        return domainError(
            'nginx_permission',
            'The Nginx config directory (/etc/nginx/conf.d) is not writable. Run: sudo chmod 755 /etc/nginx/conf.d',
            'NGINX_PERMISSION_DENIED'
        );
    }

    if (normalized.includes('NGINX: [EMERG]') || normalized.includes('NGINX -T')) {
        return domainError(
            'nginx_config',
            'Nginx configuration test failed. The generated config may conflict with an existing server block.',
            'NGINX_CONFIG_TEST_FAILED'
        );
    }

    if (normalized.includes('COMMAND NOT FOUND') || normalized.includes('NO SUCH FILE')) {
        return domainError(
            'nginx_missing',
            'Nginx executable could not be found on the VPS. Please install nginx and ensure it is in the system PATH.',
            'NGINX_NOT_INSTALLED'
        );
    }

    // Generic fallback with the raw output preserved for debugging
    return domainError(
        'nginx_config',
        output || 'Nginx domain configuration failed. Check the VPS nginx installation and permissions.',
        'NGINX_CONFIG_ERROR'
    );
}

function shellQuote(value: string | number) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

