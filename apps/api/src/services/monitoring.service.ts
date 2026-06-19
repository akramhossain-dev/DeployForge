import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const encryptionService = new EncryptionService(config.encryption.key);

export class MonitoringService {
    static async collectMetrics(vpsId: string) {
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps) throw new Error('VPS not found');

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

            // 1. CPU Usage
            const { stdout: cpu } = await ssh.execute("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");

            // 2. Memory Usage
            const { stdout: mem } = await ssh.execute("free | grep Mem | awk '{print $3/$2 * 100.0}'");

            // 3. Disk Usage
            const { stdout: disk } = await ssh.execute("df / | tail -1 | awk '{print $5}' | sed 's/%//'");

            // 4. Active Containers
            const { stdout: containers } = await ssh.execute("docker ps -q | wc -l");

            return await prisma.systemMetrics.create({
                data: {
                    vpsId,
                    cpuUsage: parseFloat(cpu.trim()) || 0,
                    memoryUsage: parseFloat(mem.trim()) || 0,
                    diskUsage: parseFloat(disk.trim()) || 0,
                    activeContainers: parseInt(containers.trim()) || 0,
                },
            });

        } catch (err) {
            logger.error({ err, vpsId }, 'Failed to collect VPS metrics');
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    static async getMetrics(vpsId: string, limit = 50) {
        return await prisma.systemMetrics.findMany({
            where: { vpsId },
            orderBy: { timestamp: 'desc' },
            take: limit,
        });
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
