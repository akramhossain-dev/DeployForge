import dns from 'node:dns/promises';
import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EnvironmentService } from './environment.service';
import { shellQuote } from './utils';
import type { DetectedProject } from './types';
import { PreflightGateError } from '../../utils/deployment-preflight';

export type PreflightStatus = 'PASS' | 'WARNING' | 'BLOCKED';
export type PreflightCheck = {
    code: string;
    category: string;
    title: string;
    status: PreflightStatus;
    message: string;
};

const PLACEHOLDER_VALUE = /^(?:change[-_ ]?me|replace[-_ ]?me|your[-_ ].*|example|todo|xxx+|password|secret|insert[-_ ].*|<.*>)$/i;

export function isPlaceholderEnvValue(value: string) {
    return !value.trim() || PLACEHOLDER_VALUE.test(value.trim());
}

export function summarizePreflight(checks: PreflightCheck[]) {
    return {
        blocked: checks.filter((check) => check.status === 'BLOCKED').length,
        warnings: checks.filter((check) => check.status === 'WARNING').length,
        passed: checks.filter((check) => check.status === 'PASS').length,
    };
}

export function requiredEnvironmentCheck(requiredKeys: string[], env: Record<string, string>): PreflightCheck {
    const missing = requiredKeys.filter((key) => !(key in env) || !env[key]?.trim());
    return {
        code: 'ENV_REQUIRED', category: 'environment', title: 'Required environment variables',
        status: missing.length ? 'BLOCKED' : 'PASS',
        message: missing.length ? `Missing required variables: ${missing.join(', ')}` : requiredKeys.length ? `All ${requiredKeys.length} required variables are configured.` : 'No required environment template variables were declared.',
    };
}

export function referencedEnvironmentCheck(referencedKeys: string[], env: Record<string, string>): PreflightCheck {
    const unconfigured = referencedKeys.filter((key) => !(key in env));
    return {
        code: 'ENV_REFERENCES', category: 'environment', title: 'Referenced environment variables',
        status: unconfigured.length ? 'WARNING' : 'PASS',
        message: unconfigured.length ? `Referenced but not configured: ${unconfigured.join(', ')}` : 'All detected environment references are configured.',
    };
}

function lines(output: string) {
    return [...new Set(output.split('\n').map((line) => line.trim()).filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(line)))];
}

function flattenEnvironment(encryptedEnv?: string | null) {
    const merged: Record<string, string> = {};
    for (const file of EnvironmentService.getDecryptedEnv(encryptedEnv).files) {
        Object.assign(merged, file.variables);
    }
    return merged;
}

function connectionTarget(value: string): { kind: 'database' | 'redis'; host: string; port: number } | null {
    try {
        const parsed = new URL(value);
        if (['postgres:', 'postgresql:', 'mysql:', 'mongodb:'].includes(parsed.protocol)) {
            const defaults: Record<string, number> = { 'postgres:': 5432, 'postgresql:': 5432, 'mysql:': 3306, 'mongodb:': 27017 };
            return { kind: 'database', host: parsed.hostname, port: Number(parsed.port || defaults[parsed.protocol]) };
        }
        if (['redis:', 'rediss:'].includes(parsed.protocol)) {
            return { kind: 'redis', host: parsed.hostname, port: Number(parsed.port || 6379) };
        }
    } catch {
        return null;
    }
    return null;
}

export class PreflightService {
    static async run(input: {
        deploymentId: string;
        ssh: SSHService;
        workDir: string;
        detected: DetectedProject;
        encryptedEnv?: string | null;
        effectiveDomain: string;
        vpsIp: string;
        composeService?: string;
        composePort?: number;
        warningsAccepted: boolean;
    }) {
        const checks: PreflightCheck[] = [];
        const env = flattenEnvironment(input.encryptedEnv);

        const requiredResult = await input.ssh.execute(
            `cd ${shellQuote(input.workDir)} && find . -maxdepth 4 -type f \\( -name '.env.example' -o -name '.env.sample' -o -name '.env.template' \\) -exec awk -F= '/^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=/{gsub(/[[:space:]]/, "", $1); print $1}' {} + 2>/dev/null || true`,
        );
        const requiredKeys = lines(requiredResult.stdout);
        checks.push(requiredEnvironmentCheck(requiredKeys, env));

        const referencedResult = await input.ssh.execute(
            `cd ${shellQuote(input.workDir)} && grep -RhoE --exclude-dir=node_modules --exclude-dir=.git --exclude='*.map' '(process\\.env\\.|import\\.meta\\.env\\.)[A-Za-z_][A-Za-z0-9_]*' . 2>/dev/null | sed -E 's/.*\\.//' | sort -u | head -100 || true`,
        );
        const referenced = lines(referencedResult.stdout).filter((key) => !key.startsWith('NODE_'));
        checks.push(referencedEnvironmentCheck(referenced, env));

        const placeholders = Object.entries(env).filter(([, value]) => isPlaceholderEnvValue(value)).map(([key]) => key);
        checks.push({
            code: 'ENV_PLACEHOLDERS', category: 'environment', title: 'Placeholder values',
            status: placeholders.length ? 'WARNING' : 'PASS',
            message: placeholders.length ? `Possible placeholder values: ${placeholders.join(', ')}` : 'No placeholder environment values detected.',
        });

        checks.push({
            code: 'PROJECT_STRUCTURE', category: 'project', title: 'Project structure', status: 'PASS',
            message: `${input.detected.framework} project structure detected.`,
        });
        const port = input.composePort || input.detected.appPort;
        checks.push({
            code: 'SERVICE_PORT', category: 'project', title: 'Service and port',
            status: Number.isInteger(port) && port > 0 && port <= 65535 ? 'PASS' : 'BLOCKED',
            message: Number.isInteger(port) && port > 0 && port <= 65535
                ? `${input.composeService ? `Ingress service ${input.composeService} on ` : 'Application '}port ${port} detected.`
                : 'A valid application port could not be detected.',
        });
        checks.push({
            code: 'COMPOSE_POLICY', category: 'security', title: 'Compose safety policy', status: 'PASS',
            message: input.detected.framework === 'DOCKER_COMPOSE' ? 'Compose manifest passed the managed safety policy.' : 'Compose policy is not required for this project.',
        });

        const disk = await input.ssh.execute(`df -Pk ${shellQuote(input.workDir)} | awk 'NR==2 {print $4}'`).catch(() => ({ stdout: '', code: 1, stderr: '' }));
        const availableKiB = Number.parseInt(disk.stdout.trim(), 10);
        checks.push({
            code: 'VPS_DISK', category: 'vps', title: 'VPS disk availability',
            status: Number.isFinite(availableKiB) && availableKiB >= 1024 * 1024 ? 'PASS' : 'BLOCKED',
            message: Number.isFinite(availableKiB) ? `${Math.floor(availableKiB / 1024)} MiB disk space is available.` : 'VPS disk availability could not be verified.',
        });

        const runtimeCommand = ['DOCKER', 'DOCKER_COMPOSE'].includes(input.detected.framework) ? 'docker' : input.detected.deploymentType === 'STATIC' || input.detected.framework.includes('NODE') || input.detected.framework.includes('NEXT') || input.detected.framework.includes('VITE') ? 'node' : 'sh';
        const runtime = await input.ssh.execute(`command -v ${runtimeCommand} >/dev/null 2>&1`);
        checks.push({
            code: 'VPS_RUNTIME', category: 'vps', title: 'Required runtime',
            status: runtime.code === 0 ? 'PASS' : 'BLOCKED',
            message: runtime.code === 0 ? `Required ${runtimeCommand} runtime is available.` : `Required ${runtimeCommand} runtime is unavailable.`,
        });

        const targets = Object.entries(env)
            .map(([key, value]) => ({ key, target: connectionTarget(value) }))
            .filter((item): item is { key: string; target: NonNullable<ReturnType<typeof connectionTarget>> } => Boolean(item.target));
        for (const { key, target } of targets) {
            if (!/^[A-Za-z0-9._:-]+$/.test(target.host)) continue;
            const internal = !target.host.includes('.') && target.host !== 'localhost' && target.host !== '127.0.0.1';
            const reachable = internal || (await input.ssh.execute(`timeout 4 bash -c '</dev/tcp/${target.host}/${target.port}' >/dev/null 2>&1`)).code === 0;
            checks.push({
                code: `CONNECTIVITY_${key}`, category: 'connectivity', title: `${target.kind === 'redis' ? 'Redis' : 'Database'} connectivity`,
                status: reachable ? 'PASS' : 'BLOCKED',
                message: reachable ? `${key} endpoint is ${internal ? 'an internal service target' : 'reachable from the VPS'}.` : `${key} endpoint is not reachable from the VPS.`,
            });
        }
        if (!targets.length) checks.push({ code: 'CONNECTIVITY_NONE', category: 'connectivity', title: 'External service connectivity', status: 'PASS', message: 'No database or Redis connection URL was configured.' });

        let dnsStatus: PreflightStatus = 'PASS';
        let dnsMessage = 'Domain DNS resolves to the target VPS.';
        if (input.effectiveDomain.endsWith('.sslip.io')) {
            dnsMessage = 'Managed sslip.io domain is derived from the target VPS address.';
        } else {
            try {
                const resolved = await dns.resolve4(input.effectiveDomain);
                if (!resolved.includes(input.vpsIp)) {
                    dnsStatus = 'WARNING';
                    dnsMessage = 'Domain DNS does not yet resolve to the target VPS; propagation may still be pending.';
                }
            } catch {
                dnsStatus = 'WARNING';
                dnsMessage = 'Domain DNS could not be resolved yet; propagation may still be pending.';
            }
        }
        checks.push({ code: 'DOMAIN_DNS', category: 'network', title: 'Domain DNS', status: dnsStatus, message: dnsMessage });

        await prisma.$transaction([
            prisma.deploymentPreflightCheck.deleteMany({ where: { deploymentId: input.deploymentId } }),
            prisma.deploymentPreflightCheck.createMany({ data: checks.map((check) => ({ deploymentId: input.deploymentId, ...check })) }),
        ]);

        const summary = summarizePreflight(checks);
        if (summary.blocked) throw new PreflightGateError('BLOCKED', `${summary.blocked} preflight check${summary.blocked === 1 ? '' : 's'} blocked this deployment.`);
        if (summary.warnings && !input.warningsAccepted) throw new PreflightGateError('WARNING', `${summary.warnings} preflight warning${summary.warnings === 1 ? '' : 's'} require approval.`);
        return { checks, summary };
    }
}
