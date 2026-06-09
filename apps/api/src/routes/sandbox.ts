import { FastifyInstance } from 'fastify';
import { SandboxService } from '../services/sandbox.service';
import prisma from '@deployforge/database';

export default async function sandboxRoutes(fastify: FastifyInstance) {
    // 1. Analyze Deployment
    fastify.post('/analyze/:deploymentId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId } = request.params as { deploymentId: string };
        const result = await SandboxService.analyze(deploymentId);
        return { success: true, data: result };
    });

    // 2. Get Sandbox Result
    fastify.get('/:deploymentId/result', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId } = request.params as { deploymentId: string };
        const result = await prisma.deploymentSandbox.findUnique({
            where: { deploymentId },
        });

        if (!result) return reply.status(404).send({ message: 'Sandbox result not found' });
        return { success: true, data: result };
    });

    // 3. Validate and Auto-Deploy Trigger (Placeholder for integration)
    fastify.post('/validate-deploy/:deploymentId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId } = request.params as { deploymentId: string };
        const result = await SandboxService.analyze(deploymentId);

        if (result.status === 'rejected') {
            return reply.status(400).send({
                success: false,
                message: 'Deployment rejected by sandbox',
                issues: result.issues
            });
        }

        return {
            success: true,
            message: 'Deployment approved by sandbox. Proceeding to execution...',
            data: result
        };
    });
}
