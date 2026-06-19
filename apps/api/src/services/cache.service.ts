import IORedis from 'ioredis';
import { config } from '../config/env';

export class CacheService {
    private static redis = config.redis.enabled ? new IORedis(config.redis.url) : null;
    private static memory = new Map<string, { value: string; expiresAt: number | null }>();

    static async set(key: string, value: any, ttlSeconds: number = 3600) {
        const data = JSON.stringify(value);
        if (!this.redis) {
            this.memory.set(key, {
                value: data,
                expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
            });
            return;
        }

        if (ttlSeconds) {
            await this.redis.setex(key, ttlSeconds, data);
        } else {
            await this.redis.set(key, data);
        }
    }

    static async get<T>(key: string): Promise<T | null> {
        if (!this.redis) {
            const record = this.memory.get(key);
            if (!record) return null;
            if (record.expiresAt && record.expiresAt < Date.now()) {
                this.memory.delete(key);
                return null;
            }
            return JSON.parse(record.value) as T;
        }

        const data = await this.redis.get(key);
        if (!data) return null;
        return JSON.parse(data) as T;
    }

    static async del(key: string) {
        if (!this.redis) {
            this.memory.delete(key);
            return;
        }
        await this.redis.del(key);
    }

    static async clearPattern(pattern: string) {
        if (!this.redis) {
            const prefix = pattern.replace(/\*$/, '');
            for (const key of this.memory.keys()) {
                if (key.startsWith(prefix)) this.memory.delete(key);
            }
            return;
        }

        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }
}
