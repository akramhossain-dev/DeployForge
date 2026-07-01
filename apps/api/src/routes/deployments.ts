import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { DeploymentService } from '../services/deployment.service';
import { RollbackService } from '../services/rollback.service';
import { formatDeploymentResponse } from '../utils/sanitizers';
import { apiError, apiMessage, apiSuccess } from '../utils/http';
import { EnvironmentService } from '../services/deployment/environment.service';

const deploymentParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid deployment ID format' }),
});

const rollbackBodySchema = z.object({
    historyId: z.string().uuid({ message: 'Invalid history ID format' }),
});

export default async function deploymentAliasRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const deployments = await prisma.deployment.findMany({
            where: {
                OR: [
                    { userId: request.user.id },
                    {
                        project: {
                            OR: [
                                { userId: request.user.id },
                                { members: { some: { userId: request.user.id } } }
                            ]
                        }
                    }
                ]
            },
            include: {
                project: true,
                vps: { include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } } },
                deploymentLogs: { take: 1, orderBy: { createdAt: 'desc' } },
                history: { take: 3, orderBy: { createdAt: 'desc' } },
                domains: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return apiSuccess(deployments.map(formatDeploymentResponse).filter(Boolean));
    });

    fastify.get('/analytics', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const projects = await prisma.project.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { userId: request.user.id },
                            { members: { some: { userId: request.user.id } } }
                        ]
                    },
                    {
                        deployments: {
                            some: {}
                        }
                    }
                ]
            },
            include: {
                deployments: {
                    select: {
                        id: true,
                        name: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true,
                        commitHash: true,
                        branch: true,
                        deploymentLogs: {
                            where: { type: 'build' },
                            select: { createdAt: true },
                            orderBy: { createdAt: 'asc' }
                        },
                        history: {
                            where: { status: 'ROLLED_BACK' },
                            select: { id: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const analytics = projects.map(project => {
            const deps = project.deployments;
            const totalDeployments = deps.length;
            const failedDeployments = deps.filter(d => d.status === 'FAILED').length;
            const successRate = totalDeployments > 0 
                ? Math.round(((totalDeployments - failedDeployments) / totalDeployments) * 100) 
                : 0;

            const completedDeps = deps.filter(d => 
                !['PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING', 'BUILDING', 'DEPLOYING'].includes(d.status)
            );

            const successfulDeps = completedDeps.filter(d => 
                ['RUNNING', 'STOPPED', 'PAUSED', 'ROLLED_BACK'].includes(d.status)
            );

            const targetDeps = successfulDeps.length > 0 ? successfulDeps : completedDeps;
            
            let totalBuildTimeMs = 0;
            let totalDeployTimeMs = 0;
            let timeCounts = 0;

            targetDeps.forEach(d => {
                const totalDurationMs = new Date(d.updatedAt).getTime() - new Date(d.createdAt).getTime();
                let buildTimeMs = 0;
                if (d.deploymentLogs.length > 1) {
                    const start = new Date(d.deploymentLogs[0].createdAt).getTime();
                    const end = new Date(d.deploymentLogs[d.deploymentLogs.length - 1].createdAt).getTime();
                    buildTimeMs = Math.max(0, end - start);
                }
                const deployTimeMs = Math.max(0, totalDurationMs - buildTimeMs);

                totalBuildTimeMs += buildTimeMs;
                totalDeployTimeMs += deployTimeMs;
                timeCounts++;
            });

            const avgBuildTime = timeCounts > 0 ? Math.round((totalBuildTimeMs / timeCounts) / 1000) : 0;
            const avgDeployTime = timeCounts > 0 ? Math.round((totalDeployTimeMs / timeCounts) / 1000) : 0;

            const rollbackCount = deps.reduce((sum, d) => sum + d.history.length, 0);

            const lastDeployment = deps.length > 0 ? {
                id: deps[0].id,
                name: deps[0].name,
                status: deps[0].status,
                commitHash: deps[0].commitHash,
                branch: deps[0].branch,
                createdAt: deps[0].createdAt
            } : null;

            return {
                projectId: project.id,
                projectName: project.name,
                repositoryUrl: project.repositoryUrl,
                branch: project.branch,
                totalDeployments,
                failedDeployments,
                successRate,
                avgBuildTime,
                avgDeployTime,
                rollbackCount,
                lastDeployment
            };
        });

        return apiSuccess(analytics);
    });

    fastify.get('/:id', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const deployment = await DeploymentService.getStatus(request.user.id, id);
        if (!deployment) {
            return apiError(reply, 404, 'NOT_FOUND', 'Deployment not found');
        }
        return apiSuccess(formatDeploymentResponse(deployment));
    });

    fastify.get('/:id/env', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const deployment = await prisma.deployment.findFirst({
            where: {
                id,
                OR: [
                    { userId: request.user.id },
                    {
                        project: {
                            OR: [
                                { userId: request.user.id },
                                { members: { some: { userId: request.user.id } } }
                            ]
                        }
                    }
                ]
            }
        });
        if (!deployment) {
            return apiError(reply, 404, 'NOT_FOUND', 'Deployment not found');
        }
        const env = EnvironmentService.getDecryptedEnv(deployment.env);
        return apiSuccess(env);
    });

    fastify.put('/:id/env', {
        config: { rateLimit: { max: 15, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const deployment = await prisma.deployment.findFirst({
            where: {
                id,
                OR: [
                    { userId: request.user.id },
                    {
                        project: {
                            OR: [
                                { userId: request.user.id },
                                { members: { some: { userId: request.user.id, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                            ]
                        }
                    }
                ]
            }
        });
        if (!deployment) {
            return apiError(reply, 404, 'NOT_FOUND', 'Deployment not found');
        }

        const body = request.body as any;
        if (!body || body.version !== 2 || !Array.isArray(body.files)) {
            return apiError(reply, 400, 'BAD_REQUEST', 'Invalid environment configuration payload format. Must be version 2.');
        }

        try {
            const encrypted = EnvironmentService.encryptEnv(body);
            await prisma.deployment.update({
                where: { id },
                data: { env: encrypted }
            });
            return apiSuccess({ message: 'Environment variables updated. Restart or redeploy the application to apply changes.' });
        } catch (err: any) {
            return apiError(reply, 400, err.errorCode || 'VALIDATION_FAILED', err.message || 'Validation failed');
        }
    });

    fastify.get('/:id/env/history', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const deployment = await prisma.deployment.findFirst({
            where: {
                id,
                OR: [
                    { userId: request.user.id },
                    {
                        project: {
                            OR: [
                                { userId: request.user.id },
                                { members: { some: { userId: request.user.id } } }
                            ]
                        }
                    }
                ]
            }
        });
        if (!deployment) {
            return apiError(reply, 404, 'NOT_FOUND', 'Deployment not found');
        }

        const histories = await prisma.deploymentHistory.findMany({
            where: { deploymentId: id, status: { in: ['SUCCESS', 'ROLLED_BACK'] } },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        const historyWithEnv = histories.map((h, index) => {
            const env = EnvironmentService.getDecryptedEnv(h.env);
            return {
                id: h.id,
                version: h.version,
                status: h.status,
                createdAt: h.createdAt,
                env,
                deploymentNumber: histories.length - index
            };
        });

        return apiSuccess(historyWithEnv);
    });

    fastify.post('/:id/redeploy', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const deployment = await prisma.deployment.findFirst({
            where: {
                id,
                OR: [
                    { userId: request.user.id },
                    {
                        project: {
                            OR: [
                                { userId: request.user.id },
                                { members: { some: { userId: request.user.id, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                            ]
                        }
                    }
                ]
            },
            include: { project: true }
        });
        if (!deployment) {
            return apiError(reply, 404, 'NOT_FOUND', 'Deployment not found');
        }

        const sourceType = deployment.sourceType || (deployment.project.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
        if (sourceType !== 'github') {
            return apiError(reply, 400, 'REDEPLOY_NOT_SUPPORTED', 'Redeployment is only supported for GitHub repositories.');
        }

        try {
            const decEnv = EnvironmentService.getDecryptedEnv(deployment.env);
            const result = await DeploymentService.deployProject(request.user.id, {
                type: 'github_repo',
                projectId: deployment.projectId,
                vpsId: deployment.vpsId,
                branch: deployment.branch || 'main',
                commitHash: undefined,
                skipWebhookRegistration: true,
                domainName: deployment.domain || undefined,
                env: decEnv as any,
                mode: deployment.mode as any
            });

            return apiSuccess(result);
        } catch (err: any) {
            return apiError(reply, 500, 'REDEPLOY_FAILED', err.message || 'Redeployment failed');
        }
    });

    fastify.post('/:id/rollback', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        const { historyId } = rollbackBodySchema.parse(request.body);
        try {
            const result = await RollbackService.rollback(request.user.id, id, historyId);
            return apiSuccess(result);
        } catch (err: any) {
            const status = err.statusCode || (['ROLLBACK_NOT_SUPPORTED', 'STATIC_ROLLBACK_NOT_SUPPORTED'].includes(err.errorCode) ? 409 : err.message === 'Deployment not found' ? 404 : 500);
            return apiError(reply, status, err.errorCode || 'ROLLBACK_FAILED', err.message || 'Rollback failed');
        }
    });

    fastify.post('/:id/restart', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            await DeploymentService.restartDeployment(request.user.id, id);
            return apiMessage('Deployment restarted');
        } catch (err: any) {
            const status = err.statusCode || (['NO_CONTAINER', 'DEPLOYMENT_NOT_RUNNING', 'CONTAINER_NOT_FOUND'].includes(err.errorCode) ? 409 : err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404 : 500);
            return apiError(reply, status, err.errorCode || 'RESTART_FAILED', err.message || 'Restart failed');
        }
    });

    fastify.post('/:id/start', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            const result = await DeploymentService.startDeployment(request.user.id, id);
            return apiSuccess(result);
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'START_FAILED');
        }
    });

    fastify.post('/:id/stop', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            await DeploymentService.stopDeployment(request.user.id, id);
            return apiMessage('Deployment stopped');
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'STOP_FAILED');
        }
    });

    fastify.post('/:id/pause', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            await DeploymentService.pauseDeployment(request.user.id, id);
            return apiMessage('Deployment paused');
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'PAUSE_FAILED');
        }
    });

    fastify.post('/:id/resume', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            const result = await DeploymentService.resumeDeployment(request.user.id, id);
            return apiSuccess(result);
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'RESUME_FAILED');
        }
    });

    fastify.delete('/:id', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = deploymentParamsSchema.parse(request.params);
        try {
            const result = await DeploymentService.deleteDeployment(request.user.id, id);
            return apiSuccess(result);
        } catch (err: any) {
            return sendLifecycleError(reply, err, 'DELETE_FAILED');
        }
    });
}

function sendLifecycleError(reply: any, err: any, fallbackCode: string) {
    const status = err.statusCode || (err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404
        : ['INVALID_STATE_TRANSITION', 'NO_CONTAINER', 'NO_RUNNING_CONTAINER', 'CONTAINER_NOT_FOUND'].includes(err.errorCode) ? 409
            : 500);
    return apiError(reply, status, err.errorCode || fallbackCode, err.message || 'Lifecycle action failed');
}
