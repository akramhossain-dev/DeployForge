import type { EnvFile } from '@/hooks/useDeployForgeData';

export type EnvValidationResult = {
    valid: boolean;
    error?: string;
};

export function validateEnvFiles(files: EnvFile[]): EnvValidationResult {
    const totalVars = files.reduce((sum, f) => sum + Object.keys(f.variables || {}).length, 0);

    if (files.length > 20) {
        return { valid: false, error: 'Maximum limit of 20 environment files exceeded' };
    }

    if (totalVars > 200) {
        return { valid: false, error: 'Maximum limit of 200 environment variables exceeded' };
    }

    const validateKey = (key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
    const validatePath = (path: string) => {
        if (!path.trim()) return false;
        if (path.startsWith('/') || path.startsWith('\\') || /^[a-zA-Z]:/.test(path)) return false;
        if (path.split(/[/\\]/).some((p) => p === '..')) return false;
        const normalized = path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
        const fileName = normalized.split('/').pop() || '';
        return fileName.startsWith('.env');
    };

    for (const file of files) {
        if (!validatePath(file.path)) {
            return {
                valid: false,
                error: `Invalid path: ${file.path}. Must end with a file starting with .env and contain no traversal.`,
            };
        }

        const keys = Object.keys(file.variables || {});
        const invalidKey = keys.find((k) => !validateKey(k));
        if (invalidKey) {
            return {
                valid: false,
                error: `Invalid variable key "${invalidKey}" in ${file.path}. Must start with a letter/underscore and contain only A-Z, 0-9, _.`,
            };
        }
    }

    return { valid: true };
}
