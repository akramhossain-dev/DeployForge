import { EncryptionService } from '@deployforge/security';
import { SSHService } from '@deployforge/vps';
import { config } from '../../config/env';
import { LoggingService } from '../logging.service';
import { DeploymentError } from './error';
import { shellQuote } from './utils';
import { runCommand } from './runner';

const encryptionService = new EncryptionService(config.encryption.key);

export class EnvironmentService {
    static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }

    static encryptEnv(env?: Record<string, string>) {
        const normalized = this.normalizeEnv(env || {});
        const encrypted = encryptionService.encrypt(JSON.stringify(normalized));
        return `${encrypted.iv}:${encrypted.tag}:${encrypted.content}`;
    }

    static normalizeEnv(env: unknown): Record<string, string> {
        if (!env || typeof env !== 'object' || Array.isArray(env)) return {};
        const normalized: Record<string, string> = {};
        for (const [rawKey, rawValue] of Object.entries(env as Record<string, unknown>)) {
            const key = rawKey.trim();
            if (!key && (rawValue === undefined || rawValue === null || rawValue === '')) continue;
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                throw new DeploymentError('building', `Invalid environment variable key: ${rawKey}`, 'INVALID_ENV_KEY');
            }
            if (rawValue === undefined || rawValue === null) continue;
            normalized[key] = String(rawValue).replace(/\r?\n/g, '\\n');
        }
        return normalized;
    }

    static envPreview(encryptedEnv?: string | null) {
        if (!encryptedEnv) return [];
        try {
            let decrypted: string;
            const trimmed = encryptedEnv.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                decrypted = trimmed;
            } else {
                decrypted = this.decrypt(encryptedEnv);
            }
            const parsed = JSON.parse(decrypted);
            return Object.keys(this.normalizeEnv(parsed)).map((key) => ({ key, value: '********' }));
        } catch {
            return [];
        }
    }

    static getEnvPath(deploymentId: string) {
        return `/etc/deployforge/envs/${deploymentId}.env`;
    }

    static async injectEnvironment(ssh: SSHService, deploymentId: string, workDir: string, encryptedEnv?: string | null) {
        if (!encryptedEnv) {
            return false;
        }

        let env: Record<string, string>;
        try {
            let decrypted: string;
            const trimmed = encryptedEnv.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                decrypted = trimmed;
            } else {
                decrypted = this.decrypt(encryptedEnv);
            }
            env = this.normalizeEnv(JSON.parse(decrypted));
        } catch {
            throw new DeploymentError('building', 'Deployment environment variables are invalid', 'ENV_DECRYPT_FAILED');
        }

        const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);

        if (lines.length === 0) {
            return false;
        }

        const envPath = this.getEnvPath(deploymentId);

        const setupSecureDir = `mkdir -p /etc/deployforge/envs && chmod 700 /etc/deployforge/envs`;
        await runCommand(ssh, deploymentId, 'system', setupSecureDir);

        const writeEnvCmd = `umask 077 && cat > ${shellQuote(envPath)} <<'EOF'\n${lines.join('\n')}\nEOF\nchmod 600 ${shellQuote(envPath)}`;
        await runCommand(ssh, deploymentId, 'system', writeEnvCmd);

        await LoggingService.log(deploymentId, `Injected ${lines.length} environment variables to secure storage`, 'system');
        return true;
    }
}
