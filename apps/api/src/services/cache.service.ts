import IORedis from 'ioredis';
import { config } from '../config/env';
import crypto from 'node:crypto';

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

    /**
     * Acquires a distributed lock using Redis.
     * Returns a function to release the lock if successful, or null if the lock is already held.
     */
    static async acquireLock(key: string, ttlMs: number = 30000): Promise<(() => Promise<void>) | null> {
        if (!this.redis) {
            const lockKey = `lock:${key}`;
            const existing = this.memory.get(lockKey);
            if (existing && (existing.expiresAt === null || existing.expiresAt > Date.now())) {
                return null;
            }
            this.memory.set(lockKey, {
                value: 'locked',
                expiresAt: Date.now() + ttlMs,
            });
            return async () => {
                this.memory.delete(lockKey);
            };
        }

        const lockKey = `lock:${key}`;
        const lockValue = crypto.randomUUID();
        
        // SET key value PX ttlMs NX
        const result = await this.redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
        if (result !== 'OK') {
            return null;
        }

        return async () => {
            if (!this.redis) return;
            const luaScript = `
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
            `;
            await this.redis.eval(luaScript, 1, lockKey, lockValue);
        };
    }
}
