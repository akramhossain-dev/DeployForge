import prisma from '@deployforge/database';

export type LogType = 'build' | 'runtime' | 'error' | 'system';
export type LogLevel = 'info' | 'warn' | 'error';

export class LoggingService {
    static async log(deploymentId: string, message: string, type: LogType = 'runtime', level: LogLevel = 'info') {
        return await prisma.deploymentLog.create({
            data: {
                deploymentId,
                message,
                type,
                level,
            },
        });
    }

    static async getLogs(deploymentId: string, limit = 100) {
        return await prisma.deploymentLog.findMany({
            where: { deploymentId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }

    static async clearLogs(deploymentId: string) {
        return await prisma.deploymentLog.deleteMany({
            where: { deploymentId },
        });
    }
}
