import prisma from '@deployforge/database';
import { AlertType, AlertLevel } from '@prisma/client';
import { logger } from '../utils/logger';
import { monitoringEventEmitter, MONITORING_EVENTS } from '../utils/monitoring-events';
import { CacheService } from './cache.service';

const COOLDOWN_SECONDS = 300; // 5 minutes

interface MetricsPayload {
    cpuUsage: number;
    memoryUsage: number;
    diskUsage: number;
    swapUsage?: number;
    loadAvg1?: number;
}

interface AlertPayload {
    userId: string;
    vpsId: string;
    type: AlertType;
    level: AlertLevel;
    title: string;
    message: string;
    serverName?: string;
    resourceValue?: number;
}

export class AlertService {
    /**
     * Check collected metrics against user's configured thresholds.
     * Creates alerts for any thresholds that are exceeded.
     */
    static async checkThresholds(userId: string, vpsId: string, serverName: string, metrics: MetricsPayload) {
        const rule = await this.getOrCreateRule(userId);

        const checks: Array<{ condition: boolean; type: AlertType; level: AlertLevel; title: string; message: string; value: number }> = [
            {
                condition: metrics.cpuUsage >= rule.cpuThreshold,
                type: 'CPU_HIGH',
                level: metrics.cpuUsage >= 95 ? 'CRITICAL' : 'WARNING',
                title: 'High CPU Usage',
                message: `CPU usage on ${serverName} is at ${metrics.cpuUsage.toFixed(1)}% (threshold: ${rule.cpuThreshold}%)`,
                value: metrics.cpuUsage,
            },
            {
                condition: metrics.memoryUsage >= rule.ramThreshold,
                type: 'RAM_HIGH',
                level: metrics.memoryUsage >= 95 ? 'CRITICAL' : 'WARNING',
                title: 'High Memory Usage',
                message: `Memory usage on ${serverName} is at ${metrics.memoryUsage.toFixed(1)}% (threshold: ${rule.ramThreshold}%)`,
                value: metrics.memoryUsage,
            },
            {
                condition: metrics.diskUsage >= rule.diskThreshold,
                type: 'DISK_HIGH',
                level: metrics.diskUsage >= 95 ? 'CRITICAL' : 'WARNING',
                title: 'High Disk Usage',
                message: `Disk usage on ${serverName} is at ${metrics.diskUsage.toFixed(1)}% (threshold: ${rule.diskThreshold}%)`,
                value: metrics.diskUsage,
            },
        ];

        if (metrics.swapUsage !== undefined) {
            checks.push({
                condition: metrics.swapUsage >= rule.swapThreshold,
                type: 'SWAP_HIGH',
                level: metrics.swapUsage >= 95 ? 'CRITICAL' : 'WARNING',
                title: 'High Swap Usage',
                message: `Swap usage on ${serverName} is at ${metrics.swapUsage.toFixed(1)}% (threshold: ${rule.swapThreshold}%)`,
                value: metrics.swapUsage,
            });
        }

        if (metrics.loadAvg1 !== undefined && metrics.loadAvg1 > 5) {
            checks.push({
                condition: true,
                type: 'HIGH_LOAD',
                level: metrics.loadAvg1 > 10 ? 'CRITICAL' : 'WARNING',
                title: 'High Load Average',
                message: `Load average on ${serverName} is ${metrics.loadAvg1.toFixed(2)} (1-min)`,
                value: metrics.loadAvg1,
            });
        }

        for (const check of checks) {
            if (check.condition) {
                await this.triggerAlert({
                    userId,
                    vpsId,
                    type: check.type,
                    level: check.level,
                    title: check.title,
                    message: check.message,
                    serverName,
                    resourceValue: check.value,
                });
            }
        }
    }

    /**
     * Handle server going offline (health check connection failure).
     */
    static async handleServerOffline(userId: string, vpsId: string, serverName: string) {
        await this.triggerAlert({
            userId,
            vpsId,
            type: 'SERVER_OFFLINE',
            level: 'CRITICAL',
            title: 'Server Offline',
            message: `Server "${serverName}" is unreachable. SSH connection failed.`,
            serverName,
        });
    }

    /**
     * Handle server reconnecting after being offline.
     */
    static async handleServerReconnected(userId: string, vpsId: string, serverName: string) {
        await this.triggerAlert({
            userId,
            vpsId,
            type: 'SERVER_RECONNECTED',
            level: 'SUCCESS',
            title: 'Server Back Online',
            message: `Server "${serverName}" is back online and responding normally.`,
            serverName,
        });
    }

    /**
     * Handle deployment events (completed, failed).
     */
    static async handleDeploymentEvent(
        userId: string,
        vpsId: string,
        serverName: string,
        eventType: 'DEPLOYMENT_COMPLETED' | 'DEPLOYMENT_FAILED',
        deploymentName?: string,
    ) {
        const isFailed = eventType === 'DEPLOYMENT_FAILED';
        await this.triggerAlert({
            userId,
            vpsId,
            type: eventType,
            level: isFailed ? 'CRITICAL' : 'SUCCESS',
            title: isFailed ? 'Deployment Failed' : 'Deployment Completed',
            message: isFailed
                ? `Deployment "${deploymentName || 'Unknown'}" failed on server "${serverName}".`
                : `Deployment "${deploymentName || 'Unknown'}" completed successfully on server "${serverName}".`,
            serverName,
        });
    }

    /**
     * Handle SSL certificate expiring.
     */
    static async handleSSLExpiring(userId: string, vpsId: string, serverName: string, domainName: string, daysLeft: number) {
        await this.triggerAlert({
            userId,
            vpsId,
            type: 'SSL_EXPIRING',
            level: daysLeft <= 7 ? 'CRITICAL' : 'WARNING',
            title: 'SSL Certificate Expiring',
            message: `SSL certificate for "${domainName}" on server "${serverName}" expires in ${daysLeft} days.`,
            serverName,
            resourceValue: daysLeft,
        });
    }

    /**
     * Handle backup events.
     */
    static async handleBackupEvent(
        userId: string,
        vpsId: string,
        serverName: string,
        eventType: 'BACKUP_COMPLETED' | 'BACKUP_FAILED',
    ) {
        const isFailed = eventType === 'BACKUP_FAILED';
        await this.triggerAlert({
            userId,
            vpsId,
            type: eventType,
            level: isFailed ? 'CRITICAL' : 'SUCCESS',
            title: isFailed ? 'Backup Failed' : 'Backup Completed',
            message: isFailed
                ? `Scheduled backup failed on server "${serverName}".`
                : `Scheduled backup completed successfully on server "${serverName}".`,
            serverName,
        });
    }

    /**
     * Core alert trigger with cooldown deduplication.
     */
    static async triggerAlert(payload: AlertPayload) {
        try {
            // Check cooldown to prevent duplicate alerts
            if (await this.isOnCooldown(payload.userId, payload.vpsId, payload.type)) {
                logger.debug({ type: payload.type, vpsId: payload.vpsId }, 'Alert skipped (cooldown active)');
                return null;
            }

            // Create notification in database
            const notification = await prisma.notification.create({
                data: {
                    userId: payload.userId,
                    vpsId: payload.vpsId,
                    type: payload.type,
                    level: payload.level,
                    title: payload.title,
                    message: payload.message,
                    serverName: payload.serverName,
                    resourceValue: payload.resourceValue,
                },
            });

            // Set cooldown
            await this.setCooldown(payload.userId, payload.vpsId, payload.type);

            // Emit real-time event
            monitoringEventEmitter.emit(MONITORING_EVENTS.ALERT_CREATED, payload.userId, notification);

            logger.info(
                { notificationId: notification.id, type: payload.type, level: payload.level, vpsId: payload.vpsId },
                'Alert triggered',
            );

            return notification;
        } catch (err) {
            logger.error({ err, payload }, 'Failed to trigger alert');
            return null;
        }
    }

    /**
     * Check if an alert type is on cooldown for a given user+vps combination.
     */
    private static async isOnCooldown(userId: string, vpsId: string, type: AlertType): Promise<boolean> {
        try {
            const key = `alert:cooldown:${userId}:${vpsId}:${type}`;
            const value = await CacheService.get(key);
            return value !== null;
        } catch {
            // If Redis is down, don't block alerts
            return false;
        }
    }

    /**
     * Set cooldown for an alert type.
     */
    private static async setCooldown(userId: string, vpsId: string, type: AlertType) {
        try {
            const key = `alert:cooldown:${userId}:${vpsId}:${type}`;
            await CacheService.set(key, '1', COOLDOWN_SECONDS);
        } catch {
            // Redis failure shouldn't block alert creation
        }
    }

    /**
     * Get or create default alert rules for a user.
     */
    static async getOrCreateRule(userId: string) {
        let rule = await prisma.alertRule.findUnique({ where: { userId } });
        if (!rule) {
            rule = await prisma.alertRule.create({
                data: { userId },
            });
        }
        return rule;
    }
}
