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
            const parsed = JSON.parse(this.decrypt(encryptedEnv));
            return Object.keys(this.normalizeEnv(parsed)).map((key) => ({ key, value: '********' }));
        } catch {
            return [];
        }
    }

    static async injectEnvironment(ssh: SSHService, deploymentId: string, workDir: string, encryptedEnv?: string | null) {
        if (!encryptedEnv) {
            return false;
        }

        let env: Record<string, string>;
        try {
            env = this.normalizeEnv(JSON.parse(this.decrypt(encryptedEnv)));
        } catch {
            throw new DeploymentError('building', 'Deployment environment variables are invalid', 'ENV_DECRYPT_FAILED');
        }

        const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);

        if (lines.length === 0) {
            return false;
        }

        await runCommand(ssh, deploymentId, 'system', `cat > ${shellQuote(`${workDir}/.env.deployforge`)} <<'EOF'\n${lines.join('\n')}\nEOF\nchmod 600 ${shellQuote(`${workDir}/.env.deployforge`)}`);
        await LoggingService.log(deploymentId, `Injected ${lines.length} environment variables`, 'system');
        return true;
    }
}
