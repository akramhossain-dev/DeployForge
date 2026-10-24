import { FastifyInstance } from 'fastify';
import { NotificationService } from '../services/notification.service';
import { z } from 'zod';
import { AlertType } from '@deployforge/database';

const notificationIdSchema = z.object({
    id: z.string().uuid({ message: 'Invalid notification ID format' }),
});

const listQuerySchema = z.object({
    type: z.nativeEnum(AlertType).optional(),
    vpsId: z.string().uuid().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    search: z.string().optional(),
    isRead: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const filters = listQuerySchema.parse(request.query);
        const result = await NotificationService.list(request.user.id, filters);
        return { success: true, data: result };
    });

    fastify.get('/unread-count', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request) => {
        const count = await NotificationService.getUnreadCount(request.user.id);
        return { success: true, data: { count } };
    });

    fastify.get('/recent', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const notifications = await NotificationService.getRecent(request.user.id);
        return { success: true, data: notifications };
    });

    fastify.patch('/:id/read', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const { id } = notificationIdSchema.parse(request.params);
        await NotificationService.markAsRead(request.user.id, id);
        return { success: true, message: 'Notification marked as read' };
    });

    fastify.patch('/read-all', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        await NotificationService.markAllAsRead(request.user.id);
        return { success: true, message: 'All notifications marked as read' };
    });

    fastify.delete('/all', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request) => {
        const result = await NotificationService.deleteAll(request.user.id);
        return { success: true, data: { deletedCount: result.count }, message: 'All notifications deleted' };
    });

    fastify.delete('/:id', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const { id } = notificationIdSchema.parse(request.params);
        const result = await NotificationService.delete(request.user.id, id);
        return { success: true, data: { deletedCount: result.count }, message: 'Notification deleted' };
    });
}
