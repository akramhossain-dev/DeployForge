import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config/env';

export const redisConnection = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
});

export const deploymentQueue = new Queue('deployment-queue', {
    connection: redisConnection,
});

export const webhookQueue = new Queue('webhook-queue', {
    connection: redisConnection,
});

// Example Worker setup (skeleton)
export function startWorkers() {
    const deploymentWorker = new Worker(
        'deployment-queue',
        async (job) => {
            console.log(`Processing deployment job ${job.id}`);
            // Implementation logic will go in Phase 3
        },
        { connection: redisConnection }
    );

    deploymentWorker.on('failed', (job, err) => {
        console.error(`Job ${job?.id} failed with ${err.message}`);
    });
}
