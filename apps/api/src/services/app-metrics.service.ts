import prisma from '@deployforge/database';
import { logger } from '../utils/logger';

interface ApiRequestStats {
    totalRequests: number;
    statusCodes: Record<string, number>;
    responseTimeWindow: number[];
}

export class AppMetricsService {
    private static stats: ApiRequestStats = {
        totalRequests: 0,
        statusCodes: {},
        responseTimeWindow: [],
    };

    private static MAX_WINDOW_SIZE = 100;

    private static lastCpuUsage = process.cpuUsage();
    private static lastCpuTime = Date.now();

    private static cachedDeploymentStats: Record<string, number> = {};
    private static lastDeploymentStatsFetch = 0;
    private static CACHE_TTL_MS = 10000; 

    public static recordRequest(method: string, path: string, statusCode: number, responseTimeMs: number) {
        this.stats.totalRequests++;

        const codeStr = String(statusCode);
        this.stats.statusCodes[codeStr] = (this.stats.statusCodes[codeStr] || 0) + 1;

        this.stats.responseTimeWindow.push(responseTimeMs);
        if (this.stats.responseTimeWindow.length > this.MAX_WINDOW_SIZE) {
            this.stats.responseTimeWindow.shift();
        }
    }

    public static getCpuUsage(): number {
        const currentCpuUsage = process.cpuUsage();
        const currentCpuTime = Date.now();
        const userMS = (currentCpuUsage.user - this.lastCpuUsage.user) / 1000;
        const systemMS = (currentCpuUsage.system - this.lastCpuUsage.system) / 1000;
        const timeDiff = currentCpuTime - this.lastCpuTime;

        this.lastCpuUsage = currentCpuUsage;
        this.lastCpuTime = currentCpuTime;

        if (timeDiff === 0) return 0;
        const cpus = require('os').cpus().length || 1;
        const percentage = ((userMS + systemMS) / timeDiff) * 100;
        
        return parseFloat((percentage / cpus).toFixed(2));
    }

    public static async getDeploymentStats(): Promise<Record<string, number>> {
        const now = Date.now();
        if (now - this.lastDeploymentStatsFetch < this.CACHE_TTL_MS && Object.keys(this.cachedDeploymentStats).length > 0) {
            return this.cachedDeploymentStats;
        }

        try {
            const counts = await prisma.deployment.groupBy({
                by: ['status'],
                _count: true,
            });

            const stats: Record<string, number> = {};
            for (const item of counts) {
                stats[item.status] = item._count;
            }

            this.cachedDeploymentStats = stats;
            this.lastDeploymentStatsFetch = now;
            return stats;
        } catch (err) {
            logger.warn({ err }, 'Failed to fetch deployment stats for metrics, returning cache');
            return this.cachedDeploymentStats;
        }
    }

    public static async getMetrics() {
        const memory = process.memoryUsage();
        const uptime = process.uptime();
        const cpu = this.getCpuUsage();

        const respWindow = this.stats.responseTimeWindow;
        const avgResponseTimeMs = respWindow.length > 0
            ? parseFloat((respWindow.reduce((a, b) => a + b, 0) / respWindow.length).toFixed(2))
            : 0;

        let databaseStatus = 'error';
        let dbLatencyMs = 0;
        const dbStart = Date.now();
        try {
            await prisma.$queryRaw`SELECT 1`;
            databaseStatus = 'ok';
            dbLatencyMs = Date.now() - dbStart;
        } catch (err) {
            logger.error({ err }, 'Metrics database connectivity check failed');
        }

        const deployments = await this.getDeploymentStats();

        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptimeSeconds: Math.floor(uptime),
            system: {
                cpuUsagePercent: cpu,
                memory: {
                    rss: memory.rss,
                    heapTotal: memory.heapTotal,
                    heapUsed: memory.heapUsed,
                    external: memory.external,
                },
            },
            database: {
                status: databaseStatus,
                latencyMs: dbLatencyMs,
            },
            api: {
                totalRequests: this.stats.totalRequests,
                statusCodes: this.stats.statusCodes,
                averageResponseTimeMs: avgResponseTimeMs,
            },
            deployments,
        };
    }
}
