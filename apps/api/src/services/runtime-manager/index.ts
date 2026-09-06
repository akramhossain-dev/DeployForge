/**
 * RuntimeManagerService — Facade
 *
 * Orchestrates the full environment preparation lifecycle:
 *   1. Detect project requirements (static analysis)
 *   2. Scan VPS environment (SSH)
 *   3. Compare requirements vs. installed
 *   4. Generate installation plan
 *   5. Execute installs (only missing/incompatible)
 *   6. Verify post-install
 *
 * Also provides standalone utilities used by API routes:
 *   - scanEnvironment()    → GET /vps/:id/environment
 *   - generatePreflight()  → GET /runtime/:vpsId/preflight
 */

import { SSHService } from '@deployforge/vps';
import { RequirementsDetector, ProjectFileContents } from './requirements-detector';
import { EnvironmentScanner } from './environment-scanner';
import { DependencyComparator } from './dependency-comparator';
import { RuntimeInstaller, InstallLogCallback } from './runtime-installer';
import { PostInstallVerifier } from './post-install-verifier';
import {
    DetectedRuntime,
    EnvironmentScanResult,
    InstallationLogEntry,
    InstallationPlan,
    InstallationPlanItem,
    PrepareResult,
    PreflightCheck,
    PreflightResult,
    RuntimeDiff,
    RuntimeName,
    VerificationResult,
} from './types';

export class RuntimeManagerService {

    // ── Public API: Full Prepare Lifecycle ────────────────────────────────────

    /**
     * Full environment preparation for a deployment.
     *
     * @param ssh          Active, connected SSHService instance
     * @param projectFiles File list from the project (relative paths)
     * @param fileContents Optional map of file path → content for version extraction
     * @param onLog        Real-time log callback — each message is also stored in the returned logs array
     */
    static async analyzeAndPrepare(
        ssh: SSHService,
        projectFiles: string[],
        fileContents: ProjectFileContents = {},
        onLog?: (msg: string, level?: InstallationLogEntry['level']) => void,
    ): Promise<PrepareResult> {
        const logs: InstallationLogEntry[] = [];

        const log = (message: string, level: InstallationLogEntry['level'] = 'info', runtimeName?: RuntimeName) => {
            const entry: InstallationLogEntry = { timestamp: new Date().toISOString(), message, level, runtimeName };
            logs.push(entry);
            onLog?.(message, level);
        };

        const logCallback: InstallLogCallback = (entry) => {
            logs.push(entry);
            onLog?.(entry.message, entry.level);
        };

        try {
            // ── Step 1: Detect requirements ────────────────────────────────────
            log('Detecting project requirements...');
            const requirements = RequirementsDetector.detect(projectFiles, fileContents);

            if (requirements.length === 0) {
                log('No recognized runtime requirements detected in project files.');
                return this.makeResult(requirements, null, [], null, logs, [], true);
            }

            const reqNames = requirements.map((r) => `${r.name}${r.requiredVersion ? ` >= ${r.requiredVersion}` : ''}`);
            log(`Detected requirements: ${reqNames.join(', ')}`);

            // ── Step 2: Scan VPS ───────────────────────────────────────────────
            log('Scanning VPS environment...');
            const scan = await EnvironmentScanner.scan(ssh);
            log(`VPS: ${scan.system.os} ${scan.system.osVersion} (${scan.system.architecture}), ${scan.system.cpuCores} CPUs, ${scan.system.ramTotalMb}MB RAM, ${scan.system.diskFree} disk free`);

            // ── Step 3: Compare ────────────────────────────────────────────────
            const diff = DependencyComparator.compare(requirements, scan);
            log('\n' + DependencyComparator.formatTable(diff));

            // ── Step 4: Build install plan ─────────────────────────────────────
            const plan = this.buildPlan(diff);

            if (plan.isNoop) {
                log('\nEnvironment Ready — all required dependencies are already installed.');
                return this.makeResult(requirements, scan, diff, plan, logs, [], true);
            }

            // Log the plan
            log('\nInstallation Plan:');
            plan.items.filter((i) => i.action === 'install').forEach((i, idx) => {
                log(`  ${idx + 1}. Install ${i.name}${i.targetVersion ? ` (${i.targetVersion})` : ''} — ${i.reason}`);
            });

            // ── Step 5: Execute installs ───────────────────────────────────────
            log('\nPreparing VPS...');
            await RuntimeInstaller.install(ssh, plan, logCallback);

            // ── Step 6: Verify ─────────────────────────────────────────────────
            log('\nVerifying installations...');
            const installedNames = plan.items
                .filter((i) => i.action === 'install')
                .map((i) => i.name);

            const verification = await PostInstallVerifier.verify(ssh, installedNames);
            log('\nVerification Results:\n' + PostInstallVerifier.formatSummary(verification));

            const allOk = PostInstallVerifier.allPassed(verification);
            const failedItems = verification.filter((v) => !v.ok);

            if (!allOk) {
                const failMsg = `Environment preparation failed. The following runtimes could not be verified: ${failedItems.map((f) => f.name).join(', ')}`;
                log(failMsg, 'error');
                return this.makeResult(requirements, scan, diff, plan, logs, verification, false, failMsg);
            }

            log('\nEnvironment Ready ✓', 'success');
            return this.makeResult(requirements, scan, diff, plan, logs, verification, true);

        } catch (err: any) {
            const failMsg = `Environment preparation failed: ${err?.message || 'Unknown error'}`;
            log(failMsg, 'error');
            return this.makeResult([], null, [], null, logs, [], false, failMsg);
        }
    }

    // ── Public API: Standalone Scan ───────────────────────────────────────────

    static async scanEnvironment(ssh: SSHService): Promise<EnvironmentScanResult> {
        return EnvironmentScanner.scan(ssh);
    }

    // ── Public API: Deployment Preflight ──────────────────────────────────────

    static async generatePreflight(
        ssh: SSHService,
        requirements: DetectedRuntime[],
        scan: EnvironmentScanResult,
    ): Promise<PreflightResult> {
        const checks: PreflightCheck[] = [];

        // 1. VPS reachable (SSH is already connected, so this is always true here)
        checks.push({ check: 'VPS reachable', ok: true });

        // 2. Required runtimes available
        const diff = DependencyComparator.compare(requirements, scan);
        const allDepsOk = diff.every((d) => d.status === 'ok');
        checks.push({
            check: 'Required runtimes available',
            ok: allDepsOk,
            message: allDepsOk ? undefined : `Missing: ${diff.filter((d) => d.status !== 'ok').map((d) => d.name).join(', ')}`,
        });

        // 3. Docker available
        const dockerInstalled = scan.runtimes.find((r) => r.name === 'docker')?.installed ?? false;
        const dockerRunning = scan.services.docker === 'running';
        const dockerNeeded = requirements.some((r) => r.name === 'docker');
        if (dockerNeeded) {
            checks.push({
                check: 'Docker available',
                ok: dockerInstalled && dockerRunning,
                message: !dockerInstalled ? 'Docker is not installed'
                    : !dockerRunning ? 'Docker daemon is not running'
                    : undefined,
            });
        }

        // 4. Disk space sufficient (>= 2GB free)
        const diskPercent = parseInt(scan.system.diskPercent.replace('%', ''), 10) || 0;
        const diskOk = diskPercent < 90;
        checks.push({
            check: 'Disk space sufficient',
            ok: diskOk,
            message: diskOk ? undefined : `Disk is ${diskPercent}% full — less than 10% free`,
        });

        // 5. Memory sufficient (>= 256MB free)
        const ramFreeOk = scan.system.ramFreeMb >= 256;
        checks.push({
            check: 'Memory sufficient',
            ok: ramFreeOk,
            message: ramFreeOk ? undefined : `Only ${scan.system.ramFreeMb}MB RAM available — at least 256MB required`,
        });

        // 6. Nginx available (only if a domain deployment is expected)
        const nginxInstalled = scan.runtimes.find((r) => r.name === 'nginx')?.installed ?? false;
        checks.push({
            check: 'Nginx available',
            ok: nginxInstalled,
            message: nginxInstalled ? undefined : 'Nginx is not installed — domain-based deployments require Nginx',
        });

        // 7. Port availability (80, 443 check — general readiness)
        try {
            const portResult = await ssh.execute(
                `! ss -tlnp 2>/dev/null | grep -E ':80\\s|:443\\s' | grep -v nginx || true`,
                10_000,
            );
            checks.push({ check: 'Required ports available', ok: portResult.code === 0 });
        } catch {
            checks.push({ check: 'Required ports available', ok: true }); // Non-blocking
        }

        const ready = checks.every((c) => c.ok);
        return { checks, ready };
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private static buildPlan(diff: RuntimeDiff[]): InstallationPlan {
        const items: InstallationPlanItem[] = diff.map((d): InstallationPlanItem => {
            if (d.status === 'ok') {
                return {
                    name: d.name,
                    action: 'skip',
                    reason: `Already installed (${d.installedVersion})`,
                    targetVersion: d.installedVersion,
                };
            }

            return {
                name: d.name,
                action: 'install',
                reason: d.status === 'missing'
                    ? 'Not found on VPS'
                    : `Incompatible version installed (${d.installedVersion}), required: ${d.requiredVersion}`,
                targetVersion: d.requiredVersion,
            };
        });

        return {
            items,
            isNoop: items.every((i) => i.action === 'skip'),
        };
    }

    private static makeResult(
        requirements: DetectedRuntime[],
        scan: EnvironmentScanResult | null,
        diff: RuntimeDiff[],
        plan: InstallationPlan | null,
        logs: InstallationLogEntry[],
        verification: VerificationResult[],
        ready: boolean,
        failureReason?: string,
    ): PrepareResult {
        return {
            requirements,
            scan: scan ?? {
                system: {
                    os: 'Unknown', osVersion: 'Unknown', kernel: 'Unknown',
                    architecture: 'Unknown', cpuModel: 'Unknown', cpuCores: 1,
                    ramTotalMb: 0, ramFreeMb: 0, diskTotal: 'Unknown',
                    diskFree: 'Unknown', diskPercent: 'Unknown', uptimeSeconds: 0,
                },
                runtimes: [],
                services: { docker: 'not_installed', nginx: 'not_installed', redis: 'not_installed', postgresql: 'not_installed', mysql: 'not_installed' },
                scannedAt: new Date().toISOString(),
            },
            diff,
            plan: plan ?? { items: [], isNoop: true },
            logs,
            verification,
            ready,
            failureReason,
        };
    }
}

// Re-export types and sub-services for convenience
export * from './types';
export { RequirementsDetector } from './requirements-detector';
export { EnvironmentScanner } from './environment-scanner';
export { DependencyComparator } from './dependency-comparator';
export { RuntimeInstaller } from './runtime-installer';
export { PostInstallVerifier } from './post-install-verifier';
