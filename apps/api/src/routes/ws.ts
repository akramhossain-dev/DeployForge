import { FastifyInstance } from 'fastify';
import prisma from '@deployforge/database';
import { z } from 'zod';
import { socketToken, verifyDeploymentSocketAccess, verifySocketUser } from '../utils/socket-auth';
import { deploymentEventEmitter, DEPLOYMENT_EVENTS } from '../utils/deployment-events';
import { monitoringEventEmitter, MONITORING_EVENTS } from '../utils/monitoring-events';

const wsParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid ID format' }),
});

const wsQuerySchema = z.object({
    token: z.string().min(1, 'Token is required').optional(),
});

// H-7: Per-user WebSocket connection tracking to prevent resource exhaustion
const MAX_WS_PER_USER = 20;
const userConnectionCounts = new Map<string, number>();

function acquireWsSlot(userId: string): boolean {
    const current = userConnectionCounts.get(userId) || 0;
    if (current >= MAX_WS_PER_USER) return false;
    userConnectionCounts.set(userId, current + 1);
    return true;
}

function releaseWsSlot(userId: string): void {
    const current = userConnectionCounts.get(userId) || 0;
    if (current <= 1) {
        userConnectionCounts.delete(userId);
    } else {
        userConnectionCounts.set(userId, current - 1);
    }
}

export default async function wsRoutes(fastify: FastifyInstance) {
    fastify.get('/deployments/:id/logs', { websocket: true }, async (connection, request) => {
        const session = await authorizeDeploymentSocket(request, connection);
        if (!session) return;

        if (!acquireWsSlot(session.userId)) {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: 'Too many concurrent connections' }));
            connection.socket.close();
            return;
        }

        let lastSeen = new Date(0);
        const sendLogs = async () => {
            const logs = await prisma.deploymentLog.findMany({
                where: { deploymentId: session.deploymentId, createdAt: { gt: lastSeen } },
                orderBy: { createdAt: 'asc' },
                take: 100,
            });
            for (const log of logs) {
                lastSeen = log.createdAt;
                connection.socket.send(JSON.stringify({ event: 'deployment:log', data: log }));
            }
        };

        const onLogAdded = (depId: string, log: any) => {
            if (depId === session.deploymentId) {
                const logTime = new Date(log.createdAt);
                if (logTime > lastSeen) {
                    lastSeen = logTime;
                    connection.socket.send(JSON.stringify({ event: 'deployment:log', data: log }));
                }
            }
        };

        deploymentEventEmitter.on(DEPLOYMENT_EVENTS.LOG_ADDED, onLogAdded);

        await sendLogs().catch((err) => {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message }));
        });

        connection.socket.on('close', () => {
            deploymentEventEmitter.off(DEPLOYMENT_EVENTS.LOG_ADDED, onLogAdded);
            releaseWsSlot(session.userId);
        });
    });

    fastify.get('/deployments/:id/status', { websocket: true }, async (connection, request) => {
        const session = await authorizeDeploymentSocket(request, connection);
        if (!session) return;

        if (!acquireWsSlot(session.userId)) {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: 'Too many concurrent connections' }));
            connection.socket.close();
            return;
        }

        let lastStatus = '';
        let lastUpdatedAt = '';
        const sendStatus = async () => {
            const deployment = await prisma.deployment.findFirst({
                where: { id: session.deploymentId, userId: session.userId },
                select: { id: true, status: true, updatedAt: true, containerId: true, port: true, commitHash: true, commitMessage: true },
            });
            if (!deployment) return;
            const updatedAt = deployment.updatedAt.toISOString();
            if (deployment.status !== lastStatus || updatedAt !== lastUpdatedAt) {
                lastStatus = deployment.status;
                lastUpdatedAt = updatedAt;
                connection.socket.send(JSON.stringify({ event: 'deployment:status', data: deployment }));
            }
        };

        const onStatusUpdated = (depId: string, deployment: any) => {
            if (depId === session.deploymentId) {
                const updatedAt = new Date(deployment.updatedAt).toISOString();
                if (deployment.status !== lastStatus || updatedAt !== lastUpdatedAt) {
                    lastStatus = deployment.status;
                    lastUpdatedAt = updatedAt;
                    connection.socket.send(JSON.stringify({ event: 'deployment:status', data: deployment }));
                }
            }
        };

        deploymentEventEmitter.on(DEPLOYMENT_EVENTS.STATUS_UPDATED, onStatusUpdated);

        await sendStatus().catch((err) => {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message }));
        });

        connection.socket.on('close', () => {
            deploymentEventEmitter.off(DEPLOYMENT_EVENTS.STATUS_UPDATED, onStatusUpdated);
            releaseWsSlot(session.userId);
        });
    });

    // Real-time notification push for authenticated users
    fastify.get('/notifications', { websocket: true }, async (connection, request) => {
        const { token: queryToken } = wsQuerySchema.parse(request.query);
        const token = socketToken(request, queryToken);
        const session = await verifySocketUser(token);

        if (!session) {
            connection.socket.send(JSON.stringify({ event: 'notification:error', message: 'Unauthorized' }));
            connection.socket.close();
            return;
        }

        const userId = session.userId;

        if (!acquireWsSlot(userId)) {
            connection.socket.send(JSON.stringify({ event: 'notification:error', message: 'Too many concurrent connections' }));
            connection.socket.close();
            return;
        }

        // Send initial unread count
        const unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
        connection.socket.send(JSON.stringify({ event: 'notification:unread_count', data: { count: unreadCount } }));

        // Listen for new alerts targeted at this user
        const onAlertCreated = (alertUserId: string, notification: any) => {
            if (alertUserId === userId) {
                try {
                    connection.socket.send(JSON.stringify({ event: 'notification:new', data: notification }));
                } catch {
                    // Connection may have closed
                }
            }
        };

        monitoringEventEmitter.on(MONITORING_EVENTS.ALERT_CREATED, onAlertCreated);

        connection.socket.on('close', () => {
            monitoringEventEmitter.off(MONITORING_EVENTS.ALERT_CREATED, onAlertCreated);
            releaseWsSlot(userId);
        });
    });
}

async function authorizeDeploymentSocket(request: any, connection: any) {
    try {
        const { id } = wsParamsSchema.parse(request.params);
        const { token: queryToken } = wsQuerySchema.parse(request.query);
        const session = await verifyDeploymentSocketAccess(id, socketToken(request, queryToken));
        if (!session) throw new Error('Unauthorized');
        return session;
    } catch (err: any) {
        connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message || 'Unauthorized' }));
        connection.socket.close();
        return null;
    }
}

