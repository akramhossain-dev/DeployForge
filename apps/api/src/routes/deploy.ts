import { FastifyInstance } from 'fastify';
import { DeploymentError, DeploymentService } from '../services/deployment.service';
import { z } from 'zod';
import prisma from '@deployforge/database';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { RollbackService } from '../services/rollback.service';
import { formatDeploymentResponse, sanitizeDeployment } from '../utils/sanitizers';
import { AccountService } from '../services/account.service';
import { socketToken, verifyDeploymentSocketAccess } from '../utils/socket-auth';

const idParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid ID format' }),
});

const githubDeploySchema = z.object({
    projectId: z.string().uuid({ message: 'Invalid projectId format' }).optional(),
    repositoryId: z.string().uuid({ message: 'Invalid repositoryId format' }).optional(),
    vpsId: z.string().uuid({ message: 'Invalid vpsId format' }),
    branch: z.string().default('main'),
    environment: z.enum(['production', 'development']).optional(),
    mode: z.enum(['production', 'sandbox']).optional().default('production'),
    autoDeploy: z.boolean().optional().default(true),
    domainName: z.string().trim().optional(),
    env: z.any().optional(),
    composeService: z.string().trim().min(1).max(63).optional(),
    composePort: z.coerce.number().int().min(1).max(65535).optional(),
    resourceTier: z.enum(['STATIC', 'SERVER', 'FULLSTACK']).optional(),
});

const wsParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid deployment ID format' }),
});

const rollbackBodySchema = z.object({
    historyId: z.string().uuid({ message: 'Invalid history ID format' }).optional(),
    releaseId: z.string().uuid({ message: 'Invalid release ID format' }).optional(),
}).refine((value) => !(value.historyId && value.releaseId), { message: 'Provide either releaseId or historyId, not both' });

export default async function deployRoutes(fastify: FastifyInstance) {
    
    fastify.post('/github', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        try {
            const { projectId, repositoryId, vpsId, branch, autoDeploy, domainName, env, mode, composeService, composePort, resourceTier } = githubDeploySchema.parse(request.body);
            const project = projectId
                ? await prisma.project.findFirst({
                    where: {
                        id: projectId,
                        OR: [
                            { userId: request.user.id },
                            { members: { some: { userId: request.user.id, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                        ]
                    }
                  })
                : await projectFromRepository(request.user.id, repositoryId, branch);

            if (!project) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Project or repository not found'
                    }
                });
            }

            const deployment = await DeploymentService.deployProject(request.user.id, {
                type: 'github_repo',
                projectId: project.id,
                vpsId,
                branch,
                skipWebhookRegistration: mode === 'sandbox' || !autoDeploy,
                domainName: mode === 'sandbox' ? undefined : domainName || undefined,
                env,
                mode,
                composeService,
                composePort,
                resourceTier,
                correlationId: request.id,
            });
            await AccountService.logAudit(request.user.id, 'DEPLOYMENT_TRIGGERED', `GitHub deployment triggered for project: ${project.name} (branch: ${branch})`, request.ip, request.headers['user-agent']);
            return { success: true, data: sanitizeDeployment(deployment) };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/upload', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        try {
            const upload = await readUploadMultipart(request);
            if (!upload) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'Upload file is required'
                    }
                });
            }

            const { uploadPath, safeName, fields } = upload;
            const vpsId = fields.vpsId || '';
            const projectId = fields.projectId || '';
            const domainName = fields.domainName || '';
            const projectName = fields.name || path.basename(safeName).replace(/\.(zip|tar\.gz|tgz)$/i, '');
            const env = parseEnvField(fields.env);
            const mode = fields.mode === 'sandbox' ? 'sandbox' : 'production';
            const composeService = fields.composeService?.trim() || undefined;
            const composePort = fields.composePort ? Number(fields.composePort) : undefined;
            const resourceTier = fields.resourceTier && ['STATIC', 'SERVER', 'FULLSTACK'].includes(fields.resourceTier)
                ? fields.resourceTier as 'STATIC' | 'SERVER' | 'FULLSTACK'
                : undefined;
            if (fields.resourceTier && !resourceTier) {
                return reply.status(422).send({ success: false, error: { code: 'RESOURCE_TIER_INVALID', message: 'resourceTier must be STATIC, SERVER, or FULLSTACK' } });
            }

            if (composeService && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/.test(composeService)) {
                return reply.status(422).send({ success: false, error: { code: 'COMPOSE_INGRESS_INVALID', message: 'Invalid composeService name' } });
            }
            if (composePort !== undefined && (!Number.isInteger(composePort) || composePort < 1 || composePort > 65535)) {
                return reply.status(422).send({ success: false, error: { code: 'COMPOSE_INGRESS_INVALID', message: 'composePort must be between 1 and 65535' } });
            }

            if (!vpsId || !z.string().uuid().safeParse(vpsId).success) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'A valid vpsId (UUID) is required'
                    }
                });
            }

            if (projectId && !z.string().uuid().safeParse(projectId).success) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'Invalid projectId format (UUID)'
                    }
                });
            }

            if (!/\.zip$/i.test(safeName) && !/\.tar\.gz$/i.test(safeName) && !/\.tgz$/i.test(safeName)) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'Only .zip, .tar.gz, and .tgz uploads are supported'
                    }
                });
            }

            const targetName = projectName.replace(/[^A-Za-z0-9._ -]/g, '').trim() || 'Uploaded project';
            const project = projectId
                ? await prisma.project.findFirst({
                    where: {
                        id: projectId,
                        OR: [
                            { userId: request.user.id },
                            { members: { some: { userId: request.user.id, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                        ]
                    }
                  })
                : await (async () => {
                    const existing = await prisma.project.findFirst({
                        where: {
                            userId: request.user.id,
                            name: targetName,
                            repositoryUrl: { startsWith: 'upload://' }
                        }
                    });
                    if (existing) {
                        return existing;
                    }
                    return prisma.project.create({
                        data: {
                            userId: request.user.id,
                            name: targetName,
                            repositoryUrl: `upload://${safeName}`,
                            branch: 'upload',
                        },
                    });
                })();

            if (!project) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Project not found'
                    }
                });
            }

            const deployment = await DeploymentService.deployProject(request.user.id, {
                type: 'uploaded_file',
                projectId: project.id,
                vpsId,
                uploadPath,
                originalFileName: safeName,
                domainName: mode === 'sandbox' ? undefined : domainName || undefined,
                env,
                mode,
                composeService,
                composePort,
                resourceTier,
                correlationId: request.id,
            });

            await AccountService.logAudit(request.user.id, 'DEPLOYMENT_TRIGGERED', `Zip upload deployment triggered for project: ${project.name}`, request.ip, request.headers['user-agent']);
            return { success: true, data: sanitizeDeployment(deployment) };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.get('/list', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, _reply) => {
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
                vps: {
                    include: {
                        healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } },
                    },
                },
                deploymentLogs: { take: 1, orderBy: { createdAt: 'desc' } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: deployments.map(formatDeploymentResponse).filter(Boolean) };
    });

    fastify.get('/:id/logs', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, _reply) => {
        const { id } = idParamsSchema.parse(request.params);
        const logs = await prisma.deploymentLog.findMany({
            where: {
                deploymentId: id,
                deployment: {
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
            },
            orderBy: { createdAt: 'asc' },
        });
        return { success: true, data: logs };
    });

    fastify.get('/:id/logs/stream', { websocket: true }, async (connection, request) => {
        let id: string;
        let token: string;
        try {
            const params = wsParamsSchema.parse(request.params);
            id = params.id;
            token = socketToken(request);
        } catch (err: any) {
            connection.send(JSON.stringify({ event: 'deployment:error', message: 'Invalid parameters or query' }));
            connection.close();
            return;
        }

        const access = await verifyDeploymentSocketAccess(id, token);
        if (!access) {
            connection.send(JSON.stringify({ event: 'deployment:error', message: 'Unauthorized' }));
            connection.close();
            return;
        }

        let lastSeen = new Date(0);
        const sendLogs = async () => {
            const logs = await prisma.deploymentLog.findMany({
                where: { deploymentId: id, createdAt: { gt: lastSeen } },
                orderBy: { createdAt: 'asc' },
                take: 100,
            });
            for (const log of logs) {
                lastSeen = log.createdAt;
                connection.send(JSON.stringify({ event: 'deployment:log', data: log }));
            }
        };

        await sendLogs();
        const interval = setInterval(() => {
            sendLogs().catch((err) => {
                connection.send(JSON.stringify({ event: 'deployment:error', message: err.message }));
            });
        }, 1500);
        const accessInterval = setInterval(async () => {
            const currentAccess = await verifyDeploymentSocketAccess(id, token).catch(() => null);
            if (!currentAccess) {
                connection.send(JSON.stringify({ event: 'deployment:error', message: 'Access revoked' }));
                connection.close();
            }
        }, 60_000);
        accessInterval.unref();

        connection.on('close', () => {
            clearInterval(interval);
            clearInterval(accessInterval);
        });
    });

    fastify.get('/status/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            const deployment = await DeploymentService.getStatus(request.user.id, id);
            return { success: true, data: formatDeploymentResponse(deployment) };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/rollback/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            const { historyId, releaseId } = rollbackBodySchema.parse(request.body);
            const result = await RollbackService.rollback(request.user.id, id, releaseId || historyId);
            await AccountService.logAudit(request.user.id, 'DEPLOYMENT_ROLLED_BACK', `Deployment rollback queued for deployment ID: ${id} to release ID: ${releaseId || historyId || 'previous'}`, request.ip, request.headers['user-agent']);
            return reply.status(202).send({ success: true, data: result });
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/:id/stop', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            await DeploymentService.stopDeployment(request.user.id, id);
            await AccountService.logAudit(request.user.id, 'DEPLOYMENT_STOPPED', `Deployment stop requested for deployment ID: ${id}`, request.ip, request.headers['user-agent']);
            return { success: true, data: { message: 'Deployment stopped' } };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/:id/start', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            await DeploymentService.startDeployment(request.user.id, id);
            await AccountService.logAudit(request.user.id, 'DEPLOYMENT_STARTED', `Deployment start requested for deployment ID: ${id}`, request.ip, request.headers['user-agent']);
            return { success: true, data: { message: 'Deployment started' } };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });
}

async function readUploadMultipart(request: any) {
    const fields: Record<string, string> = {};
    let uploadPath = '';
    let safeName = '';
    let createdUploadDir = '';

    try {
        for await (const part of request.parts()) {
            if (part.type === 'field') {
                fields[part.fieldname] = String(part.value || '');
                continue;
            }

            if (part.type !== 'file') continue;
            if (uploadPath) {
                part.file.resume();
                continue;
            }

            safeName = part.filename.replace(/[^A-Za-z0-9._-]/g, '');
            if (safeName !== part.filename) {
                part.file.resume();
                throw new DeploymentError('uploading', 'Upload file name contains unsafe characters', 'UNSAFE_UPLOAD_NAME');
            }

            const uploadRoot = path.join(os.tmpdir(), 'deployforge', 'incoming');
            await fs.promises.mkdir(uploadRoot, { recursive: true });
            const uploadDir = await fs.promises.mkdtemp(path.join(uploadRoot, 'upload-'));
            createdUploadDir = uploadDir;
            uploadPath = path.join(uploadDir, safeName);
            await pipeline(part.file, fs.createWriteStream(uploadPath, { flags: 'wx', mode: 0o600 }));
        }
    } catch (err) {
        if (createdUploadDir) {
            try {
                await fs.promises.rm(createdUploadDir, { recursive: true, force: true });
            } catch (rmErr) {
                
            }
        }
        throw err;
    }

    if (!uploadPath) return null;
    return { uploadPath, safeName, fields };
}

function sendDeploymentError(reply: any, err: any) {
    const status = err instanceof DeploymentError
        ? err.statusCode || (err.errorCode.endsWith('NOT_FOUND') ? 404 : err.errorCode.includes('CAPACITY') || err.errorCode === 'DEPLOYMENT_LIMIT_REACHED' ? 409 : err.errorCode.includes('TIER') ? 422 : 400)
        : err?.name === 'ZodError' ? 400 : 500;

    return reply.status(status).send({
        success: false,
        error: {
            code: err?.errorCode || (err?.name === 'ZodError' ? 'VALIDATION_ERROR' : 'DEPLOYMENT_ERROR'),
            message: err.message || 'Internal Server Error',
            stage: err?.stage || 'request',
            requestId: reply.request.id,
            ...(err?.details ? { details: err.details } : {}),
        }
    });
}

function parseEnvField(value?: string) {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object') {
            throw new DeploymentError('uploading', 'Environment variables must be a JSON object', 'INVALID_ENV_FORMAT');
        }
        return parsed;
    } catch (err) {
        if (err instanceof DeploymentError) throw err;
        throw new DeploymentError('uploading', 'Environment variables must be valid JSON', 'INVALID_ENV_FORMAT');
    }
}

async function projectFromRepository(userId: string, repositoryId: string | undefined, branch: string) {
    if (!repositoryId) return null;
    const repository = await prisma.repository.findFirst({
        where: {
            id: repositoryId,
            githubAccount: { userId },
        },
    });
    if (!repository) return null;

    const repositoryUrl = repository.cloneUrl || `https://github.com/${repository.fullName}.git`;
    const existing = await prisma.project.findFirst({
        where: { userId, repositoryUrl },
    });

    if (existing) {
        return prisma.project.update({
            where: { id: existing.id },
            data: { name: repository.name, branch },
        });
    }

    return prisma.project.create({
        data: {
            userId,
            name: repository.name,
            repositoryUrl,
            branch,
        },
    });
}
