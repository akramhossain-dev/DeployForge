import { FastifyInstance } from 'fastify';
import { AlertService } from '../services/alert.service';
import { z } from 'zod';
import prisma from '@deployforge/database';

const updateSchema = z.object({
    cpuThreshold: z.number().min(0).max(100).optional(),
    ramThreshold: z.number().min(0).max(100).optional(),
    diskThreshold: z.number().min(0).max(100).optional(),
    swapThreshold: z.number().min(0).max(100).optional(),
    emailAlerts: z.boolean().optional(),
    browserAlerts: z.boolean().optional(),
    realtimeAlerts: z.boolean().optional(),
});

export default async function alertSettingsRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    // Get alert settings (creates default if none exist)
    fastify.get('/', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const rule = await AlertService.getOrCreateRule(request.user.id);
        return { success: true, data: rule };
    });

    // Update alert settings
    fastify.patch('/', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const data = updateSchema.parse(request.body);
        const rule = await AlertService.getOrCreateRule(request.user.id);

        const updated = await prisma.alertRule.update({
            where: { id: rule.id },
            data,
        });

        return { success: true, data: updated };
    });
}
