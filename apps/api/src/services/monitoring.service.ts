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
            const auth = vps.authType === 'key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            const { stdout: cpu } = await ssh.execute("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");

            const { stdout: mem } = await ssh.execute("free | grep Mem | awk '{print $3/$2 * 100.0}'");

            const { stdout: disk } = await ssh.execute("df / | tail -1 | awk '{print $5}' | sed 's/%//'");

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

    static async getHealthHistory(vpsId: string, range: string, from?: string, to?: string) {
        let startDate = new Date();
        let endDate = new Date();

        if (range === '24h') {
            startDate.setHours(startDate.getHours() - 24);
        } else if (range === '7d') {
            startDate.setDate(startDate.getDate() - 7);
        } else if (range === '30d') {
            startDate.setDate(startDate.getDate() - 30);
        } else if (range === 'custom' && from && to) {
            startDate = new Date(from);
            endDate = new Date(to);
        } else {
            // Default to 24h
            startDate.setHours(startDate.getHours() - 24);
        }

        const records = await prisma.vPSHealth.findMany({
            where: {
                vpsId,
                checkedAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            orderBy: { checkedAt: 'asc' },
        });

        return this.downsampleHealthRecords(records);
    }

    private static downsampleHealthRecords(records: any[]) {
        const targetPoints = 300;
        if (records.length <= targetPoints) {
            return records.map(r => ({
                cpuUsage: r.cpuUsage,
                memoryUsage: r.memoryUsage,
                diskUsage: r.diskUsage,
                uptime: r.uptime,
                timestamp: r.checkedAt.toISOString(),
            }));
        }

        const bucketSize = Math.floor(records.length / targetPoints);
        const result = [];

        for (let i = 0; i < targetPoints; i++) {
            const startIdx = i * bucketSize;
            const endIdx = Math.min(startIdx + bucketSize, records.length);
            const slice = records.slice(startIdx, endIdx);

            if (slice.length === 0) continue;

            const sumCpu = slice.reduce((acc, r) => acc + r.cpuUsage, 0);
            const sumMem = slice.reduce((acc, r) => acc + r.memoryUsage, 0);
            const sumDisk = slice.reduce((acc, r) => acc + r.diskUsage, 0);
            const avgUptime = slice[slice.length - 1].uptime;

            result.push({
                cpuUsage: Math.round((sumCpu / slice.length) * 10) / 10,
                memoryUsage: Math.round((sumMem / slice.length) * 10) / 10,
                diskUsage: Math.round((sumDisk / slice.length) * 10) / 10,
                uptime: avgUptime,
                timestamp: slice[Math.floor(slice.length / 2)].checkedAt.toISOString(),
            });
        }

        return result;
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
