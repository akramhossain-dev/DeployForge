import prisma from '@deployforge/database';
import { logger } from '../utils/logger';

export class HardeningService {
    
    static limitWebhookPayload(payload: string): string {
        const maxBytes = 50 * 1024; 
        if (payload.length > maxBytes) {
            logger.warn({ originalBytes: payload.length, maxBytes }, 'Webhook payload exceeded storage limit; truncating');
            return payload.slice(0, maxBytes) + '\n...[TRUNCATED BY WEBHOOK STORAGE POLICY]...';
        }
        return payload;
    }

    static limitTerminalOutput(output: string): string {
        const maxBytes = 50 * 1024; 
        if (output.length > maxBytes) {
            logger.warn({ originalBytes: output.length, maxBytes }, 'Terminal output exceeded storage limit; truncating');
            return output.slice(0, maxBytes) + '\n...[TRUNCATED BY TERMINAL LOG POLICY]...';
        }
        return output;
    }

    static async logTerminalCommand(sessionId: string, command: string, output: string) {
        const truncatedOutput = this.limitTerminalOutput(output);
        const truncatedCommand = command.length > 1000 ? command.slice(0, 1000) + '...' : command;
        try {
            await prisma.terminalCommandLog.create({
                data: {
                    sessionId,
                    command: truncatedCommand,
                    output: truncatedOutput,
                },
            });
        } catch (err) {
            logger.error({ err, sessionId }, 'Failed to write terminal command audit log');
        }
    }

    static async runDataRetentionCleanup() {
        const getPastDate = (days: number) => {
            const date = new Date();
            date.setDate(date.getDate() - days);
            return date;
        };

        const auditCutoff = getPastDate(90);        
        const logCutoff = getPastDate(7);           
        const metricsCutoff = getPastDate(7);       
        const verifyTokenCutoff = getPastDate(14);  

        try {
            logger.info({ audit: true, event: 'retention_cleanup_started' }, 'Database retention cleanup job started');

            const auditDeleted = await prisma.auditLog.deleteMany({
                where: { createdAt: { lt: auditCutoff } },
            });

            const deployLogsDeleted = await prisma.deploymentLog.deleteMany({
                where: { createdAt: { lt: logCutoff } },
            });

            const termLogsDeleted = await prisma.terminalCommandLog.deleteMany({
                where: { timestamp: { lt: logCutoff } },
            });

            const termSessionsDeleted = await prisma.terminalSession.deleteMany({
                where: { startedAt: { lt: logCutoff } },
            });

            const webhookEventsDeleted = await prisma.webhookEvent.deleteMany({
                where: { createdAt: { lt: logCutoff } },
            });

            const systemMetricsDeleted = await prisma.systemMetrics.deleteMany({
                where: { timestamp: { lt: metricsCutoff } },
            });

            const healthRecordsDeleted = await prisma.vPSHealth.deleteMany({
                where: { checkedAt: { lt: metricsCutoff } },
            });

            const resetTokensDeleted = await prisma.passwordResetToken.deleteMany({
                where: { createdAt: { lt: verifyTokenCutoff } },
            });

            const verifyTokensDeleted = await prisma.emailVerificationToken.deleteMany({
                where: { createdAt: { lt: verifyTokenCutoff } },
            });

            logger.info({
                audit: true,
                event: 'retention_cleanup_completed',
                auditDeleted: auditDeleted.count,
                deployLogsDeleted: deployLogsDeleted.count,
                termLogsDeleted: termLogsDeleted.count,
                termSessionsDeleted: termSessionsDeleted.count,
                webhookEventsDeleted: webhookEventsDeleted.count,
                systemMetricsDeleted: systemMetricsDeleted.count,
                healthRecordsDeleted: healthRecordsDeleted.count,
                resetTokensDeleted: resetTokensDeleted.count,
                verifyTokensDeleted: verifyTokensDeleted.count,
            }, 'Database retention cleanup job completed');
        } catch (err) {
            logger.error({ err, audit: true, event: 'retention_cleanup_failed' }, 'Database retention cleanup job failed');
        }
    }

    static async rotateLogs() {
        await this.runDataRetentionCleanup();
    }

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

    static sanitize(input: string): string {
        return input.replace(/[<>]/g, '').trim();
    }
}
