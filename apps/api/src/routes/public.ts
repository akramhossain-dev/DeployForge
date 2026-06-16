import { FastifyInstance } from 'fastify';
import prisma from '@deployforge/database';

export default async function publicRoutes(fastify: FastifyInstance) {
    fastify.get('/stats', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async () => {
        const [totalUsers, totalDeployments, activeVps] = await Promise.all([
            prisma.user.count(),
            prisma.deployment.count(),
            prisma.vPS.count({ where: { status: 'active' } }),
        ]);

        return {
            success: true,
            data: {
                totalUsers,
                totalDeployments,
                activeVps,
            },
        };
    });
}
