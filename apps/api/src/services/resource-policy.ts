export type ResourceTierName = 'STATIC' | 'SERVER' | 'FULLSTACK';
export type EffectiveResourcePolicy = { tier: ResourceTierName; cpuMillis: number; memoryMiB: number; pids: number; storageMiB: number };
export type CapacitySnapshot = { cpuMillis: number; totalMemoryMiB: number; availableMemoryMiB: number; totalDiskMiB: number; availableDiskMiB: number };

export const RESOURCE_DEFAULTS: Record<ResourceTierName, EffectiveResourcePolicy> = {
    STATIC: { tier: 'STATIC', cpuMillis: 250, memoryMiB: 256, pids: 128, storageMiB: 5120 },
    SERVER: { tier: 'SERVER', cpuMillis: 1000, memoryMiB: 1024, pids: 256, storageMiB: 5120 },
    FULLSTACK: { tier: 'FULLSTACK', cpuMillis: 2000, memoryMiB: 2048, pids: 512, storageMiB: 5120 },
};

export function capacityFailure(snapshot: CapacitySnapshot, committed: { cpuMillis: number; memoryMiB: number; storageMiB: number }, requested: EffectiveResourcePolicy) {
    const memoryReserve = Math.floor(snapshot.totalMemoryMiB * 0.20);
    const diskReserve = Math.floor(snapshot.totalDiskMiB * 0.15);
    const memoryFailed = committed.memoryMiB + requested.memoryMiB > snapshot.totalMemoryMiB - memoryReserve || snapshot.availableMemoryMiB - requested.memoryMiB < memoryReserve;
    const diskFailed = committed.storageMiB + requested.storageMiB > snapshot.totalDiskMiB - diskReserve || snapshot.availableDiskMiB - requested.storageMiB < diskReserve;
    if (memoryFailed && diskFailed) return 'VPS_RESOURCE_CAPACITY_EXCEEDED';
    if (memoryFailed) return 'VPS_MEMORY_CAPACITY_EXCEEDED';
    if (diskFailed) return 'VPS_DISK_CAPACITY_EXCEEDED';
    if (requested.cpuMillis > snapshot.cpuMillis) return 'VPS_RESOURCE_CAPACITY_EXCEEDED';
    return null;
}

export function capacityDetails(
    snapshot: CapacitySnapshot,
    committed: { cpuMillis: number; memoryMiB: number; storageMiB: number },
    requested: EffectiveResourcePolicy,
) {
    return {
        requested,
        committed,
        available: {
            cpuMillis: snapshot.cpuMillis,
            memoryMiB: snapshot.availableMemoryMiB,
            diskMiB: snapshot.availableDiskMiB,
        },
        total: {
            memoryMiB: snapshot.totalMemoryMiB,
            diskMiB: snapshot.totalDiskMiB,
        },
        requiredReserve: {
            memoryMiB: Math.floor(snapshot.totalMemoryMiB * 0.20),
            diskMiB: Math.floor(snapshot.totalDiskMiB * 0.15),
        },
    };
}

export function tierForRuntime(type: string, framework?: string | null): ResourceTierName {
    if (framework === 'DOCKER_COMPOSE' || type === 'FULLSTACK') return 'FULLSTACK';
    return type === 'STATIC' ? 'STATIC' : 'SERVER';
}

export function splitComposePolicy(policy: EffectiveResourcePolicy, serviceNames: string[], ingressService: string) {
    const names = [...serviceNames].sort();
    if (names.length < 1 || names.length > 4) throw new Error('Compose resource allocation requires between 1 and 4 services');
    const split = (total: number, minimum: number) => {
        const base = Math.max(minimum, Math.floor(total / names.length));
        const values = new Map(names.map((name) => [name, base]));
        values.set(ingressService, (values.get(ingressService) || base) + Math.max(0, total - base * names.length));
        return values;
    };
    const cpus = split(policy.cpuMillis, 50);
    const memory = split(policy.memoryMiB, 64);
    const pids = split(policy.pids, 32);
    return Object.fromEntries(names.map((name) => [name, { cpuMillis: cpus.get(name)!, memoryMiB: memory.get(name)!, pids: pids.get(name)! }]));
}
