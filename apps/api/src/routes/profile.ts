import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccountService } from '../services/account.service';

const updateProfileSchema = z.object({
    name: z.string().min(1, 'Name cannot be empty').optional(),
});

const changePasswordSchema = z.object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8, 'New password must be at least 8 characters long'),
});

export default async function profileRoutes(fastify: FastifyInstance) {
    // Require authentication for all profile endpoints
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', async (request) => {
        const profile = await AccountService.getProfile(request.user.id);
        return { success: true, data: profile };
    });

    fastify.patch('/', async (request) => {
        const body = updateProfileSchema.parse(request.body);
        const updated = await AccountService.updateProfile(request.user.id, body, request.ip, request.headers['user-agent']);
        return { success: true, data: updated };
    });

    fastify.post('/change-password', async (request, reply) => {
        const body = changePasswordSchema.parse(request.body);
        await AccountService.changePassword(request.user.id, body, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Password updated successfully' };
    });

    fastify.get('/preferences', async (request) => {
        const prefs = await AccountService.getNotificationPreferences(request.user.id);
        return { success: true, data: prefs };
    });

    fastify.patch('/preferences', async (request) => {
        const updated = await AccountService.updateNotificationPreferences(request.user.id, request.body);
        return { success: true, data: updated };
    });

    fastify.get('/audit-logs', async (request) => {
        const logs = await AccountService.getAuditLogs(request.user.id);
        return { success: true, data: logs };
    });

    fastify.delete('/', async (request, reply) => {
        const { passwordConfirm } = request.body as { passwordConfirm?: string };
        if (!passwordConfirm) {
            return reply.status(400).send({ success: false, message: 'Password confirmation is required' });
        }
        await AccountService.deleteAccount(request.user.id, passwordConfirm, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Account deleted successfully' };
    });
}
