import IORedis from 'ioredis';
import { config } from '../config/env';

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
