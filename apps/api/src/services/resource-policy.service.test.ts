import { describe, expect, it } from 'vitest';
import { capacityDetails, capacityFailure, RESOURCE_DEFAULTS, splitComposePolicy, tierForRuntime } from './resource-policy';

describe('ResourcePolicyService pure policy', () => {
    it('maps detected runtimes to enforced tiers', () => {
        expect(tierForRuntime('STATIC', 'STATIC')).toBe('STATIC');
        expect(tierForRuntime('SERVER', 'NEXTJS')).toBe('SERVER');
        expect(tierForRuntime('SERVER', 'DOCKER_COMPOSE')).toBe('FULLSTACK');
    });

    it('keeps the configured RAM and disk reserves', () => {
        const snapshot = { cpuMillis: 4000, totalMemoryMiB: 4096, availableMemoryMiB: 3000, totalDiskMiB: 100_000, availableDiskMiB: 50_000 };
        expect(capacityFailure(snapshot, { cpuMillis: 1000, memoryMiB: 1024, storageMiB: 5000 }, RESOURCE_DEFAULTS.SERVER)).toBeNull();
        expect(capacityFailure({ ...snapshot, availableMemoryMiB: 1500 }, { cpuMillis: 1000, memoryMiB: 2048, storageMiB: 5000 }, RESOURCE_DEFAULTS.SERVER)).toBe('VPS_MEMORY_CAPACITY_EXCEEDED');
        expect(capacityFailure({ ...snapshot, availableDiskMiB: 18_000 }, { cpuMillis: 1000, memoryMiB: 1024, storageMiB: 5000 }, RESOURCE_DEFAULTS.SERVER)).toBe('VPS_DISK_CAPACITY_EXCEEDED');
        expect(capacityDetails(snapshot, { cpuMillis: 1000, memoryMiB: 1024, storageMiB: 5000 }, RESOURCE_DEFAULTS.SERVER)).toMatchObject({
            requested: RESOURCE_DEFAULTS.SERVER,
            available: { memoryMiB: 3000, diskMiB: 50_000 },
            requiredReserve: { memoryMiB: 819, diskMiB: 15_000 },
        });
    });

    it('splits full-stack limits deterministically and gives remainders to ingress', () => {
        const result = splitComposePolicy(RESOURCE_DEFAULTS.FULLSTACK, ['db', 'web', 'redis'], 'web');
        expect(Object.keys(result)).toEqual(['db', 'redis', 'web']);
        expect(Object.values(result).reduce((sum, item) => sum + item.cpuMillis, 0)).toBe(2000);
        expect(Object.values(result).reduce((sum, item) => sum + item.memoryMiB, 0)).toBe(2048);
        expect(Object.values(result).reduce((sum, item) => sum + item.pids, 0)).toBe(512);
        expect(result.web.memoryMiB).toBeGreaterThanOrEqual(result.db.memoryMiB);
    });
});
