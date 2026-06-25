import IORedis from 'ioredis';
import { config } from '../config/env';
import crypto from 'node:crypto';
import { logger } from '../utils/logger';

export class CacheService {
    private static redis = config.redis.enabled ? new IORedis(config.redis.url) : null;
    private static memory = new Map<string, { value: string; expiresAt: number | null }>();

    static async set(key: string, value: any, ttlSeconds: number = 3600) {
        const data = JSON.stringify(value);
        if (this.redis) {
            try {
                if (ttlSeconds) {
                    await this.redis.setex(key, ttlSeconds, data);
                } else {
                    await this.redis.set(key, data);
                }
                return;
            } catch (err) {
                logger.warn({ err, key }, 'Redis set failed, falling back to memory');
            }
        }

        this.memory.set(key, {
            value: data,
            expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
        });
    }

    static async get<T>(key: string): Promise<T | null> {
        if (this.redis) {
            try {
                const data = await this.redis.get(key);
                if (!data) return null;
                return JSON.parse(data) as T;
            } catch (err) {
                logger.warn({ err, key }, 'Redis get failed, falling back to memory');
            }
        }

        const record = this.memory.get(key);
        if (!record) return null;
        if (record.expiresAt && record.expiresAt < Date.now()) {
            this.memory.delete(key);
            return null;
        }
        try {
            return JSON.parse(record.value) as T;
        } catch {
            return null;
        }
    }

    static async del(key: string) {
        if (this.redis) {
            try {
                await this.redis.del(key);
                return;
            } catch (err) {
                logger.warn({ err, key }, 'Redis del failed, falling back to memory');
            }
        }
        this.memory.delete(key);
    }

    static async clearPattern(pattern: string) {
        if (this.redis) {
            try {
                const keys = await this.redis.keys(pattern);
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
                return;
            } catch (err) {
                logger.warn({ err, pattern }, 'Redis clearPattern failed, falling back to memory');
            }
        }

        const prefix = pattern.replace(/\*$/, '');
        for (const key of this.memory.keys()) {
            if (key.startsWith(prefix)) this.memory.delete(key);
        }
    }

    /**
     * Acquires a distributed lock using Redis.
     * Returns a function to release the lock if successful, or null if the lock is already held.
     */
    static async acquireLock(key: string, ttlMs: number = 30000): Promise<(() => Promise<void>) | null> {
        const lockKey = `lock:${key}`;

        if (this.redis) {
            try {
                const lockValue = crypto.randomUUID();
                
                // SET key value PX ttlMs NX
                const result = await this.redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
                if (result !== 'OK') {
                    return null;
                }

                return async () => {
                    try {
                        if (!this.redis) return;
                        const luaScript = `
                            if redis.call("get", KEYS[1]) == ARGV[1] then
                                return redis.call("del", KEYS[1])
                            else
                                return 0
                            end
                        `;
                        await this.redis.eval(luaScript, 1, lockKey, lockValue);
                    } catch (err) {
                        logger.error({ err, lockKey }, 'Failed to release Redis lock, falling back to memory delete');
                        this.memory.delete(lockKey);
                    }
                };
            } catch (err) {
                logger.warn({ err, lockKey }, 'Redis acquireLock failed, falling back to memory');
            }
        }

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
}

