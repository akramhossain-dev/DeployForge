import { FastifyInstance } from 'fastify';
import { LoggingService } from '../services/logging.service';
import { MonitoringService } from '../services/monitoring.service';
import { RollbackService } from '../services/rollback.service';
import prisma from '@deployforge/database';

export default async function monitoringRoutes(fastify: FastifyInstance) {
    // 1. Logs
    fastify.get('/logs/:deploymentId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId } = request.params as { deploymentId: string };
        const logs = await LoggingService.getLogs(deploymentId);
        return { success: true, data: logs };
    });

    // 2. Metrics
    fastify.get('/metrics/:vpsId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { vpsId } = request.params as { vpsId: string };
        const metrics = await MonitoringService.getMetrics(vpsId);
        return { success: true, data: metrics };
    });

    // 3. Manual Metrics Trigger
    fastify.post('/metrics/:vpsId/collect', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { vpsId } = request.params as { vpsId: string };
        const metrics = await MonitoringService.collectMetrics(vpsId);
        return { success: true, data: metrics };
    });

    // 4. History
    fastify.get('/history/:deploymentId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId } = request.params as { deploymentId: string };
        const history = await RollbackService.getHistory(deploymentId);
        return { success: true, data: history };
    });

    // 5. Rollback
    fastify.post('/rollback/:deploymentId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId } = request.params as { deploymentId: string };
        const { historyId } = request.body as { historyId: string };
        const result = await RollbackService.rollback(request.user.id, deploymentId, historyId);
        return { success: true, data: result };
    });
}
