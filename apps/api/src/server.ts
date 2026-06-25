import { buildApp } from './app';
import { config } from './config/env';
import { deploymentWorker } from './workers/deployment.worker';
import { HardeningService } from './services/hardening.service';
import { BackupService } from './services/backup.service';
import { SuperAdminService } from './services/superadmin.service';
import { VPSService } from './services/vps.service';
import prisma from '@deployforge/database';
import { redisConnection, deploymentQueue, webhookQueue } from './utils/queue';
import { logger } from './utils/logger';

async function start() {
    
    await SuperAdminService.ensureSuperAdmin();

    const app = await buildApp();

    let isShuttingDown = false;

    const handleShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`Received ${signal}. Initiating graceful shutdown...`);

        const forceExitTimeout = setTimeout(() => {
            logger.error('Graceful shutdown timed out. Forcing exit.');
            process.exit(1);
        }, 10000);

        try {
            
            logger.info('Closing Fastify server...');
            await app.close();
            logger.info('Fastify server closed.');

            logger.info('Closing BullMQ worker...');
            await deploymentWorker.close();
            logger.info('BullMQ worker closed.');

            logger.info('Closing BullMQ queues...');
            await deploymentQueue.close();
            await webhookQueue.close();
            logger.info('BullMQ queues closed.');

            logger.info('Quitting Redis connection...');
            await redisConnection.quit();
            logger.info('Redis connection quit.');

            logger.info('Disconnecting Prisma Client...');
            await prisma.$disconnect();
            logger.info('Prisma Client disconnected.');

            clearTimeout(forceExitTimeout);
            logger.info('Graceful shutdown completed successfully.');
            process.exit(0);
        } catch (error) {
            logger.error({ err: error }, 'Error during graceful shutdown');
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));

    try {
        const address = await app.listen({ port: config.app.port, host: '0.0.0.0' });
        app.log.info({ address }, 'Server listening');

        void HardeningService.runDataRetentionCleanup();
        setInterval(() => {
            void HardeningService.runDataRetentionCleanup();
        }, 24 * 60 * 60 * 1000);

        setInterval(() => {
            void BackupService.runScheduledBackup();
        }, 24 * 60 * 60 * 1000);

        VPSService.startScheduledHealthChecks();
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();
