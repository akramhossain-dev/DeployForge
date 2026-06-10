import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import dns from 'dns';
import { promisify } from 'util';

const resolveA = promisify(dns.resolve4);
const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

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
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { vps: true },
        });
        if (!deployment) throw new Error('Deployment not found');
        if (deployment.userId !== userId) throw new Error('Unauthorized');

        const vps = deployment.vps;
        const isDnsValid = await this.verifyDNS(domainName, vps.ipAddress);
        if (!isDnsValid) throw new Error(`DNS for ${domainName} does not point to ${vps.ipAddress}`);

        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            // 1. Generate Nginx Config
            const nginxConfig = `
server {
    listen 80;
    server_name ${domainName};

    location / {
        proxy_pass http://localhost:${deployment.port || 3000};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
      `;

            const configPath = `/etc/nginx/sites-available/${domainName}`;
            const enabledPath = `/etc/nginx/sites-enabled/${domainName}`;

            await ssh.execute(`echo '${nginxConfig}' > ${configPath}`);
            await ssh.execute(`ln -sf ${configPath} ${enabledPath}`);
            await ssh.execute('nginx -t && systemctl reload nginx');

            return await prisma.domain.create({
                data: {
                    deploymentId,
                    vpsId: vps.id,
                    domainName,
                    status: 'ACTIVE',
                    nginxConfigPath: configPath,
                },
            });

        } finally {
            ssh.disconnect();
        }
    }

    static async issueSSL(userId: string, domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId },
            include: { vps: true },
        });
        if (!domain) throw new Error('Domain not found');

        const vps = domain.vps;
        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            // Run Certbot
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
