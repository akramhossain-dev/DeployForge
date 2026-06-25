import { Queue } from 'bullmq';
import { createQueueConnection } from './redis';

export const redisConnection = createQueueConnection();

export const deploymentQueue = new Queue('deployment-queue', {
    connection: redisConnection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

export const webhookQueue = new Queue('webhook-queue', {
    connection: redisConnection as any,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
    },
});
