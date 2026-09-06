/**
 * Runtime Manager — Shared Type Definitions
 *
 * These types model the full lifecycle:
 *   RequirementsDetector → EnvironmentScanner → DependencyComparator
 *     → InstallationPlanner → RuntimeInstaller → PostInstallVerifier
 */

// ─── Detection ────────────────────────────────────────────────────────────────

/** A runtime/tool detected as required by the project files. */
export type DetectedRuntime = {
    /** Canonical identifier, e.g. 'nodejs', 'python', 'docker' */
    name: RuntimeName;
    /** Minimum required version string (semver or raw), null if unspecified */
    requiredVersion: string | null;
    /** The project file that triggered this detection */
    sourceFile: string;
};

// ─── Environment Scan ─────────────────────────────────────────────────────────

/** A single runtime found installed on the VPS. */
export type InstalledRuntime = {
    name: RuntimeName;
    /** Version string returned by the CLI, null if not installed */
    version: string | null;
    installed: boolean;
};

/** System-level information about the VPS. */
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

/** Service daemon status. */
export type ServiceStatus = {
    docker: 'running' | 'stopped' | 'not_installed';
    nginx: 'running' | 'stopped' | 'not_installed';
    redis: 'running' | 'stopped' | 'not_installed';
    postgresql: 'running' | 'stopped' | 'not_installed';
    mysql: 'running' | 'stopped' | 'not_installed';
};

/** Full result of scanning a VPS environment. */
export type EnvironmentScanResult = {
    system: SystemInfo;
    runtimes: InstalledRuntime[];
    services: ServiceStatus;
    scannedAt: string;
};

// ─── Comparison ───────────────────────────────────────────────────────────────

export type RuntimeDiffStatus = 'ok' | 'missing' | 'incompatible';

/** Result of comparing a single required runtime against what is installed. */
export type RuntimeDiff = {
    name: RuntimeName;
    requiredVersion: string | null;
    installedVersion: string | null;
    status: RuntimeDiffStatus;
    sourceFile: string;
};

// ─── Installation Plan ────────────────────────────────────────────────────────

export type InstallAction = 'install' | 'skip';

/** One item in the install plan. */
export type InstallationPlanItem = {
    name: RuntimeName;
    action: InstallAction;
    reason: string;
    targetVersion: string | null;
};

/** The full plan generated before modifying the VPS. */
export type InstallationPlan = {
    items: InstallationPlanItem[];
    /** True when nothing needs to be installed. */
    isNoop: boolean;
};

// ─── Installation Log ─────────────────────────────────────────────────────────

export type InstallLogLevel = 'info' | 'success' | 'error' | 'warn';

export type InstallationLogEntry = {
    timestamp: string;
    message: string;
    level: InstallLogLevel;
    runtimeName?: RuntimeName;
};

// ─── Post-Install Verification ────────────────────────────────────────────────

export type VerificationResult = {
    name: RuntimeName;
    version: string | null;
    ok: boolean;
    error?: string;
};

// ─── Preflight ────────────────────────────────────────────────────────────────

export type PreflightCheck = {
    check: string;
    ok: boolean;
    message?: string;
};

export type PreflightResult = {
    checks: PreflightCheck[];
    ready: boolean;
};

// ─── analyzeAndPrepare Result ─────────────────────────────────────────────────

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

// ─── Allowed Runtime Names ────────────────────────────────────────────────────

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
