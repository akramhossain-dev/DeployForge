import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({
    config: { redis: { enabled: false } },
}));

vi.mock('../utils/logger', () => ({
    logger: { warn: vi.fn(), error: vi.fn() },
}));

import { CacheService } from './cache.service';

afterEach(() => {
    vi.useRealTimers();
});

describe('renewable deployment locks', () => {
    it('serializes the same project and releases only its own lease', async () => {
        const first = await CacheService.acquireRenewableLock('test-project-serialize', 30_000);
        expect(first).not.toBeNull();
        expect(await CacheService.acquireRenewableLock('test-project-serialize', 30_000)).toBeNull();
        expect(await first!.extend()).toBe(true);
        await first!.release();
        expect(await CacheService.acquireRenewableLock('test-project-serialize', 30_000)).not.toBeNull();
    });

    it('recovers a stale lease after its TTL', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
        expect(await CacheService.acquireRenewableLock('test-stale-recovery', 1_000)).not.toBeNull();
        vi.advanceTimersByTime(1_001);
        expect(await CacheService.acquireRenewableLock('test-stale-recovery', 1_000)).not.toBeNull();
    });
});
