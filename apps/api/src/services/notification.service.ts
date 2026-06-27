import prisma from '@deployforge/database';
import { AlertType, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

interface NotificationFilters {
    type?: string;
    vpsId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    isRead?: string;
    page?: number;
    limit?: number;
}

export class NotificationService {
    /**
     * List notifications with filtering, search, and pagination.
     */
    static async list(userId: string, filters: NotificationFilters = {}) {
        const page = Math.max(1, filters.page || 1);
        const limit = Math.min(100, Math.max(1, filters.limit || 20));
        const skip = (page - 1) * limit;

        const where: Prisma.NotificationWhereInput = { userId };

        if (filters.type) {
            where.type = filters.type as AlertType;
        }

        if (filters.vpsId) {
            where.vpsId = filters.vpsId;
        }

        if (filters.isRead === 'true') {
            where.isRead = true;
        } else if (filters.isRead === 'false') {
            where.isRead = false;
        }

        if (filters.startDate || filters.endDate) {
            where.createdAt = {};
            if (filters.startDate) {
                (where.createdAt as Prisma.DateTimeFilter).gte = new Date(filters.startDate);
            }
            if (filters.endDate) {
                (where.createdAt as Prisma.DateTimeFilter).lte = new Date(filters.endDate);
            }
        }

        if (filters.search) {
            where.OR = [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { message: { contains: filters.search, mode: 'insensitive' } },
                { serverName: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        const [notifications, total] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    vps: {
                        select: { id: true, name: true, ipAddress: true },
                    },
                },
            }),
            prisma.notification.count({ where }),
        ]);

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get count of unread notifications.
     */
    static async getUnreadCount(userId: string): Promise<number> {
        return prisma.notification.count({
            where: { userId, isRead: false },
        });
    }

    /**
     * Mark a single notification as read.
     */
    static async markAsRead(userId: string, id: string) {
        return prisma.notification.updateMany({
            where: { id, userId },
            data: { isRead: true },
        });
    }

    /**
     * Mark all notifications as read for a user.
     */
    static async markAllAsRead(userId: string) {
        return prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
    }

    /**
     * Delete a single notification.
     */
    static async delete(userId: string, id: string) {
        return prisma.notification.deleteMany({
            where: { id, userId },
        });
    }

    /**
     * Delete all notifications for a user.
     */
    static async deleteAll(userId: string) {
        return prisma.notification.deleteMany({
            where: { userId },
        });
    }

    /**
     * Get recent notifications (for dropdown).
     */
    static async getRecent(userId: string, limit = 10) {
        return prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                vps: {
                    select: { id: true, name: true, ipAddress: true },
                },
            },
        });
    }

    /**
     * Clean up old notifications (older than 30 days).
     */
    static async cleanupOld(daysOld = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysOld);

        const result = await prisma.notification.deleteMany({
            where: {
                createdAt: { lt: cutoff },
                isRead: true,
            },
        });

        if (result.count > 0) {
            logger.info({ count: result.count, daysOld }, 'Cleaned up old notifications');
        }

        return result.count;
    }
}
