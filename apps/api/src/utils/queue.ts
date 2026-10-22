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
        removeOnFail: { age: 24 * 60 * 60, count: 100 },
    },
});

export const webhookQueue = new Queue('webhook-queue', {
    connection: redisConnection as any,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60, count: 100 },
    },
});

export const gatewayQueue = new Queue('gateway-queue', {
    connection: redisConnection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60, count: 100 },
    },
});

export const tlsVerificationQueue = new Queue('tls-verification-queue', {
    connection: redisConnection as any,
    defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'tls-exponential', delay: 15000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60, count: 100 },
    },
});

export const maintenanceQueue = new Queue('maintenance-queue', {
    connection: redisConnection as any,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: { age: 24 * 60 * 60, count: 100 },
    },
});

export async function ensureMaintenanceSchedule() {
    await maintenanceQueue.upsertJobScheduler('daily-maintenance', { every: 24 * 60 * 60 * 1000 }, {
        name: 'daily-cleanup',
        data: { operation: 'cleanup' },
    });
}

export async function queueTLSVerification(domainId: string) {
    const jobId = `tls-${domainId}`;
    const existing = await tlsVerificationQueue.getJob(jobId);
    if (existing) {
        const state = await existing.getState();
        if (state === 'failed' || state === 'completed') await existing.remove();
        else return existing;
    }
    return tlsVerificationQueue.add('verify', { domainId }, { jobId });
}
