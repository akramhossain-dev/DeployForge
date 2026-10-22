

export type DetectedRuntime = {
    name: RuntimeName;
    requiredVersion: string | null;
    sourceFile: string;
};


export type InstalledRuntime = {
    name: RuntimeName;
    version: string | null;
    installed: boolean;
};

export type SystemInfo = {
    os: string;
    osVersion: string;
    kernel: string;
    architecture: string;
    cpuModel: string;
    cpuCores: number;
    ramTotalMb: number;
    ramFreeMb: number;
    diskTotal: string;
    diskFree: string;
    diskPercent: string;
    uptimeSeconds: number;
};

export type ServiceStatus = {
    docker: 'running' | 'stopped' | 'not_installed';
    nginx: 'running' | 'stopped' | 'not_installed';
    redis: 'running' | 'stopped' | 'not_installed';
    postgresql: 'running' | 'stopped' | 'not_installed';
    mysql: 'running' | 'stopped' | 'not_installed';
};

export type EnvironmentScanResult = {
    system: SystemInfo;
    runtimes: InstalledRuntime[];
    services: ServiceStatus;
    scannedAt: string;
};


export type RuntimeDiffStatus = 'ok' | 'missing' | 'incompatible';

export type RuntimeDiff = {
    name: RuntimeName;
    requiredVersion: string | null;
    installedVersion: string | null;
    status: RuntimeDiffStatus;
    sourceFile: string;
};


export type InstallAction = 'install' | 'skip';

export type InstallationPlanItem = {
    name: RuntimeName;
    action: InstallAction;
    reason: string;
    targetVersion: string | null;
};

export type InstallationPlan = {
    items: InstallationPlanItem[];
    isNoop: boolean;
};


export type InstallLogLevel = 'info' | 'success' | 'error' | 'warn';

export type InstallationLogEntry = {
    timestamp: string;
    message: string;
    level: InstallLogLevel;
    runtimeName?: RuntimeName;
};


export type VerificationResult = {
    name: RuntimeName;
    version: string | null;
    ok: boolean;
    error?: string;
};


export type PreflightCheck = {
    check: string;
    ok: boolean;
    message?: string;
};

export type PreflightResult = {
    checks: PreflightCheck[];
    ready: boolean;
};


export type PrepareResult = {
    requirements: DetectedRuntime[];
    scan: EnvironmentScanResult;
    diff: RuntimeDiff[];
    plan: InstallationPlan;
    logs: InstallationLogEntry[];
    verification: VerificationResult[];
    ready: boolean;
    failureReason?: string;
};


export const RUNTIME_NAMES = [
    'nodejs',
    'npm',
    'pnpm',
    'yarn',
    'bun',
    'python',
    'java',
    'php',
    'go',
    'ruby',
    'docker',
    'docker-compose',
    'redis',
    'postgresql',
    'mysql',
    'nginx',
] as const;

export type RuntimeName = (typeof RUNTIME_NAMES)[number];

export function isValidRuntimeName(name: string): name is RuntimeName {
    return (RUNTIME_NAMES as readonly string[]).includes(name);
}
