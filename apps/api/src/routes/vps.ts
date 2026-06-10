import { FastifyInstance } from 'fastify';
import { VPSService } from '../services/vps.service';
import { z } from 'zod';
import prisma from '@deployforge/database';

const addVPSSchema = z.object({
    name: z.string().min(1),
    ipAddress: z.string().ip(),
    port: z.number().default(22),
    username: z.string().default('root'),
    authType: z.enum(['ssh_key', 'password']),
    password: z.string().optional(),
    privateKey: z.string().optional(),
});

export default async function vpsRoutes(fastify: FastifyInstance) {
    // 1. Add VPS
    fastify.post('/add', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const data = addVPSSchema.parse(request.body);
        const vps = await VPSService.validateAndAdd(request.user.id, data);
        return { success: true, data: vps };
    });

    // 2. List VPS
    fastify.get('/list', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const vpsList = await prisma.vPS.findMany({
            where: { userId: request.user.id },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: vpsList };
    });

    // 3. Get Single VPS
    fastify.get('/:id', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const vps = await prisma.vPS.findFirst({
            where: { id, userId: request.user.id },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
        });

        if (!vps) return reply.status(404).send({ message: 'VPS not found' });
        return { success: true, data: vps };
    });

    // 4. Delete VPS
    fastify.delete('/:id', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await prisma.vPS.deleteMany({ where: { id, userId: request.user.id } });
        return { success: true, message: 'VPS deleted' };
    });

    // 5. Get Health History
    fastify.get('/:id/health', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const health = await prisma.vPSHealth.findMany({
            where: { vpsId: id, vps: { userId: request.user.id } },
            take: 20,
            orderBy: { checkedAt: 'desc' },
        });
        return { success: true, data: health };
    });

    // 6. Manual Health Check
    fastify.post('/:id/health-check', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const health = await VPSService.performHealthCheck(id);
        return { success: true, data: health };
    });
}
