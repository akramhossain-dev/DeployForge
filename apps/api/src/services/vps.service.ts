import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { SSHService } from '@deployforge/vps';
import { config } from '../config/env';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

export class VPSService {
    static async validateAndAdd(userId: string, data: any) {
        const { name, ipAddress, port, username, authType, password, privateKey } = data;

        let sshConfig: any = {
            host: ipAddress,
            port: port || 22,
            username,
        };

        if (authType === 'ssh_key') {
            sshConfig.privateKey = privateKey;
        } else {
            sshConfig.password = password;
        }

        const ssh = new SSHService();
        try {
            await ssh.connect(sshConfig);

            // Basic validation commands
            const { stdout: osType } = await ssh.execute('uname -a');
            const { stdout: dockerVer } = await ssh.execute('docker --version');
            const { stdout: nginxVer } = await ssh.execute('nginx -v 2>&1');

            const vps = await prisma.vps.create({
                data: {
                    userId,
                    name,
                    ipAddress,
                    port: port || 22,
                    username,
                    authType,
                    encryptedPassword: password ? this.encrypt(password) : null,
                    encryptedPrivateKey: privateKey ? this.encrypt(privateKey) : null,
                    status: 'ACTIVE',
                },
            });

            // Initial health check
            await this.performHealthCheck(vps.id);

            return vps;
        } catch (err: any) {
            throw new Error(`SSH Connection failed: ${err.message}`);
        } finally {
            ssh.disconnect();
        }
    }

    static async performHealthCheck(vpsId: string) {
        const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
        if (!vps) throw new Error('VPS not found');

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

            // Metrics collection commands
            const { stdout: cpu } = await ssh.execute("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
            const { stdout: mem } = await ssh.execute("free | grep Mem | awk '{print $3/$2 * 100.0}'");
            const { stdout: disk } = await ssh.execute("df / | tail -1 | awk '{print $5}' | sed 's/%//'");
            const { stdout: uptime } = await ssh.execute("cat /proc/uptime | awk '{print $1}'");
            const { code: dockerCode } = await ssh.execute('docker --version');
            const { code: nginxCode } = await ssh.execute('nginx -v');

            return await prisma.vpsHealth.create({
                data: {
                    vpsId,
                    cpuUsage: parseFloat(cpu.trim()) || 0,
                    memoryUsage: parseFloat(mem.trim()) || 0,
                    diskUsage: parseFloat(disk.trim()) || 0,
                    uptime: Math.floor(parseFloat(uptime.trim())) || 0,
                    dockerInstalled: dockerCode === 0,
                    nginxInstalled: nginxCode === 0,
                },
            });
        } catch (err) {
            await prisma.vps.update({
                where: { id: vpsId },
                data: { status: 'ERROR' },
            });
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    private static encrypt(text: string) {
        const encrypted = encryptionService.encrypt(text);
        return `${encrypted.iv}:${encrypted.tag}:${encrypted.content}`;
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
