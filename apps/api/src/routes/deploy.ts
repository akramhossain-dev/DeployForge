import { FastifyInstance } from 'fastify';
import { DeploymentError, DeploymentService } from '../services/deployment.service';
import { z } from 'zod';
import prisma from '@deployforge/database';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { RollbackService } from '../services/rollback.service';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import { sanitizeDeployment } from '../utils/sanitizers';

const tokenService = new TokenService(config.auth.jwtSecret);

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
    env: z.record(z.string()).optional().default({}),
});

const wsParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid deployment ID format' }),
});

const wsQuerySchema = z.object({
    token: z.string().min(1, 'Token is required'),
});

const rollbackBodySchema = z.object({
    historyId: z.string().uuid({ message: 'Invalid history ID format' }).optional(),
});

export default async function deployRoutes(fastify: FastifyInstance) {
    // 1. GitHub Deployment
    fastify.post('/github', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        try {
            const { projectId, repositoryId, vpsId, branch, autoDeploy, domainName, env, mode } = githubDeploySchema.parse(request.body);
            const project = projectId
                ? await prisma.project.findFirst({ where: { id: projectId, userId: request.user.id } })
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
            });
            return { success: true, data: sanitizeDeployment(deployment) };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/upload', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
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

            const project = projectId
                ? await prisma.project.findFirst({ where: { id: projectId, userId: request.user.id } })
                : await prisma.project.create({
                    data: {
                        userId: request.user.id,
                        name: projectName.replace(/[^A-Za-z0-9._ -]/g, '').trim() || 'Uploaded project',
                        repositoryUrl: `upload://${safeName}`,
                        branch: 'upload',
                    },
                });

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
            });

            return { success: true, data: sanitizeDeployment(deployment) };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    // 2. List Deployments
    fastify.get('/list', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
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
        return { success: true, data: deployments.map(sanitizeDeployment).filter(Boolean) };
    });

    // 3. Get Logs
    fastify.get('/:id/logs', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        const logs = await prisma.deploymentLog.findMany({
            where: { deploymentId: id, deployment: { userId: request.user.id } },
            orderBy: { createdAt: 'asc' },
        });
        return { success: true, data: logs };
    });

    // WebSocket logs stream
    fastify.get('/:id/logs/stream', { websocket: true }, async (connection, request) => {
        let id: string;
        let token: string;
        try {
            const params = wsParamsSchema.parse(request.params);
            const query = wsQuerySchema.parse(request.query);
            id = params.id;
            token = query.token;
        } catch (err: any) {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: 'Invalid parameters or query' }));
            connection.socket.close();
            return;
        }

        let userId = '';
        try {
            const payload = tokenService.verifyToken(token);
            userId = payload.userId;
        } catch {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: 'Unauthorized' }));
            connection.socket.close();
            return;
        }

        const deployment = await prisma.deployment.findFirst({ where: { id, userId }, select: { id: true } });
        if (!deployment) {
            connection.socket.send(JSON.stringify({ event: 'deployment:error', message: 'Deployment not found' }));
            connection.socket.close();
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
                connection.socket.send(JSON.stringify({ event: 'deployment:log', data: log }));
            }
        };

        await sendLogs();
        const interval = setInterval(() => {
            sendLogs().catch((err) => {
                connection.socket.send(JSON.stringify({ event: 'deployment:error', message: err.message }));
            });
        }, 1500);

        connection.socket.on('close', () => clearInterval(interval));
    });

    fastify.get('/status/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            const deployment = await DeploymentService.getStatus(request.user.id, id);
            return { success: true, data: sanitizeDeployment(deployment) };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/rollback/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            const { historyId } = rollbackBodySchema.parse(request.body);
            const result = await RollbackService.rollback(request.user.id, id, historyId);
            return { success: true, data: result };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    // 4. Start/Stop
    fastify.post('/:id/stop', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            await DeploymentService.stopDeployment(request.user.id, id);
            return { success: true, data: { message: 'Deployment stopped' } };
        } catch (err: any) {
            return sendDeploymentError(reply, err);
        }
    });

    fastify.post('/:id/start', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive: 5/min
    }, async (request, reply) => {
        try {
            const { id } = idParamsSchema.parse(request.params);
            await DeploymentService.startDeployment(request.user.id, id);
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
        uploadPath = path.join(uploadDir, safeName);
        await pipeline(part.file, fs.createWriteStream(uploadPath, { flags: 'wx', mode: 0o600 }));
    }

    if (!uploadPath) return null;
    return { uploadPath, safeName, fields };
}

function sendDeploymentError(reply: any, err: any) {
    const status = err instanceof DeploymentError
        ? err.errorCode.endsWith('NOT_FOUND') ? 404 : 400
        : err?.name === 'ZodError' ? 400 : 500;

    return reply.status(status).send({
        success: false,
        error: {
            code: err?.errorCode || (err?.name === 'ZodError' ? 'VALIDATION_ERROR' : 'DEPLOYMENT_ERROR'),
            message: status >= 500 ? 'Internal Server Error' : err.message,
            stage: err?.stage || 'request',
        }
    });
}

function parseEnvField(value?: string) {
    if (!value) return {};
    try {
        const parsed = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new DeploymentError('uploading', 'Environment variables must be a JSON object', 'INVALID_ENV_FORMAT');
        }
        return parsed as Record<string, string>;
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
