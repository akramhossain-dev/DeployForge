import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { VPSConnectionFailure, VPSService, buildStoredAuth } from '../services/vps.service';
import { MonitoringService } from '../services/monitoring.service';
import { sanitizeVps } from '../utils/sanitizers';
import { AccountService } from '../services/account.service';
import { RuntimeManagerService, RuntimeInstaller } from '../services/runtime-manager';
import { SSHService } from '@deployforge/vps';

const hostnamePattern = /^(?=.{1,253}$)(?!-)[A-Za-z0-9.-]+(?<!-)$/;

const connectionBaseSchema = z.object({
    ipAddress: z.string().trim().min(1).max(253).refine((value) => z.string().ip().safeParse(value).success || hostnamePattern.test(value), {
        message: 'Enter a valid IP address or hostname',
    }),
    port: z.coerce.number().int().min(1).max(65535).default(22),
    username: z.string().trim().min(1).max(64).default('root'),
    authType: z.enum(['password', 'key', 'ssh_key']).transform((value) => (value === 'ssh_key' ? 'key' : value)),
    password: z.string().optional(),
    privateKey: z.string().optional(),
});

const connectionSchema = connectionBaseSchema.superRefine((value, ctx) => {
    if (value.authType === 'password' && !value.password) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password is required' });
    }
    if (value.authType === 'key' && !value.privateKey) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privateKey'], message: 'Private key is required' });
    }
});

const addVPSSchema = connectionBaseSchema.extend({
    name: z.string().trim().min(1).max(80),
}).superRefine((value, ctx) => {
    if (value.authType === 'password' && !value.password) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password is required' });
    }
    if (value.authType === 'key' && !value.privateKey) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privateKey'], message: 'Private key is required' });
    }
});

const updateVPSSchema = z.object({
    name: z.string().trim().min(1).max(80).optional(),
    ipAddress: z.string().trim().min(1).max(253).refine((value) => z.string().ip().safeParse(value).success || hostnamePattern.test(value), {
        message: 'Enter a valid IP address or hostname',
    }).optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    username: z.string().trim().min(1).max(64).optional(),
    authType: z.enum(['password', 'key', 'ssh_key']).transform((value) => (value === 'ssh_key' ? 'key' : value)).optional(),
    password: z.string().optional(),
    privateKey: z.string().optional(),
}).superRefine((value, ctx) => {
    if (value.authType === 'password' && value.privateKey) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['privateKey'], message: 'Private key cannot be used with password auth' });
    }
    if (value.authType === 'key' && value.password) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Password cannot be used with private key auth' });
    }
});

const testConnectionSchema = z.union([
    z.object({ id: z.string().uuid() }),
    connectionSchema,
]);

const vpsParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid VPS ID format' }),
});

const sshAttemptRateLimit = {
    max: 8,
    timeWindow: '10 minutes',
};

export default async function vpsRoutes(fastify: FastifyInstance) {
    fastify.post('/add', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: sshAttemptRateLimit },
    }, async (request, reply) => {
        try {
            const data = addVPSSchema.parse(request.body);
            const vps = await VPSService.validateAndAdd(request.user!.id, data);
            await AccountService.logAudit(request.user!.id, 'VPS_ADD', `Added VPS: ${vps.name} (${vps.ipAddress})`, request.ip, request.headers['user-agent']);
            return { success: true, data: sanitizeVps(vps) };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.post('/test-connection', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: sshAttemptRateLimit },
    }, async (request, reply) => {
        try {
            const data = testConnectionSchema.parse(request.body);
            const result = 'id' in data
                ? await VPSService.testStoredConnection(request.user!.id, data.id)
                : await VPSService.testConnection(data);

            return result.success ? { success: true, data: result } : reply.status(400).send({
                success: false,
                error: {
                    code: 'CONNECTION_FAILED',
                    message: result.message || 'Connection failed'
                }
            });
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.get('/list', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const vpsList = await VPSService.list(request.user!.id);
        return { success: true, data: vpsList.map(sanitizeVps).filter(Boolean) };
    });

    fastify.get('/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { id } = vpsParamsSchema.parse(request.params);
        const vps = await VPSService.get(request.user!.id, id);
        if (!vps) {
            return reply.status(404).send({
                success: false,
                error: {
                    code: 'VPS_NOT_FOUND',
                    message: 'VPS not found'
                }
            });
        }
        return { success: true, data: sanitizeVps(vps) };
    });

    fastify.patch('/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: sshAttemptRateLimit },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const data = updateVPSSchema.parse(request.body);
            const vps = await VPSService.update(request.user!.id, id, data);
            if (!vps) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'VPS_NOT_FOUND',
                        message: 'VPS not found'
                    }
                });
            }
            await AccountService.logAudit(request.user!.id, 'VPS_UPDATE', `Updated VPS: ${vps.name} (${vps.ipAddress})`, request.ip, request.headers['user-agent']);
            return { success: true, data: sanitizeVps(vps) };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.delete('/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const deleted = await VPSService.delete(request.user!.id, id);
            if (!deleted) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'VPS_NOT_FOUND',
                        message: 'VPS not found'
                    }
                });
            }
            await AccountService.logAudit(request.user!.id, 'VPS_DELETE', `Deleted VPS ID: ${id}`, request.ip, request.headers['user-agent']);
            return { success: true, data: { message: 'VPS deleted' } };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.get('/:id/health', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const { id } = vpsParamsSchema.parse(request.params);
        const health = await prisma.vPSHealth.findMany({
            where: { vpsId: id, vps: { userId: request.user!.id } },
            take: 20,
            orderBy: { checkedAt: 'desc' },
        });
        return { success: true, data: health };
    });

    fastify.post('/:id/health-check', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: sshAttemptRateLimit },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const vps = await VPSService.get(request.user!.id, id);
            if (!vps) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'VPS_NOT_FOUND',
                        message: 'VPS not found'
                    }
                });
            }
            const health = await VPSService.performHealthCheck(id);
            await AccountService.logAudit(request.user!.id, 'VPS_HEALTH_CHECK', `Triggered manual health check for VPS: ${vps.name}`, request.ip, request.headers['user-agent']);
            return { success: true, data: health };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });
    fastify.get('/:id/info', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const info = await VPSService.getServerInfo(request.user!.id, id);
            return { success: true, data: info };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.get('/:id/live-metrics', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const metrics = await VPSService.getLiveMetrics(request.user!.id, id);
            return { success: true, data: metrics };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    // ── Runtime / Environment endpoints ──────────────────────────────────────

    fastify.get('/:id/environment', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 6, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const vps = await prisma.vPS.findFirst({ where: { id, userId: request.user!.id } });
            if (!vps) {
                return reply.status(404).send({ success: false, error: { code: 'VPS_NOT_FOUND', message: 'VPS not found' } });
            }

            const ssh = new SSHService();
            try {
                await ssh.connect({
                    host: vps.ipAddress,
                    port: vps.port,
                    username: vps.username,
                    ...buildStoredAuth(vps),
                });
                const scan = await RuntimeManagerService.scanEnvironment(ssh);
                return { success: true, data: scan };
            } finally {
                ssh.disconnect();
            }
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.post('/:id/install-runtime', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 4, timeWindow: '5 minutes' } },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const bodySchema = z.object({
                runtimes: z.array(
                    z.string().refine(
                        (name) => RuntimeInstaller.isAllowed(name),
                        { message: 'Invalid or unsupported runtime name' },
                    )
                ).min(1).max(10),
            });
            const { runtimes } = bodySchema.parse(request.body);

            const vps = await prisma.vPS.findFirst({ where: { id, userId: request.user!.id } });
            if (!vps) {
                return reply.status(404).send({ success: false, error: { code: 'VPS_NOT_FOUND', message: 'VPS not found' } });
            }

            const ssh = new SSHService();
            const logs: any[] = [];
            try {
                await ssh.connect({
                    host: vps.ipAddress,
                    port: vps.port,
                    username: vps.username,
                    ...buildStoredAuth(vps),
                });

                const scan = await RuntimeManagerService.scanEnvironment(ssh);
                const requirements = runtimes.map((name: string) => ({ name: name as any, requiredVersion: null, sourceFile: 'manual' }));
                const diff = (await import('../services/runtime-manager/dependency-comparator')).DependencyComparator.compare(requirements, scan);
                const plan = { items: diff.map((d: any) => ({
                    name: d.name,
                    action: d.status === 'ok' ? 'skip' : 'install' as any,
                    reason: d.status === 'ok' ? `Already installed (${d.installedVersion})` : 'Requested by user',
                    targetVersion: d.requiredVersion,
                })), isNoop: diff.every((d: any) => d.status === 'ok') };

                await RuntimeInstaller.install(ssh, plan, (entry) => logs.push(entry));

                const installed = plan.items.filter((i: any) => i.action === 'install').map((i: any) => i.name);
                const verification = installed.length > 0
                    ? await (await import('../services/runtime-manager/post-install-verifier')).PostInstallVerifier.verify(ssh, installed)
                    : [];

                await AccountService.logAudit(request.user!.id, 'VPS_RUNTIME_INSTALL', `Installed runtimes on VPS ${vps.name}: ${runtimes.join(', ')}`, request.ip, request.headers['user-agent']);
                return { success: true, data: { logs, verification, plan } };
            } finally {
                ssh.disconnect();
            }
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.get('/:id/installation-logs', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const vps = await VPSService.get(request.user!.id, id);
            if (!vps) {
                return reply.status(404).send({ success: false, error: { code: 'VPS_NOT_FOUND', message: 'VPS not found' } });
            }
            // Return recent installation-related deployment logs for this VPS
            const recentLogs = await prisma.deploymentLog.findMany({
                where: {
                    deployment: { vpsId: id, vps: { userId: request.user!.id } },
                    type: 'system',
                    message: { contains: 'Install' },
                },
                orderBy: { createdAt: 'desc' },
                take: 200,
                select: { id: true, message: true, level: true, createdAt: true, type: true },
            });
            return { success: true, data: recentLogs };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.get('/:id/history', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { id } = vpsParamsSchema.parse(request.params);
            const vps = await VPSService.get(request.user!.id, id);
            if (!vps) {
                return reply.status(404).send({
                    success: false,
                    error: {
                        code: 'VPS_NOT_FOUND',
                        message: 'VPS not found'
                    }
                });
            }

            const querySchema = z.object({
                range: z.enum(['24h', '7d', '30d', 'custom']).default('24h'),
                from: z.string().optional(),
                to: z.string().optional(),
            });

            const { range, from, to } = querySchema.parse(request.query);
            const history = await MonitoringService.getHealthHistory(id, range, from, to);
            return { success: true, data: history };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });
}

function sendVpsError(reply: FastifyReply, error: unknown) {
    if (error instanceof z.ZodError) {
        return reply.status(400).send({
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: error.errors[0]?.message || 'Invalid VPS request'
            }
        });
    }
    if (error instanceof VPSConnectionFailure) {
        const status = error.errorCode === 'VPS_NOT_FOUND' ? 404 : 400;
        return reply.status(status).send({
            success: false,
            error: {
                code: error.errorCode,
                message: error.message
            }
        });
    }
    return reply.status(500).send({
        success: false,
        error: {
            code: 'VPS_ERROR',
            message: 'Internal Server Error'
        }
    });
}
