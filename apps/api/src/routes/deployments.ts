import { FastifyInstance } from 'fastify';
import prisma from '@deployforge/database';
import { DeploymentService } from '../services/deployment.service';
import { RollbackService } from '../services/rollback.service';

export default async function deploymentAliasRoutes(fastify: FastifyInstance) {
    fastify.get('/', { preHandler: [(fastify as any).authGuard] }, async (request) => {
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
        return { success: true, data: deployments.map(maskDeployment) };
    });

    fastify.get('/:id', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const deployment = await DeploymentService.getStatus(request.user.id, id);
        if (!deployment) return reply.status(404).send({ success: false, message: 'Deployment not found', errorCode: 'DEPLOYMENT_NOT_FOUND' });
        return { success: true, data: maskDeployment(deployment) };
    });

    fastify.post('/:id/rollback', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const { historyId } = (request.body || {}) as { historyId?: string };
        try {
            const result = await RollbackService.rollback(request.user.id, id, historyId);
            return { success: true, data: result };
        } catch (err: any) {
            const status = err.errorCode === 'ROLLBACK_NOT_SUPPORTED' ? 409 : err.message === 'Deployment not found' ? 404 : 500;
            return reply.status(status).send({
                success: false,
                stage: err.stage || 'rollback',
                message: err.message || 'Rollback failed',
                errorCode: err.errorCode || 'ROLLBACK_FAILED',
            });
        }
    });

    fastify.post('/:id/restart', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            await DeploymentService.restartDeployment(request.user.id, id);
            return { success: true, message: 'Deployment restarted' };
        } catch (err: any) {
            const status = ['NO_CONTAINER', 'DEPLOYMENT_NOT_RUNNING', 'CONTAINER_NOT_FOUND'].includes(err.errorCode) ? 409 : err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404 : 500;
            return reply.status(status).send({
                success: false,
                stage: err.stage || 'deploying',
                message: err.message || 'Restart failed',
                errorCode: err.errorCode || 'RESTART_FAILED',
            });
        }
    });

    fastify.post('/:id/start', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            const result = await DeploymentService.startDeployment(request.user.id, id);
            return { success: true, data: result, message: 'Deployment started' };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'START_FAILED');
        }
    });

    fastify.post('/:id/stop', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            await DeploymentService.stopDeployment(request.user.id, id);
            return { success: true, message: 'Deployment stopped' };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'STOP_FAILED');
        }
    });

    fastify.post('/:id/pause', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            await DeploymentService.pauseDeployment(request.user.id, id);
            return { success: true, message: 'Deployment paused' };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'PAUSE_FAILED');
        }
    });

    fastify.post('/:id/resume', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            const result = await DeploymentService.resumeDeployment(request.user.id, id);
            return { success: true, data: result, message: 'Deployment resumed' };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'RESUME_FAILED');
        }
    });

    fastify.delete('/:id', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        try {
            const result = await DeploymentService.deleteDeployment(request.user.id, id);
            return { success: true, data: result, message: 'Deployment deleted' };
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'DELETE_FAILED');
        }
    });
}

function sendLifecycleError(reply: any, err: any, fallbackCode: string) {
    const status = err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404
        : ['INVALID_STATE_TRANSITION', 'NO_CONTAINER', 'NO_RUNNING_CONTAINER', 'CONTAINER_NOT_FOUND'].includes(err.errorCode) ? 409
          : 500;
    return reply.status(status).send({
        success: false,
        stage: err.stage || 'lifecycle',
        message: err.message || 'Lifecycle action failed',
        errorCode: err.errorCode || fallbackCode,
    });
}

function maskDeployment(deployment: any) {
    const envPreview = DeploymentService.envPreview(deployment.env);
    const { env, ...safeDeployment } = deployment;
    if (safeDeployment.vps) {
        const { encryptedPassword, encryptedPrivateKey, ...safeVps } = safeDeployment.vps;
        safeDeployment.vps = safeVps;
    }
    const activeDomain = safeDeployment.domains?.find((domain: any) => domain.status === 'ACTIVE') || safeDeployment.domains?.[0];
    const hostType = safeDeployment.hostType || (activeDomain ? 'domain' : 'ip');
    const sourceType = safeDeployment.sourceType || (safeDeployment.project?.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
    const domainName = safeDeployment.domain || activeDomain?.domainName || null;
    const url = hostType === 'domain' && domainName
        ? `http://${domainName}`
        : safeDeployment.vps?.ipAddress && safeDeployment.port
          ? `http://${safeDeployment.vps.ipAddress}:${safeDeployment.port}`
          : null;
    return {
        ...safeDeployment,
        envPreview,
        hostType,
        sourceType,
        repoUrl: safeDeployment.repoUrl || (sourceType === 'github' ? safeDeployment.project?.repositoryUrl : null),
        branch: safeDeployment.branch || (sourceType === 'github' ? safeDeployment.project?.branch : null),
        uploadPath: safeDeployment.uploadPath || (sourceType === 'upload' ? safeDeployment.project?.repositoryUrl : null),
        url,
        domain: domainName,
    };
}
