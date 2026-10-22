import { Worker } from 'bullmq';
import prisma from '@deployforge/database';
import { redisConnection } from '../utils/queue';
import { logger } from '../utils/logger';
import { VPSService } from '../services/vps.service';

type GatewayJob = {
    operationId: string;
    operation: 'bootstrap';
};

export const gatewayWorker = new Worker<GatewayJob>(
    'gateway-queue',
    async (job) => {
        if (job.data.operation !== 'bootstrap') throw new Error('Unsupported gateway operation');
        await VPSService.processBootstrapOperation(job.data.operationId);
    },
    {
        connection: redisConnection as any,
        concurrency: 2,
    },
);

gatewayWorker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, operationId: job?.data.operationId }, 'Gateway operation failed');
});

gatewayWorker.on('error', (err) => {
    logger.error({ err }, 'Gateway worker error');
});

void prisma.$connect();
