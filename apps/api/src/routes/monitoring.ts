import { FastifyInstance } from 'fastify';
import { LoggingService } from '../services/logging.service';
import { MonitoringService } from '../services/monitoring.service';
import { RollbackService } from '../services/rollback.service';
import { verifyDeploymentOwnership, verifyVpsOwnership } from '../utils/authz';
import { z } from 'zod';

const deploymentIdParamsSchema = z.object({
    deploymentId: z.string().uuid({ message: 'Invalid deployment ID format' }),
});

const vpsIdParamsSchema = z.object({
    vpsId: z.string().uuid({ message: 'Invalid VPS ID format' }),
});

const rollbackBodySchema = z.object({
    historyId: z.string().uuid({ message: 'Invalid history ID format' }),
});

export default async function monitoringRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    // 1. Logs
    fastify.get('/logs/:deploymentId', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { deploymentId } = deploymentIdParamsSchema.parse(request.params);
        await verifyDeploymentOwnership(request.user.id, deploymentId, request);
        const logs = await LoggingService.getLogs(deploymentId);
        return { success: true, data: logs };
    });

    // 2. Metrics
    fastify.get('/metrics/:vpsId', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { vpsId } = vpsIdParamsSchema.parse(request.params);
        await verifyVpsOwnership(request.user.id, vpsId, request);
        const metrics = await MonitoringService.getMetrics(vpsId);
        return { success: true, data: metrics };
    });

    // 3. Manual Metrics Trigger
    fastify.post('/metrics/:vpsId/collect', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive: 5/min
    }, async (request, reply) => {
        const { vpsId } = vpsIdParamsSchema.parse(request.params);
        await verifyVpsOwnership(request.user.id, vpsId, request);
        const metrics = await MonitoringService.collectMetrics(vpsId);
        return { success: true, data: metrics };
    });

    // 4. History
    fastify.get('/history/:deploymentId', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { deploymentId } = deploymentIdParamsSchema.parse(request.params);
        await verifyDeploymentOwnership(request.user.id, deploymentId, request);
        const history = await RollbackService.getHistory(deploymentId);
        return { success: true, data: history };
    });

    // 5. Rollback
    fastify.post('/rollback/:deploymentId', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive: 5/min
    }, async (request, reply) => {
        const { deploymentId } = deploymentIdParamsSchema.parse(request.params);
        const { historyId } = rollbackBodySchema.parse(request.body);
        await verifyDeploymentOwnership(request.user.id, deploymentId, request);
        const result = await RollbackService.rollback(request.user.id, deploymentId, historyId);
        return { success: true, data: result };
    });
}
