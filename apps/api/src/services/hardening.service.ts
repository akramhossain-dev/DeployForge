import prisma from '@deployforge/database';
import { LoggingService } from './logging.service';

export class HardeningService {
    /**
     * Cleanup old logs to prevent database bloating and disk overflow.
     * Keeps logs for the last 7 days.
     */
    static async rotateLogs() {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        try {
            const deletedLogs = await prisma.deploymentLog.deleteMany({
                where: {
                    createdAt: { lt: sevenDaysAgo },
                },
            });

            const deletedMetrics = await prisma.systemMetrics.deleteMany({
                where: {
                    timestamp: { lt: sevenDaysAgo },
                },
            });

            console.log(`[Hardening] Rotated ${deletedLogs.count} logs and ${deletedMetrics.count} metrics.`);
        } catch (err) {
            console.error('[Hardening] Log rotation failed:', err);
        }
    }

    /**
     * Validates if a user is exceeding deployment limits.
     */
    static async checkDeploymentLimit(userId: string) {
        const activeDeployments = await prisma.deployment.count({
            where: {
                userId,
                status: { in: ['RUNNING', 'BUILDING', 'PENDING'] },
            },
        });

        if (activeDeployments >= 10) {
            throw new Error('Deployment limit reached (max 10 active deployments per user).');
        }
    }

    /**
     * Sanitize input strings to prevent common injection patterns.
     */
    static sanitize(input: string): string {
        return input.replace(/[<>]/g, '').trim();
    }
}
