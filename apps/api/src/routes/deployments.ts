import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { DeploymentService } from '../services/deployment.service';
import { RollbackService } from '../services/rollback.service';
import { sanitizeDeployment } from '../utils/sanitizers';

const deploymentParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid deployment ID format' }),
});

const rollbackBodySchema = z.object({
    historyId: z.string().uuid({ message: 'Invalid history ID format' }),
});

function maskDeployment(deployment: any) {
    const sanitized = sanitizeDeployment(deployment);
    if (!sanitized) return null;
    
    const activeDomain = sanitized.domains?.find((domain: any) => domain.status === 'ACTIVE') || sanitized.domains?.[0];
    const hostType = sanitized.hostType || (activeDomain ? 'domain' : 'ip');
    const sourceType = sanitized.sourceType || (sanitized.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
    const domainName = sanitized.domain || activeDomain?.domainName || null;
    const url = hostType === 'domain' && domainName
        ? `http://${domainName}`
        : sanitized.vps?.ipAddress && sanitized.type === 'STATIC'
          ? sanitized.port
            ? `http://${sanitized.vps.ipAddress}:${sanitized.port}/site/${sanitized.id}/`
            : `http://${sanitized.vps.ipAddress}/site/${sanitized.id}/`
        : sanitized.vps?.ipAddress && sanitized.port
          ? `http://${sanitized.vps.ipAddress}:${sanitized.port}`
          : null;

    return {
        ...sanitized,
        hostType,
        sourceType,
        repoUrl: sanitized.repoUrl || (sourceType === 'github' ? sanitized.project?.repositoryUrl : null),
        branch: sanitized.branch || (sourceType === 'github' ? sanitized.project?.branch : null),
        uploadPath: sanitized.uploadPath || (sourceType === 'upload' ? sanitized.project?.repositoryUrl : null),
        url,
        domain: domainName,
    };
}

export default async function deploymentAliasRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const deployments = await prisma.deployment.findMany({
            where: { userId: request.user.id },
            include: {
                project: true,
                vps: { include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } } },
                deploymentLogs: { take: 1, orderBy: { createdAt: 'desc' } },
                history: { take: 3, orderBy: { createdAt: 'desc' } },
                domains: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: deployments.map(maskDeployment).filter(Boolean) };
    });

    fastify.get('/:id', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const deployment = await DeploymentService.getStatus(request.user.id, id);
        if (!deployment) {
            return reply.status(404).send({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: 'Deployment not found'
                }
            });
        }
        return { success: true, data: maskDeployment(deployment) };
    });

    fastify.post('/:id/rollback', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const { historyId } = rollbackBodySchema.parse(request.body);
        try {
            const result = await RollbackService.rollback(request.user.id, id, historyId);
            return { success: true, data: result };
        } catch (err: any) {
            const status = err.statusCode || (['ROLLBACK_NOT_SUPPORTED', 'STATIC_ROLLBACK_NOT_SUPPORTED'].includes(err.errorCode) ? 409 : err.message === 'Deployment not found' ? 404 : 500);
            return reply.status(status).send({
                success: false,
                error: {
                    code: err.errorCode || 'ROLLBACK_FAILED',
                    message: err.message || 'Rollback failed'
                }
            });
        }
    });

    fastify.post('/:id/restart', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            await DeploymentService.restartDeployment(request.user.id, id);
            return { success: true, data: { message: 'Deployment restarted' } };
        } catch (err: any) {
            const status = err.statusCode || (['NO_CONTAINER', 'DEPLOYMENT_NOT_RUNNING', 'CONTAINER_NOT_FOUND'].includes(err.errorCode) ? 409 : err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404 : 500);
            return reply.status(status).send({
                success: false,
                error: {
                    code: err.errorCode || 'RESTART_FAILED',
                    message: err.message || 'Restart failed'
                }
            });
        }
    });

    fastify.post('/:id/start', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            const result = await DeploymentService.startDeployment(request.user.id, id);
            return { success: true, data: result };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'START_FAILED');
        }
    });

    fastify.post('/:id/stop', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            await DeploymentService.stopDeployment(request.user.id, id);
            return { success: true, data: { message: 'Deployment stopped' } };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'STOP_FAILED');
        }
    });

    fastify.post('/:id/pause', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            await DeploymentService.pauseDeployment(request.user.id, id);
            return { success: true, data: { message: 'Deployment paused' } };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'PAUSE_FAILED');
        }
    });

    fastify.post('/:id/resume', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            const result = await DeploymentService.resumeDeployment(request.user.id, id);
            return { success: true, data: result };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'RESUME_FAILED');
        }
    });

    fastify.delete('/:id', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            const result = await DeploymentService.deleteDeployment(request.user.id, id);
            return { success: true, data: result };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'DELETE_FAILED');
        }
    });
}

function sendLifecycleError(reply: any, err: any, fallbackCode: string) {
    const status = err.statusCode || (err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404
        : ['INVALID_STATE_TRANSITION', 'NO_CONTAINER', 'NO_RUNNING_CONTAINER', 'CONTAINER_NOT_FOUND'].includes(err.errorCode) ? 409
          : 500);
    return reply.status(status).send({
        success: false,
        error: {
            code: err.errorCode || fallbackCode,
            message: err.message || 'Lifecycle action failed'
        }
    });
}
