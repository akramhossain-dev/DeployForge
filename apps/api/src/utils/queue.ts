import { Queue } from 'bullmq';
import { config } from '../config/env';
import IORedis from 'ioredis';

export const redisConnection = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null,
});

export const deploymentQueue = new Queue('deployment-queue', {
    connection: redisConnection,
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
    connection: redisConnection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
    },
});
