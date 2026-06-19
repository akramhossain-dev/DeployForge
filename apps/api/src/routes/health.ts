import { FastifyInstance } from 'fastify';
import IORedis from 'ioredis';
import prisma from '@deployforge/database';
import { config } from '../config/env';

type DependencyStatus = {
    status: 'ok' | 'error' | 'disabled';
    latencyMs?: number;
};

async function measure(check: () => Promise<void>): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
        await check();
        return { status: 'ok', latencyMs: Date.now() - startedAt };
    } catch {
        return { status: 'error', latencyMs: Date.now() - startedAt };
    }
}

async function databaseStatus() {
    return measure(async () => {
        await prisma.$queryRaw`SELECT 1`;
    });
}

async function redisStatus(): Promise<DependencyStatus> {
    if (!config.redis.enabled) return { status: 'disabled' };

    return measure(async () => {
        const redis = new IORedis(config.redis.url, {
            connectTimeout: 2000,
            enableOfflineQueue: false,
            lazyConnect: true,
            maxRetriesPerRequest: 0,
        });
        try {
            await redis.connect();
            await redis.ping();
        } finally {
            redis.disconnect();
        }
    });
}

export default async function healthRoutes(fastify: FastifyInstance) {
    const livenessHandler = async () => ({
        status: 'ok',
        service: 'api',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
    });

    const readinessHandler = async (_request: unknown, reply: any) => {
        const [database, redis] = await Promise.all([databaseStatus(), redisStatus()]);
        const ready = database.status === 'ok' && redis.status !== 'error';
        return reply.status(ready ? 200 : 503).send({
            status: ready ? 'ready' : 'not_ready',
            timestamp: new Date().toISOString(),
            dependencies: {
                database,
                redis,
            },
        });
    };

    fastify.get('/health', livenessHandler);
    fastify.get('/live', livenessHandler);
    fastify.get('/liveness', livenessHandler);
    fastify.get('/ready', readinessHandler);
    fastify.get('/readiness', readinessHandler);
    fastify.get('/api/health', livenessHandler);
    fastify.get('/api/live', livenessHandler);
    fastify.get('/api/liveness', livenessHandler);
    fastify.get('/api/ready', readinessHandler);
    fastify.get('/api/readiness', readinessHandler);
}
