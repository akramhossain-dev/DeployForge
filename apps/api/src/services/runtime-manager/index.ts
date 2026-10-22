
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
            log('Detecting project requirements...');
            const requirements = RequirementsDetector.detect(projectFiles, fileContents);

            if (requirements.length === 0) {
                log('No recognized runtime requirements detected in project files.');
                return this.makeResult(requirements, null, [], null, logs, [], true);
            }

            const reqNames = requirements.map((r) => `${r.name}${r.requiredVersion ? ` >= ${r.requiredVersion}` : ''}`);
            log(`Detected requirements: ${reqNames.join(', ')}`);

            log('Scanning VPS environment...');
            const scan = await EnvironmentScanner.scan(ssh);
            log(`VPS: ${scan.system.os} ${scan.system.osVersion} (${scan.system.architecture}), ${scan.system.cpuCores} CPUs, ${scan.system.ramTotalMb}MB RAM, ${scan.system.diskFree} disk free`);

            const diff = DependencyComparator.compare(requirements, scan);
            log('\n' + DependencyComparator.formatTable(diff));

            const plan = this.buildPlan(diff);

            if (plan.isNoop) {
                log('\nEnvironment Ready — all required dependencies are already installed.');
                return this.makeResult(requirements, scan, diff, plan, logs, [], true);
            }

            log('\nInstallation Plan:');
            plan.items.filter((i) => i.action === 'install').forEach((i, idx) => {
                log(`  ${idx + 1}. Install ${i.name}${i.targetVersion ? ` (${i.targetVersion})` : ''} — ${i.reason}`);
            });

            log('\nPreparing VPS...');
            await RuntimeInstaller.install(ssh, plan, logCallback);

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


    static async scanEnvironment(ssh: SSHService): Promise<EnvironmentScanResult> {
        return EnvironmentScanner.scan(ssh);
    }


    static async generatePreflight(
        ssh: SSHService,
        requirements: DetectedRuntime[],
        scan: EnvironmentScanResult,
    ): Promise<PreflightResult> {
        const checks: PreflightCheck[] = [];

        checks.push({ check: 'VPS reachable', ok: true });

        const diff = DependencyComparator.compare(requirements, scan);
        const allDepsOk = diff.every((d) => d.status === 'ok');
        checks.push({
            check: 'Required runtimes available',
            ok: allDepsOk,
            message: allDepsOk ? undefined : `Missing: ${diff.filter((d) => d.status !== 'ok').map((d) => d.name).join(', ')}`,
        });

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

        const diskPercent = parseInt(scan.system.diskPercent.replace('%', ''), 10) || 0;
        const diskOk = diskPercent < 90;
        checks.push({
            check: 'Disk space sufficient',
            ok: diskOk,
            message: diskOk ? undefined : `Disk is ${diskPercent}% full — less than 10% free`,
        });

        const ramFreeOk = scan.system.ramFreeMb >= 256;
        checks.push({
            check: 'Memory sufficient',
            ok: ramFreeOk,
            message: ramFreeOk ? undefined : `Only ${scan.system.ramFreeMb}MB RAM available — at least 256MB required`,
        });

        const nginxInstalled = scan.runtimes.find((r) => r.name === 'nginx')?.installed ?? false;
        checks.push({
            check: 'Nginx available',
            ok: nginxInstalled,
            message: nginxInstalled ? undefined : 'Nginx is not installed — domain-based deployments require Nginx',
        });

        try {
            const portResult = await ssh.execute(
                `! ss -tlnp 2>/dev/null | grep -E ':80\\s|:443\\s' | grep -v nginx || true`,
                10_000,
            );
            checks.push({ check: 'Required ports available', ok: portResult.code === 0 });
        } catch {
            checks.push({ check: 'Required ports available', ok: true });
        }

        const ready = checks.every((c) => c.ok);
        return { checks, ready };
    }


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

export * from './types';
export { RequirementsDetector } from './requirements-detector';
export { EnvironmentScanner } from './environment-scanner';
export { DependencyComparator } from './dependency-comparator';
export { RuntimeInstaller } from './runtime-installer';
export { PostInstallVerifier } from './post-install-verifier';
