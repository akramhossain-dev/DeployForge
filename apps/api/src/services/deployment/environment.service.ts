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

    static validatePath(filePath: string): string {
        const trimmed = filePath.trim();
        if (!trimmed) {
            throw new DeploymentError('building', 'Environment file path cannot be empty', 'INVALID_ENV_PATH');
        }
        // Reject absolute paths
        if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-zA-Z]:/.test(trimmed)) {
            throw new DeploymentError('building', `Absolute paths are not allowed: ${trimmed}`, 'INVALID_ENV_PATH');
        }
        // Reject path traversal
        if (trimmed.split(/[/\\]/).some(part => part === '..')) {
            throw new DeploymentError('building', `Path traversal is not allowed: ${trimmed}`, 'INVALID_ENV_PATH');
        }
        // Normalize backslashes to forward slashes, remove multiple slashes and leading dot-slashes
        const normalized = trimmed.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        if (!normalized || normalized === '.' || normalized === '.env') {
            return '.env';
        }
        const fileName = normalized.split('/').pop() || '';
        if (!fileName.startsWith('.env')) {
            throw new DeploymentError('building', `Environment file name must start with .env: ${fileName}`, 'INVALID_ENV_PATH');
        }
        return normalized;
    }

    static encryptEnv(env?: any) {
        if (!env) {
            return this.encryptRaw(JSON.stringify({ version: 2, files: [{ path: '.env', variables: {} }] }));
        }

        let toEncrypt: any;
        if (env && env.version === 2 && Array.isArray(env.files)) {
            if (env.files.length > 20) {
                throw new DeploymentError('building', 'Maximum limit of 20 environment files exceeded', 'ENV_LIMIT_EXCEEDED');
            }
            let totalVars = 0;
            const normalizedFiles = env.files.map((file: any) => {
                const path = this.validatePath(file.path || '.env');
                const variables = this.normalizeEnv(file.variables || {});
                totalVars += Object.keys(variables).length;
                return { path, variables };
            });
            if (totalVars > 200) {
                throw new DeploymentError('building', 'Maximum limit of 200 environment variables exceeded', 'ENV_LIMIT_EXCEEDED');
            }
            toEncrypt = {
                version: 2,
                files: normalizedFiles
            };
        } else {
            // Legacy / flat env
            const variables = this.normalizeEnv(env || {});
            toEncrypt = {
                version: 2,
                files: [
                    {
                        path: '.env',
                        variables
                    }
                ]
            };
        }

        const plainText = JSON.stringify(toEncrypt);
        if (plainText.length > 131072) {
            throw new DeploymentError('building', 'Environment variables payload size exceeds limit', 'ENV_PAYLOAD_TOO_LARGE');
        }

        return this.encryptRaw(plainText);
    }

    private static encryptRaw(plainText: string) {
        const encrypted = encryptionService.encrypt(plainText);
        return `${encrypted.iv}:${encrypted.tag}:${encrypted.content}`;
    }

    static getDecryptedEnv(encryptedEnv?: string | null) {
        if (!encryptedEnv) {
            return {
                version: 2,
                files: [
                    {
                        path: '.env',
                        variables: {}
                    }
                ]
            };
        }

        try {
            let decrypted: string;
            const trimmed = encryptedEnv.trim();
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                decrypted = trimmed;
            } else {
                decrypted = this.decrypt(encryptedEnv);
            }
            const parsed = JSON.parse(decrypted);

            if (parsed && parsed.version === 2 && Array.isArray(parsed.files)) {
                return {
                    version: 2,
                    files: parsed.files.map((file: any) => ({
                        path: this.validatePath(file.path || '.env'),
                        variables: this.normalizeEnv(file.variables || {})
                    }))
                };
            }

            // Legacy flat format
            return {
                version: 2,
                files: [
                    {
                        path: '.env',
                        variables: this.normalizeEnv(parsed || {})
                    }
                ]
            };
        } catch {
            return {
                version: 2,
                files: [
                    {
                        path: '.env',
                        variables: {}
                    }
                ]
            };
        }
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
            const parsed = this.getDecryptedEnv(encryptedEnv);
            const result: { key: string; value: string; path: string }[] = [];
            for (const file of parsed.files) {
                for (const key of Object.keys(file.variables)) {
                    result.push({ key, value: '********', path: file.path });
                }
            }
            return result;
        } catch {
            return [];
        }
    }

    static getEnvPath(username: string, deploymentId: string) {
        return `/home/${username}/deployforge/envs/${deploymentId}.env`;
    }

    static async injectEnvironment(ssh: SSHService, username: string, deploymentId: string, workDir: string, encryptedEnv?: string | null) {
        if (!encryptedEnv) {
            return false;
        }

        let parsed: ReturnType<typeof EnvironmentService.getDecryptedEnv>;
        try {
            parsed = this.getDecryptedEnv(encryptedEnv);
        } catch {
            throw new DeploymentError('building', 'Deployment environment variables are invalid', 'ENV_DECRYPT_FAILED');
        }

        let mergedEnv: Record<string, string> = {};
        let totalFilesWritten = 0;

        for (const file of parsed.files) {
            const filePath = file.path || '.env';
            const variables = file.variables || {};

            mergedEnv = { ...mergedEnv, ...variables };

            if (workDir) {
                const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
                const absolutePath = `${workDir}/${relativePath}`;
                const fileLines = Object.entries(variables).map(([k, v]) => `${k}=${v}`);

                const dirName = absolutePath.substring(0, absolutePath.lastIndexOf('/'));
                if (dirName && dirName !== workDir) {
                    await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(dirName)}`);
                }

                const writeCmd = `umask 077 && cat > ${shellQuote(absolutePath)} <<'EOF'\n${fileLines.join('\n')}\nEOF\nchmod 600 ${shellQuote(absolutePath)}`;
                await runCommand(ssh, deploymentId, 'system', writeCmd);
                totalFilesWritten++;
            }
        }

        const lines = Object.entries(mergedEnv).map(([key, value]) => `${key}=${value}`);
        if (lines.length === 0 && totalFilesWritten === 0) {
            return false;
        }

        const envPath = this.getEnvPath(username, deploymentId);
        const setupSecureDir = `mkdir -p /home/${username}/deployforge/envs && chmod 700 /home/${username}/deployforge/envs`;
        await runCommand(ssh, deploymentId, 'system', setupSecureDir);

        const writeEnvCmd = `umask 077 && cat > ${shellQuote(envPath)} <<'EOF'\n${lines.join('\n')}\nEOF\nchmod 600 ${shellQuote(envPath)}`;
        await runCommand(ssh, deploymentId, 'system', writeEnvCmd);

        await LoggingService.log(deploymentId, `Injected ${parsed.files.length} environment files and merged runtime variables to secure storage`, 'system');
        return true;
    }
}
