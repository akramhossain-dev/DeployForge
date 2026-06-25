import IORedis from 'ioredis';
import { config } from '../config/env';

/**
 * H-4: Shared Redis connection factory.
 * Both CacheService and BullMQ queues/workers use connections from this factory
 * so we avoid creating redundant connection pools.
 *
 * BullMQ requires maxRetriesPerRequest: null — use createQueueConnection().
 * General cache / pub-sub use — use createCacheConnection().
 */
export function createQueueConnection(): IORedis {
    return new IORedis(config.redis.url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });
}

export function createCacheConnection(): IORedis {
    return new IORedis(config.redis.url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: false,
    });
}
