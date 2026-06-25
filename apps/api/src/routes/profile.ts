import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PasswordService } from '@deployforge/security';
import { AccountService } from '../services/account.service';

const strongPasswordSchema = z.string()
    .min(6)
    .refine((password) => PasswordService.validate(password).valid, {
        message: 'Password does not meet security requirements',
    });

const updateProfileSchema = z.object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().optional(),
    newPassword: strongPasswordSchema,
});

const updatePreferencesSchema = z.object({
    emailDeployments: z.boolean().optional(),
    emailSecurity: z.boolean().optional(),
    emailNewsletter: z.boolean().optional(),
}).strict();

const auditLogQuerySchema = z.object({
    page: z.preprocess((val) => val ? parseInt(val as string) : 1, z.number().int().positive().default(1)),
    limit: z.preprocess((val) => val ? parseInt(val as string) : 10, z.number().int().positive().default(10)),
    search: z.string().optional(),
    category: z.string().optional(),
});

const deleteAccountSchema = z.object({
    passwordConfirm: z.string().min(1, 'Password confirmation is required'),
});

export default async function profileRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const profile = await AccountService.getProfile(request.user.id);
        return { success: true, data: profile };
    });

    fastify.patch('/', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const body = updateProfileSchema.parse(request.body);
        const updated = await AccountService.updateProfile(request.user.id, body, request.ip, request.headers['user-agent']);
        return { success: true, data: updated };
    });

    fastify.post('/change-password', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request) => {
        const body = changePasswordSchema.parse(request.body);
        await AccountService.changePassword(request.user.id, body, request.ip, request.headers['user-agent']);
        return { success: true, data: { message: 'Password updated successfully' } };
    });

    fastify.get('/preferences', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const prefs = await AccountService.getNotificationPreferences(request.user.id);
        return { success: true, data: prefs };
    });

    fastify.patch('/preferences', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const body = updatePreferencesSchema.parse(request.body);
        const updated = await AccountService.updateNotificationPreferences(request.user.id, body);
        return { success: true, data: updated };
    });

    fastify.get('/audit-logs', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const query = auditLogQuerySchema.parse(request.query);
        const result = await AccountService.getAuditLogs(request.user.id, {
            page: query.page,
            limit: query.limit,
            search: query.search,
            category: query.category,
        });
        return { success: true, data: result };
    });

    fastify.delete('/', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        const { passwordConfirm } = deleteAccountSchema.parse(request.body);
        await AccountService.deleteAccount(request.user.id, passwordConfirm, request.ip, request.headers['user-agent']);
        return { success: true, data: { message: 'Account deleted successfully' } };
    });
}
