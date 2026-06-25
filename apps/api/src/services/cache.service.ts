import { config } from '../config/env';
import crypto from 'node:crypto';
import { logger } from '../utils/logger';
import { createCacheConnection } from '../utils/redis';

export class CacheService {
    // H-4: Use shared Redis factory — avoids creating a separate connection pool
    private static redis = config.redis.enabled ? createCacheConnection() : null;
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

    // H-5: Use SCAN instead of KEYS — KEYS is O(N) and blocks Redis during keyspace iteration.
    // SCAN iterates in batches without blocking, safe for large production keyspaces.
    static async clearPattern(pattern: string) {
        if (this.redis) {
            try {
                const keys: string[] = [];
                let cursor = '0';
                do {
                    const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                    cursor = nextCursor;
                    keys.push(...batch);
                } while (cursor !== '0');

                if (keys.length > 0) {
                    // DEL accepts multiple keys — batch in chunks of 500 to avoid huge commands
                    for (let i = 0; i < keys.length; i += 500) {
                        await this.redis.del(...keys.slice(i, i + 500));
                    }
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

