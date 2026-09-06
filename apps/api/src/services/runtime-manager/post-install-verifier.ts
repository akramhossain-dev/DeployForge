/**
 * PostInstallVerifier
 *
 * After installation, run version commands to confirm each runtime
 * was installed correctly. Deployment does not continue until all
 * required runtimes pass verification.
 */

import { SSHService } from '@deployforge/vps';
import { RuntimeName, VerificationResult } from './types';

const VERIFY_COMMANDS: Record<RuntimeName, string> = {
    nodejs: 'node --version',
    npm: 'npm --version',
    pnpm: 'pnpm --version',
    yarn: 'yarn --version',
    bun: 'bun --version',
    python: 'python3 --version',
    java: 'java -version 2>&1 | head -1',
    php: 'php --version | head -1',
    go: 'go version',
    ruby: 'ruby --version',
    docker: 'docker --version',
    'docker-compose': 'docker compose version',
    redis: 'redis-server --version',
    postgresql: 'psql --version',
    mysql: 'mysql --version',
    nginx: 'nginx -v 2>&1 | head -1',
};

export class PostInstallVerifier {

    /**
     * Verify that all listed runtimes are accessible after installation.
     *
     * @param ssh          Active SSH session
     * @param runtimeNames List of runtime names to verify
     */
    static async verify(
        ssh: SSHService,
        runtimeNames: RuntimeName[],
    ): Promise<VerificationResult[]> {
        const results: VerificationResult[] = [];

        for (const name of runtimeNames) {
            const cmd = VERIFY_COMMANDS[name];
            if (!cmd) {
                results.push({ name, version: null, ok: false, error: 'No verification command defined' });
                continue;
            }

            try {
                const { stdout, stderr, code } = await ssh.execute(
                    // Ensure PATH includes common install locations
                    `export PATH="$PATH:$HOME/.bun/bin:/usr/local/go/bin" && ${cmd}`,
                    30_000,
                );

                if (code === 0) {
                    const versionLine = (stdout || stderr || '').trim().split('\n')[0];
                    results.push({ name, version: versionLine || 'installed', ok: true });
                } else {
                    results.push({
                        name,
                        version: null,
                        ok: false,
                        error: `Command exited with code ${code}`,
                    });
                }
            } catch (err: any) {
                results.push({
                    name,
                    version: null,
                    ok: false,
                    error: err?.message || 'Verification failed',
                });
            }
        }

        return results;
    }

    /**
     * Check if all results passed. Used to gate deployment continuation.
     */
    static allPassed(results: VerificationResult[]): boolean {
        return results.every((r) => r.ok);
    }

    /**
     * Format a verification summary for deployment logs.
     */
    static formatSummary(results: VerificationResult[]): string {
        const lines = results.map((r) => {
            const icon = r.ok ? '✓' : '✗';
            const detail = r.ok ? (r.version || 'ok') : (r.error || 'failed');
            return `${icon} ${r.name}: ${detail}`;
        });
        return lines.join('\n');
    }
}
