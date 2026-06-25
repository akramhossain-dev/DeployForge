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
    // Sync/ensure Super Admin exists on startup
    await SuperAdminService.ensureSuperAdmin();

    const app = await buildApp();

    // Signal handling for graceful shutdown
    let isShuttingDown = false;

    const handleShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`Received ${signal}. Initiating graceful shutdown...`);

        // Set a timeout to force exit if graceful shutdown takes too long (e.g. 10s)
        const forceExitTimeout = setTimeout(() => {
            logger.error('Graceful shutdown timed out. Forcing exit.');
            process.exit(1);
        }, 10000);

        try {
            // 1. Stop the Fastify server from accepting new connections
            logger.info('Closing Fastify server...');
            await app.close();
            logger.info('Fastify server closed.');

            // 2. Shut down BullMQ worker (completes current jobs, doesn't pick up new ones)
            logger.info('Closing BullMQ worker...');
            await deploymentWorker.close();
            logger.info('BullMQ worker closed.');

            // 3. Close BullMQ queues
            logger.info('Closing BullMQ queues...');
            await deploymentQueue.close();
            await webhookQueue.close();
            logger.info('BullMQ queues closed.');

            // 4. Quit Redis connection
            logger.info('Quitting Redis connection...');
            await redisConnection.quit();
            logger.info('Redis connection quit.');

            // 5. Disconnect Prisma client
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

        // Run database data retention cleanup once on startup and then every 24 hours
        void HardeningService.runDataRetentionCleanup();
        setInterval(() => {
            void HardeningService.runDataRetentionCleanup();
        }, 24 * 60 * 60 * 1000);

        // Run automated backup every 24 hours
        setInterval(() => {
            void BackupService.runScheduledBackup();
        }, 24 * 60 * 60 * 1000);

        // Start automated VPS health checks (runs on startup + every 5 mins)
        VPSService.startScheduledHealthChecks();
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

start();

