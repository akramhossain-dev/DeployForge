import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import dns from 'dns';
import { promisify } from 'util';
import { verifyDomainOwnership } from '../utils/authz';

const resolveA = promisify(dns.resolve4);
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
                throw domainError('nginx_config', output || 'Nginx domain configuration failed', 'NGINX_CONFIG_ERROR');
            }

            await prisma.domain.updateMany({
                where: { deploymentId, domainName: { not: cleanDomain } },
                data: { status: 'DELETED' },
            });
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { domain: cleanDomain, hostType: 'domain' },
            });

            const current = await prisma.domain.findUnique({ where: { domainName: cleanDomain } });
            if (current) {
                return prisma.domain.update({
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

            return await prisma.domain.create({
                data: {
                    deploymentId,
                    vpsId: vps.id,
                    domainName: cleanDomain,
                    status: 'ACTIVE',
                    nginxConfigPath: configPath,
                },
            });

        } finally {
            ssh.disconnect();
        }
    }

    static async issueSSL(userId: string, domainId: string) {
        
        const domain = await prisma.domain.findFirst({
            where: {
                id: domainId,
                deployment: {
                    userId: userId
                }
            },
            include: { vps: true },
        });

        if (!domain) {
            
            await verifyDomainOwnership(userId, domainId);
            throw new Error('Domain not found');
        }

        const vps = domain.vps;
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

            const { code } = await ssh.execute(`certbot --nginx -d ${domain.domainName} --non-interactive --agree-tos --email admin@${domain.domainName}`);

            if (code === 0) {
                await prisma.domain.update({
                    where: { id: domainId },
                    data: { sslStatus: 'ISSUED' },
                });
            } else {
                await prisma.domain.update({
                    where: { id: domainId },
                    data: { sslStatus: 'FAILED' },
                });
                throw new Error('Certbot failed to issue SSL');
            }

        } finally {
            ssh.disconnect();
        }
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
