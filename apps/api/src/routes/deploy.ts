import { FastifyInstance } from 'fastify';
import { DeploymentService } from '../services/deployment.service';
import { z } from 'zod';
import prisma from '@deployforge/database';

const githubDeploySchema = z.object({
    projectId: z.string().uuid(),
    vpsId: z.string().uuid(),
    branch: z.string().default('main'),
});

export default async function deployRoutes(fastify: FastifyInstance) {
    // 1. GitHub Deployment
    fastify.post('/github', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { projectId, vpsId, branch } = githubDeploySchema.parse(request.body);
        const deployment = await DeploymentService.deployFromGithub(request.user.id, projectId, vpsId, branch);
        return { success: true, data: deployment };
    });

    // 2. List Deployments
    fastify.get('/list', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const deployments = await prisma.deployment.findMany({
            where: { userId: request.user.id },
            include: {
                project: true,
                vps: {
                    include: {
                        healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } },
                    },
                },
                deploymentLogs: { take: 1, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: deployments };
    });

    // 3. Get Logs
    fastify.get('/:id/logs', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const logs = await prisma.deploymentLog.findMany({
            where: { deploymentId: id, deployment: { userId: request.user.id } },
            orderBy: { createdAt: 'asc' },
        });
        return { success: true, data: logs };
    });

    // 4. Start/Stop
    fastify.post('/:id/stop', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await DeploymentService.stopDeployment(request.user.id, id);
        return { success: true, message: 'Deployment stopped' };
    });

    fastify.post('/:id/start', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        await DeploymentService.startDeployment(request.user.id, id);
        return { success: true, message: 'Deployment started' };
    });
}
