
import { DetectedRuntime, EnvironmentScanResult, InstalledRuntime, RuntimeDiff, RuntimeDiffStatus } from './types';

export class DependencyComparator {

    static compare(requirements: DetectedRuntime[], scan: EnvironmentScanResult): RuntimeDiff[] {
        const installedMap = new Map<string, InstalledRuntime>(
            scan.runtimes.map((r) => [r.name, r]),
        );

        return requirements.map((req): RuntimeDiff => {
            const installed = installedMap.get(req.name);
            const installedVersion = installed?.version ?? null;
            const isInstalled = installed?.installed ?? false;

            if (!isInstalled || !installed) {
                return {
                    name: req.name,
                    requiredVersion: req.requiredVersion,
                    installedVersion: null,
                    status: 'missing',
                    sourceFile: req.sourceFile,
                };
            }

            const status = this.evaluateCompatibility(req.requiredVersion, installedVersion);

            return {
                name: req.name,
                requiredVersion: req.requiredVersion,
                installedVersion,
                status,
                sourceFile: req.sourceFile,
            };
        });
    }


    private static evaluateCompatibility(
        required: string | null,
        installed: string | null,
    ): RuntimeDiffStatus {
        if (!installed) return 'missing';
        if (!required) return 'ok';

        const clean = (v: string) => v.replace(/^[v=~^>=<]+/, '').split(/\s+/)[0].trim();

        const req = clean(required);
        const inst = clean(installed);

        if (!req) return 'ok';

        const reqParts = req.split('.').map(Number);
        const instParts = inst.split('.').map(Number);

        const reqMajor = reqParts[0] ?? 0;
        const instMajor = instParts[0] ?? 0;

        if (reqMajor !== 0 && instMajor < reqMajor) return 'incompatible';

        if (reqParts.length >= 2 && instParts.length >= 2) {
            const reqMinor = reqParts[1] ?? 0;
            const instMinor = instParts[1] ?? 0;
            if (instMajor === reqMajor && instMinor < reqMinor) return 'incompatible';
        }

        return 'ok';
    }

    static getMissing(diff: RuntimeDiff[]): RuntimeDiff[] {
        return diff.filter((d) => d.status === 'missing' || d.status === 'incompatible');
    }

    static formatTable(diff: RuntimeDiff[]): string {
        const lines: string[] = ['Project Requirements', ''];
        for (const d of diff) {
            const reqStr = d.requiredVersion ? `${d.name} >= ${d.requiredVersion}` : d.name;
            const icon = d.status === 'ok' ? '✓' : '✗';
            const statusLabel = d.status === 'ok'
                ? `Installed (${d.installedVersion})`
                : d.status === 'incompatible'
                    ? `Incompatible — installed: ${d.installedVersion}, required: ${d.requiredVersion}`
                    : 'Missing';
            lines.push(`${icon.padEnd(2)} ${reqStr.padEnd(30)} ${statusLabel}`);
        }
        return lines.join('\n');
    }
}
