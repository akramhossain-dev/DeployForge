import { FastifyInstance } from 'fastify';
import { NotificationService } from '../services/notification.service';
import { z } from 'zod';

const notificationIdSchema = z.object({
    id: z.string().uuid({ message: 'Invalid notification ID format' }),
});

const listQuerySchema = z.object({
    type: z.string().optional(),
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

    // List notifications with filters
    fastify.get('/', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const filters = listQuerySchema.parse(request.query);
        const result = await NotificationService.list(request.user.id, filters);
        return { success: true, data: result };
    });

    // Get unread count
    fastify.get('/unread-count', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request) => {
        const count = await NotificationService.getUnreadCount(request.user.id);
        return { success: true, data: { count } };
    });

    // Get recent notifications (for dropdown)
    fastify.get('/recent', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const notifications = await NotificationService.getRecent(request.user.id);
        return { success: true, data: notifications };
    });

    // Mark single notification as read
    fastify.patch('/:id/read', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const { id } = notificationIdSchema.parse(request.params);
        await NotificationService.markAsRead(request.user.id, id);
        return { success: true, message: 'Notification marked as read' };
    });

    // Mark all notifications as read
    fastify.patch('/read-all', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        await NotificationService.markAllAsRead(request.user.id);
        return { success: true, message: 'All notifications marked as read' };
    });

    // Delete single notification
    fastify.delete('/:id', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const { id } = notificationIdSchema.parse(request.params);
        await NotificationService.delete(request.user.id, id);
        return { success: true, message: 'Notification deleted' };
    });

    // Delete all notifications
    fastify.delete('/all', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request) => {
        await NotificationService.deleteAll(request.user.id);
        return { success: true, message: 'All notifications deleted' };
    });
}
