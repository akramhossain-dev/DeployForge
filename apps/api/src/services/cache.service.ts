import { config } from '../config/env';
import crypto from 'node:crypto';
import { logger } from '../utils/logger';
import { createCacheConnection } from '../utils/redis';

export type RenewableLock = {
    readonly key: string;
    extend: () => Promise<boolean>;
    release: () => Promise<void>;
};

export class CacheService {
    
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

    static async acquireRenewableLock(key: string, ttlMs: number = 30000): Promise<RenewableLock | null> {
        const lockKey = `lock:${key}`;
        const lockValue = crypto.randomUUID();

        if (this.redis) {
            try {
                const result = await this.redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
                if (result !== 'OK') {
                    return null;
                }

                return {
                    key: lockKey,
                    extend: async () => {
                        if (!this.redis) return false;
                        const renewed = await this.redis.eval(`
                            if redis.call("get", KEYS[1]) == ARGV[1] then
                                return redis.call("pexpire", KEYS[1], ARGV[2])
                            else
                                return 0
                            end
                        `, 1, lockKey, lockValue, ttlMs);
                        return Number(renewed) === 1;
                    },
                    release: async () => {
                        if (!this.redis) return;
                        const luaScript = `
                            if redis.call("get", KEYS[1]) == ARGV[1] then
                                return redis.call("del", KEYS[1])
                            else
                                return 0
                            end
                        `;
                        await this.redis.eval(luaScript, 1, lockKey, lockValue);
                    },
                };
            } catch (err) {
                logger.error({ err, lockKey }, 'Redis lock operation failed');
                return null;
            }
        }

        const existing = this.memory.get(lockKey);
        if (existing && (existing.expiresAt === null || existing.expiresAt > Date.now())) {
            return null;
        }
        this.memory.set(lockKey, {
            value: lockValue,
            expiresAt: Date.now() + ttlMs,
        });
        return {
            key: lockKey,
            extend: async () => {
                const current = this.memory.get(lockKey);
                if (!current || current.value !== lockValue) return false;
                current.expiresAt = Date.now() + ttlMs;
                return true;
            },
            release: async () => {
                const current = this.memory.get(lockKey);
                if (current?.value === lockValue) this.memory.delete(lockKey);
            },
        };
    }

    static async acquireLock(key: string, ttlMs: number = 30000): Promise<(() => Promise<void>) | null> {
        const lock = await this.acquireRenewableLock(key, ttlMs);
        return lock ? lock.release : null;
    }
}
