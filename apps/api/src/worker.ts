import './instrumentation';
import prisma from '@deployforge/database';
import { deploymentWorker } from './workers/deployment.worker';
import { gatewayWorker } from './workers/gateway.worker';
import { tlsWorker } from './workers/tls.worker';
import { maintenanceWorker } from './workers/maintenance.worker';
import { deploymentQueue, gatewayQueue, maintenanceQueue, redisConnection, tlsVerificationQueue, webhookQueue } from './utils/queue';
import { logger } from './utils/logger';
import { ensureMaintenanceSchedule } from './utils/queue';
import { shutdownTelemetry } from './instrumentation';

let isShuttingDown = false;

async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, 'Deployment worker shutting down');

    const timeout = setTimeout(() => {
        logger.error('Deployment worker shutdown timed out');
        process.exit(1);
    }, 15_000);

    try {
        await Promise.all([deploymentWorker.close(), gatewayWorker.close(), tlsWorker.close(), maintenanceWorker.close()]);
        await Promise.all([deploymentQueue.close(), webhookQueue.close(), gatewayQueue.close(), tlsVerificationQueue.close(), maintenanceQueue.close()]);
        await redisConnection.quit();
        await prisma.$disconnect();
        await shutdownTelemetry();
        clearTimeout(timeout);
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, 'Deployment worker shutdown failed');
        process.exit(1);
    }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
logger.info('Deployment, gateway, and TLS verification workers started');
void ensureMaintenanceSchedule().catch((err) => logger.error({ err }, 'Failed to schedule daily maintenance'));
