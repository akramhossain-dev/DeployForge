import { FastifyInstance } from 'fastify';
import { SandboxService } from '../services/sandbox.service';
import { verifyDeploymentOwnership, verifyVpsOwnership, verifySandboxOwnership } from '../utils/authz';
import { z } from 'zod';

const sandboxParamsSchema = z.object({
    deploymentId: z.string().uuid({ message: 'Invalid deployment ID format' }),
});

export default async function sandboxRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.post('/analyze/:deploymentId', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        const { deploymentId } = sandboxParamsSchema.parse(request.params);
        const deployment = await verifyDeploymentOwnership(request.user.id, deploymentId, request);
        await verifyVpsOwnership(request.user.id, deployment.vpsId, request);
        const result = await SandboxService.analyze(request.user.id, deploymentId);
        return { success: true, data: result };
    });

    fastify.get('/:deploymentId/result', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { deploymentId } = sandboxParamsSchema.parse(request.params);
        const result = await verifySandboxOwnership(request.user.id, deploymentId, request);
        return { success: true, data: result };
    });

    fastify.post('/validate-deploy/:deploymentId', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        const { deploymentId } = sandboxParamsSchema.parse(request.params);
        const deployment = await verifyDeploymentOwnership(request.user.id, deploymentId, request);
        await verifyVpsOwnership(request.user.id, deployment.vpsId, request);
        const result = await SandboxService.analyze(request.user.id, deploymentId);

        if (result.status === 'rejected') {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'SANDBOX_REJECTED',
                    message: 'Deployment rejected by sandbox',
                    details: result.issues
                }
            });
        }

        return {
            success: true,
            data: {
                message: 'Deployment approved by sandbox. Proceeding to execution...',
                analysis: result
            }
        };
    });
}
