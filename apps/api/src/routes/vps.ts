import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { VPSConnectionFailure, VPSService } from '../services/vps.service';
import { sanitizeVps } from '../utils/sanitizers';

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
            return { success: true, data: sanitizeVps(vps) };
        } catch (error) {
            return sendVpsError(reply, error);
        }
    });

    fastify.delete('/:id', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive route: 5/min
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
            return { success: true, data: health };
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
    const message = error instanceof Error ? error.message : 'VPS request failed';
    return reply.status(500).send({
        success: false,
        error: {
            code: 'VPS_ERROR',
            message
        }
    });
}
