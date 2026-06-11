import { FastifyInstance } from 'fastify';
import prisma from '@deployforge/database';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';

const tokenService = new TokenService(config.auth.jwtSecret);

export default async function wsRoutes(fastify: FastifyInstance) {
    fastify.get('/deployments/:id/logs', { websocket: true }, async (connection, request) => {
        const session = await authorizeDeploymentSocket(request, connection);
        if (!session) return;

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

        await sendLogs();
        const interval = setInterval(() => sendLogs().catch((err) => {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message }));
        }), 1500);
        connection.socket.on('close', () => clearInterval(interval));
    });

    fastify.get('/deployments/:id/status', { websocket: true }, async (connection, request) => {
        const session = await authorizeDeploymentSocket(request, connection);
        if (!session) return;

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

        await sendStatus();
        const interval = setInterval(() => sendStatus().catch((err) => {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message }));
        }), 2000);
        connection.socket.on('close', () => clearInterval(interval));
    });
}

async function authorizeDeploymentSocket(request: any, connection: any) {
    const { id } = request.params as { id: string };
    const { token } = request.query as { token?: string };
    try {
        if (!token) throw new Error('Missing token');
        const payload = tokenService.verifyToken(token);
        const deployment = await prisma.deployment.findFirst({
            where: { id, userId: payload.userId },
            select: { id: true },
        });
        if (!deployment) throw new Error('Deployment not found');
        return { userId: payload.userId, deploymentId: id };
    } catch (err: any) {
        connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message || 'Unauthorized' }));
        connection.socket.close();
        return null;
    }
}
