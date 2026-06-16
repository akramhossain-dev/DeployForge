import prisma from '@deployforge/database';

export class HardeningService {
    /**
     * Standardizes webhook payload size limits (DB-5).
     * Truncates payloads exceeding 50KB to protect database from bloat.
     */
    static limitWebhookPayload(payload: string): string {
        const maxBytes = 50 * 1024; // 50KB
        if (payload.length > maxBytes) {
            console.warn(`[Hardening] Webhook payload exceeded size limit: truncating from ${payload.length} to ${maxBytes} bytes`);
            return payload.slice(0, maxBytes) + '\n...[TRUNCATED BY WEBHOOK STORAGE POLICY]...';
        }
        return payload;
    }

    /**
     * Standardizes terminal command output size limits (DB-6).
     * Truncates command outputs exceeding 50KB to protect database from bloat.
     */
    static limitTerminalOutput(output: string): string {
        const maxBytes = 50 * 1024; // 50KB
        if (output.length > maxBytes) {
            console.warn(`[Hardening] Terminal output exceeded size limit: truncating from ${output.length} to ${maxBytes} bytes`);
            return output.slice(0, maxBytes) + '\n...[TRUNCATED BY TERMINAL LOG POLICY]...';
        }
        return output;
    }

    /**
     * Helper to log terminal commands safely with truncation rules (DB-6).
     */
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
            console.error('[Hardening] Failed to log terminal command:', err);
        }
    }

    /**
     * Performs database-level data retention cleanup based on predefined retention windows (DB-10).
     */
    static async runDataRetentionCleanup() {
        const getPastDate = (days: number) => {
            const date = new Date();
            date.setDate(date.getDate() - days);
            return date;
        };

        // Enforce policies (days)
        const auditCutoff = getPastDate(90);        // Audit logs: 90 days
        const logCutoff = getPastDate(7);           // Build/Deployment/Terminal logs: 7 days
        const metricsCutoff = getPastDate(7);       // System & Health metrics: 7 days
        const verifyTokenCutoff = getPastDate(14);  // Password Reset & Email verification tokens: 14 days

        try {
            console.log('[Hardening] Starting database retention cleanup job...');

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

            console.log('[Hardening] Database retention cleanup job finished successfully.', {
                auditDeleted: auditDeleted.count,
                deployLogsDeleted: deployLogsDeleted.count,
                termLogsDeleted: termLogsDeleted.count,
                termSessionsDeleted: termSessionsDeleted.count,
                webhookEventsDeleted: webhookEventsDeleted.count,
                systemMetricsDeleted: systemMetricsDeleted.count,
                healthRecordsDeleted: healthRecordsDeleted.count,
                resetTokensDeleted: resetTokensDeleted.count,
                verifyTokensDeleted: verifyTokensDeleted.count,
            });
        } catch (err) {
            console.error('[Hardening] Data retention cleanup job failed:', err);
        }
    }

    /**
     * Backward-compatible wrapper delegating to comprehensive cleanup.
     */
    static async rotateLogs() {
        await this.runDataRetentionCleanup();
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
