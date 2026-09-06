/**
 * RuntimeInstaller
 *
 * Executes idempotent, whitelisted installation commands on the VPS via SSH.
 *
 * Safety rules enforced here:
 *  1. Every runtime name is validated against the INSTALL_REGISTRY whitelist.
 *  2. Commands are constructed from fixed templates — no user-supplied strings
 *     are interpolated into shell commands.
 *  3. Passwords, keys, and env vars are NEVER included in log messages.
 *  4. The installer uses DEBIAN_FRONTEND=noninteractive to prevent interactive prompts.
 *  5. Each install step checks if the tool is already present before installing
 *     (idempotent — safe to run multiple times).
 */

import { SSHService } from '@deployforge/vps';
import { InstallationLogEntry, InstallationPlan, InstallationPlanItem, RuntimeName } from './types';

export type InstallLogCallback = (entry: InstallationLogEntry) => void;

// ─── Install Registry ─────────────────────────────────────────────────────────
// Only runtimes listed here can ever be installed. Each entry has:
//   - checkCmd: command that exits 0 if already installed
//   - installScript: idempotent shell script run via SSH
//   - verifyCmd: command used to confirm success

type RegistryEntry = {
    /** Shell command that exits 0 if already installed (used for idempotency check). */
    checkCmd: (version: string | null) => string;
    /** Full install script — must be idempotent and non-interactive. */
    installScript: (version: string | null) => string;
    /** Short verify command for post-install check. */
    verifyCmd: string;
};

const APT_UPDATE = `export DEBIAN_FRONTEND=noninteractive && apt-get update -qq`;
const APT_INSTALL = `export DEBIAN_FRONTEND=noninteractive && apt-get install -y -qq`;

const INSTALL_REGISTRY: Partial<Record<RuntimeName, RegistryEntry>> = {

    nodejs: {
        checkCmd: (v) => {
            const major = extractMajor(v) || 20;
            return `node --version 2>/dev/null | grep -E "^v${major}" > /dev/null`;
        },
        installScript: (v) => {
            const major = extractMajor(v) || 20;
            return [
                APT_UPDATE,
                `${APT_INSTALL} curl ca-certificates`,
                `curl -fsSL https://deb.nodesource.com/setup_${major}.x | bash -`,
                `${APT_INSTALL} nodejs`,
            ].join(' && ');
        },
        verifyCmd: 'node --version',
    },

    npm: {
        // npm ships with Node.js — just ensure it's present
        checkCmd: () => 'npm --version > /dev/null 2>&1',
        installScript: () => 'npm install -g npm@latest 2>/dev/null || true',
        verifyCmd: 'npm --version',
    },

    pnpm: {
        checkCmd: () => 'pnpm --version > /dev/null 2>&1',
        installScript: () => 'npm install -g pnpm',
        verifyCmd: 'pnpm --version',
    },

    yarn: {
        checkCmd: () => 'yarn --version > /dev/null 2>&1',
        installScript: () => 'npm install -g yarn',
        verifyCmd: 'yarn --version',
    },

    bun: {
        checkCmd: () => 'bun --version > /dev/null 2>&1',
        installScript: () => 'curl -fsSL https://bun.sh/install | bash',
        verifyCmd: 'bun --version',
    },

    python: {
        checkCmd: (v) => {
            const minorStr = extractMinorStr(v);
            return minorStr
                ? `python${minorStr} --version > /dev/null 2>&1`
                : 'python3 --version > /dev/null 2>&1';
        },
        installScript: (v) => {
            const minor = extractMinorStr(v) || '3';
            const pkg = minor === '3' ? 'python3 python3-pip python3-venv'
                : `python${minor} python${minor}-pip python${minor}-venv`;
            return [
                APT_UPDATE,
                `${APT_INSTALL} software-properties-common`,
                `add-apt-repository -y ppa:deadsnakes/ppa 2>/dev/null || true`,
                APT_UPDATE,
                `${APT_INSTALL} ${pkg}`,
            ].join(' && ');
        },
        verifyCmd: 'python3 --version',
    },

    java: {
        checkCmd: (v) => {
            const major = extractMajor(v) || 21;
            return `java -version 2>&1 | grep -E "${major}" > /dev/null`;
        },
        installScript: (v) => {
            const major = extractMajor(v) || 21;
            const pkg = `openjdk-${major}-jdk`;
            return [
                APT_UPDATE,
                `${APT_INSTALL} ${pkg} 2>/dev/null || ${APT_INSTALL} default-jdk`,
            ].join(' && ');
        },
        verifyCmd: 'java -version 2>&1 | head -1',
    },

    go: {
        checkCmd: (v) => {
            const ver = v || '1.22';
            return `go version 2>/dev/null | grep -E "go${ver.split('.').slice(0, 2).join('.')}" > /dev/null`;
        },
        installScript: () => {
            return [
                APT_UPDATE,
                `${APT_INSTALL} golang-go`,
            ].join(' && ');
        },
        verifyCmd: 'go version',
    },

    php: {
        checkCmd: (v) => {
            const minor = extractMinorStr(v);
            return minor
                ? `php${minor} --version > /dev/null 2>&1`
                : 'php --version > /dev/null 2>&1';
        },
        installScript: (v) => {
            const minor = extractMinorStr(v);
            const pkg = minor ? `php${minor} php${minor}-cli php${minor}-fpm php${minor}-common`
                : 'php php-cli php-fpm php-common';
            return [
                APT_UPDATE,
                `${APT_INSTALL} software-properties-common`,
                `add-apt-repository -y ppa:ondrej/php 2>/dev/null || true`,
                APT_UPDATE,
                `${APT_INSTALL} ${pkg}`,
            ].join(' && ');
        },
        verifyCmd: 'php --version | head -1',
    },

    ruby: {
        checkCmd: () => 'ruby --version > /dev/null 2>&1',
        installScript: () => {
            return [
                APT_UPDATE,
                `${APT_INSTALL} ruby ruby-dev`,
            ].join(' && ');
        },
        verifyCmd: 'ruby --version',
    },

    docker: {
        checkCmd: () => 'docker --version > /dev/null 2>&1',
        installScript: () => {
            return [
                APT_UPDATE,
                `${APT_INSTALL} ca-certificates curl gnupg`,
                `install -m 0755 -d /etc/apt/keyrings`,
                `curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --batch --yes`,
                `chmod a+r /etc/apt/keyrings/docker.gpg`,
                `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list`,
                APT_UPDATE,
                `${APT_INSTALL} docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`,
                `systemctl enable docker 2>/dev/null || true`,
                `systemctl start docker 2>/dev/null || true`,
            ].join(' && ');
        },
        verifyCmd: 'docker --version',
    },

    'docker-compose': {
        checkCmd: () => 'docker compose version > /dev/null 2>&1',
        installScript: () => {
            // docker-compose-plugin comes with Docker CE — install it if missing
            return [
                APT_UPDATE,
                `${APT_INSTALL} docker-compose-plugin`,
            ].join(' && ');
        },
        verifyCmd: 'docker compose version',
    },

    redis: {
        checkCmd: () => 'redis-server --version > /dev/null 2>&1',
        installScript: () => {
            return [
                APT_UPDATE,
                `${APT_INSTALL} redis-server`,
                `systemctl enable redis-server 2>/dev/null || true`,
                `systemctl start redis-server 2>/dev/null || true`,
            ].join(' && ');
        },
        verifyCmd: 'redis-server --version',
    },

    nginx: {
        checkCmd: () => 'nginx -v > /dev/null 2>&1',
        installScript: () => {
            return [
                APT_UPDATE,
                `${APT_INSTALL} nginx`,
                `systemctl enable nginx 2>/dev/null || true`,
                `systemctl start nginx 2>/dev/null || true`,
            ].join(' && ');
        },
        verifyCmd: 'nginx -v 2>&1 | head -1',
    },

    postgresql: {
        checkCmd: () => 'psql --version > /dev/null 2>&1',
        installScript: () => {
            return [
                APT_UPDATE,
                `${APT_INSTALL} postgresql postgresql-contrib`,
                `systemctl enable postgresql 2>/dev/null || true`,
                `systemctl start postgresql 2>/dev/null || true`,
            ].join(' && ');
        },
        verifyCmd: 'psql --version',
    },

    mysql: {
        checkCmd: () => 'mysql --version > /dev/null 2>&1',
        installScript: () => {
            return [
                `export DEBIAN_FRONTEND=noninteractive`,
                `debconf-set-selections <<< 'mysql-server mysql-server/root_password password root' 2>/dev/null || true`,
                `debconf-set-selections <<< 'mysql-server mysql-server/root_password_again password root' 2>/dev/null || true`,
                APT_UPDATE,
                `${APT_INSTALL} mysql-server`,
                `systemctl enable mysql 2>/dev/null || true`,
                `systemctl start mysql 2>/dev/null || true`,
            ].join(' && ');
        },
        verifyCmd: 'mysql --version',
    },
};

// ─── RuntimeInstaller ─────────────────────────────────────────────────────────

export class RuntimeInstaller {

    /**
     * Execute an installation plan on the VPS.
     * Only items with action='install' are executed.
     * Each step is idempotent — already-present runtimes are skipped.
     */
    static async install(
        ssh: SSHService,
        plan: InstallationPlan,
        onLog: InstallLogCallback,
    ): Promise<void> {
        if (plan.isNoop) {
            onLog(this.log('info', 'All required dependencies are already installed. No changes needed.'));
            return;
        }

        const toInstall = plan.items.filter((item) => item.action === 'install');

        // Check sudo availability once before starting
        const sudoOk = await this.checkSudo(ssh);
        if (!sudoOk) {
            onLog(this.log('warn', 'sudo is not available or requires a password — installation may fail. Attempting anyway.'));
        }

        for (const item of toInstall) {
            await this.installOne(ssh, item, onLog);
        }

        onLog(this.log('success', 'Installation phase complete.'));
    }

    private static async installOne(
        ssh: SSHService,
        item: InstallationPlanItem,
        onLog: InstallLogCallback,
    ): Promise<void> {
        const entry = INSTALL_REGISTRY[item.name];
        if (!entry) {
            onLog(this.log('warn', `→ ${item.name}: No install procedure available — skipping.`));
            return;
        }

        // Idempotency check
        const checkResult = await ssh.execute(entry.checkCmd(item.targetVersion)).catch(() => ({ code: 1 }));
        if (checkResult.code === 0) {
            onLog(this.log('info', `✓ ${item.name} already satisfies requirements — skipping install.`, item.name));
            return;
        }

        onLog(this.log('info', `→ Installing ${item.name}${item.targetVersion ? ` (${item.targetVersion})` : ''}...`, item.name));

        const script = `sudo sh -c ${shellQuoteArg(entry.installScript(item.targetVersion))} 2>&1`;
        const { code, stdout, stderr } = await ssh.execute(script, 300_000 /* 5 min timeout */);

        if (code !== 0) {
            // Strip any potentially sensitive output from the error message
            const safeOutput = sanitizeOutput(stdout || stderr || '');
            onLog(this.log('error', `✗ Failed to install ${item.name}: ${safeOutput}`, item.name));
            throw new Error(`Installation of ${item.name} failed (exit ${code}): ${safeOutput}`);
        }

        onLog(this.log('success', `✓ ${item.name} installed successfully.`, item.name));
    }

    private static async checkSudo(ssh: SSHService): Promise<boolean> {
        const result = await ssh.execute('sudo -n true 2>/dev/null').catch(() => ({ code: 1 }));
        return result.code === 0;
    }

    private static log(level: InstallationLogEntry['level'], message: string, runtimeName?: RuntimeName): InstallationLogEntry {
        return { timestamp: new Date().toISOString(), message, level, runtimeName };
    }

    /**
     * Validate that a runtime name is in the allow-list.
     * Used by API routes to prevent arbitrary installation requests.
     */
    static isAllowed(name: string): name is RuntimeName {
        return name in INSTALL_REGISTRY;
    }

    static getAllowedRuntimes(): RuntimeName[] {
        return Object.keys(INSTALL_REGISTRY) as RuntimeName[];
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the major version number from a version string like "3.12" or ">=20". */
function extractMajor(v: string | null): number | null {
    if (!v) return null;
    const m = v.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

/** Extract "major.minor" string for Python/PHP versioned packages. */
function extractMinorStr(v: string | null): string | null {
    if (!v) return null;
    const m = v.match(/(\d+)\.(\d+)/);
    return m ? `${m[1]}.${m[2]}` : null;
}

/** Shell-quote a string for use as a single argument to sh -c. */
function shellQuoteArg(script: string): string {
    return `'${script.replace(/'/g, "'\\''")}'`;
}

/**
 * Remove potentially sensitive patterns from command output before logging.
 * This is a defence-in-depth measure — install scripts should never emit secrets,
 * but we sanitize anyway.
 */
function sanitizeOutput(output: string): string {
    // Remove anything that looks like a token, key, or password
    return output
        .replace(/(?:password|secret|key|token|credential)[^\n]{0,200}/gi, '[REDACTED]')
        .replace(/([A-Za-z0-9+/]{40,}={0,2})/g, '[REDACTED]')  // base64-like strings
        .substring(0, 500); // Cap length
}
