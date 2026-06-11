import IORedis from 'ioredis';
import { config } from '../config/env';

export class CacheService {
    private static redis = new IORedis(config.redis.url);

    static async set(key: string, value: any, ttlSeconds: number = 3600) {
        const data = JSON.stringify(value);
        if (ttlSeconds) {
            await this.redis.setex(key, ttlSeconds, data);
        } else {
            await this.redis.set(key, data);
        }
    }

    static async get<T>(key: string): Promise<T | null> {
        const data = await this.redis.get(key);
        if (!data) return null;
        return JSON.parse(data) as T;
    }

    static async del(key: string) {
        await this.redis.del(key);
    }

    static async clearPattern(pattern: string) {
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }
}
