import { Worker } from 'bullmq';
import prisma from '@deployforge/database';
import { redisConnection } from '../utils/queue';
import { TLSVerificationService } from '../services/tls-verification.service';
import { logger } from '../utils/logger';

const MAX_ATTEMPTS = 8;

export const tlsWorker = new Worker(
    'tls-verification-queue',
    async (job) => {
        const value = job.data as Record<string, unknown>;
        if (!value || Object.keys(value).length !== 1 || typeof value.domainId !== 'string') {
            throw new Error('Invalid TLS verification job payload');
        }
        try {
            return await TLSVerificationService.verifyDomain(value.domainId);
        } catch (error) {
            const message = TLSVerificationService.sanitizeError(error);
            const failure = TLSVerificationService.failureState(message, job.attemptsMade + 1, Date.now(), MAX_ATTEMPTS);
            await prisma.domain.updateMany({
                where: { id: value.domainId },
                data: {
                    sslStatus: failure.sslStatus,
                    sslError: message,
                    sslRetryCount: { increment: 1 },
                    sslNextRetryAt: failure.sslNextRetryAt,
                },
            });
            throw error;
        }
    },
    {
        connection: redisConnection as any,
        concurrency: 3,
        settings: {
            backoffStrategy: (attemptsMade: number, type?: string) => {
                if (type !== 'tls-exponential') return 15_000;
                return Math.min(15_000 * (2 ** Math.max(0, attemptsMade - 1)), 300_000);
            },
        },
    },
);

tlsWorker.on('failed', (job, error) => {
    logger.warn({ domainId: job?.data?.domainId, attempt: job?.attemptsMade, err: TLSVerificationService.sanitizeError(error) }, 'TLS verification attempt failed');
});
