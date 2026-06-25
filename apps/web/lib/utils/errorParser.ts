export type ErrorCategory =
    | 'Build Error'
    | 'Runtime Error'
    | 'Deployment Error'
    | 'Docker Error'
    | 'Git Error'
    | 'SSH Error'
    | 'Domain Error'
    | 'SSL Error'
    | 'Environment Variable Error'
    | 'Validation Error'
    | 'Network Error'
    | 'Permission Error'
    | 'Unknown Error';

export interface ParsedError {
    category: ErrorCategory;
    code: string;
    explanation: string;
    suggestions: string[];
    rawError: string;
}

export function maskSensitiveData(text: string): string {
    if (!text) return text;
    let sanitized = text;
    
    const keyValuePattern = /(db_password|database_url|ssh_password|github_token|jwt_secret|api_key|secret|password|token|private_key|privatekey)(.*?)(=|:|is)\s*([^\s;'"\n\r]+)/gi;
    sanitized = sanitized.replace(keyValuePattern, (match, p1, p2, p3, p4) => {
        return `${p1}${p2}${p3}********`;
    });

    // 2. CLI flags (e.g., --token xyz)
    const cliPattern = /(--password|--token|--key)\s+([^\s;'"\n\r]+)/gi;
    sanitized = sanitized.replace(cliPattern, (match, p1, p2) => {
        return `${p1} ********`;
    });

    return sanitized;
}

export function parseError(rawError: string): ParsedError {
    const masked = maskSensitiveData(rawError || '');
    
    // 1. Container Restart / Runtime Crashes
    if (/container is restarting/i.test(masked) || /daemon: Container.*restarting/i.test(masked)) {
        return {
            category: 'Runtime Error',
            code: 'DF-RUNTIME-001',
            explanation: 'Container failed to start.\nThe application crashed immediately after launch.\nCheck startup logs and verify the start command.',
            suggestions: [
                'Check startup command configuration',
                'Verify build output and dist/app folders',
                'Review runtime application logs for uncaught exceptions'
            ],
            rawError: masked
        };
    }

    // 2. Module / File Not Found
    if (/MODULE_NOT_FOUND/i.test(masked) || /cannot find module/i.test(masked) || /no such file or directory/i.test(masked)) {
        return {
            category: 'Runtime Error',
            code: 'DF-RUNTIME-002',
            explanation: 'Application startup failed.\nA required file or dependency could not be found.',
            suggestions: [
                'Check startup command entrypoint (e.g., node dist/server.js)',
                'Verify package.json main/scripts definition',
                'Ensure the build phase generated all necessary output files'
            ],
            rawError: masked
        };
    }

    // 3. NPM Lockfile / Dependency failures
    if (/npm ci EUSAGE/i.test(masked) || /package-lock\.json was not found/i.test(masked) || /package-lock\.json.*missing/i.test(masked)) {
        return {
            category: 'Build Error',
            code: 'DF-BUILD-001',
            explanation: 'Dependency installation failed.\npackage-lock.json was not found.\nEither add a lock file or use a supported package manager.',
            suggestions: [
                'Commit package-lock.json, yarn.lock, pnpm-lock.yaml or bun.lock to your repository',
                'Disable npm ci if lockfile is intentionally omitted',
                'Ensure package manager setting matches your project lockfile'
            ],
            rawError: masked
        };
    }

    // 4. General Build/Compile Errors
    if (/build failed/i.test(masked) || /tsc.*failed/i.test(masked) || /vite build.*error/i.test(masked) || /astro build.*error/i.test(masked)) {
        return {
            category: 'Build Error',
            code: 'DF-BUILD-002',
            explanation: 'Application compilation or bundling failed during the build phase.',
            suggestions: [
                'Run the build command locally to verify typescript or bundler issues',
                'Ensure devDependencies are configured correctly in package.json',
                'Verify tsconfig.json options are compatible with compiler'
            ],
            rawError: masked
        };
    }

    // 5. Git Clone Errors
    if (/git clone failed/i.test(masked) || /permission denied \(publickey\)/i.test(masked) || /repository not found/i.test(masked) || /could not resolve host/i.test(masked) && /github/i.test(masked)) {
        return {
            category: 'Git Error',
            code: 'DF-GIT-001',
            explanation: 'Git repository access failed.\nCould not authenticate, resolve host, or clone the repository.',
            suggestions: [
                'Check repository URL and branch name',
                'Re-authenticate or update GitHub connection permissions',
                'Verify repository still exists and is not private without authentication'
            ],
            rawError: masked
        };
    }

    // 6. Nginx / Routing/ DNS Errors
    if (/nginx: configuration file.*failed/i.test(masked) || /DNS record.*not found/i.test(masked) || /nginx: \[emerg\]/i.test(masked) || /nginx.*emerg/i.test(masked)) {
        return {
            category: 'Domain Error',
            code: 'DF-DOMAIN-001',
            explanation: 'Domain routing configuration failed.\nNginx test failed or DNS record was not found.',
            suggestions: [
                'Verify DNS A/AAAA records point to your VPS IP address',
                'Ensure the target domain is spelled correctly',
                'Verify Nginx service is running normally on the host'
            ],
            rawError: masked
        };
    }

    // 7. Certbot / SSL Generation Errors
    if (/failed authorization procedure/i.test(masked) || /certbot failed/i.test(masked) || /ssl verification failed/i.test(masked) || /acme-challenge/i.test(masked)) {
        return {
            category: 'SSL Error',
            code: 'DF-SSL-001',
            explanation: "SSL certificate generation failed.\nLet's Encrypt challenge could not verify your domain ownership.",
            suggestions: [
                'Ensure the domain is publicly accessible and ports 80/443 are open',
                'Check for firewall rules blocking Let\'s Encrypt verification servers',
                'Confirm the domain DNS record points to the active VPS IP'
            ],
            rawError: masked
        };
    }

    if (/environment variable missing/i.test(masked) || /required env var/i.test(masked) || /process\.env\..*is undefined/i.test(masked) || /missing.*variable/i.test(masked)) {
        return {
            category: 'Environment Variable Error',
            code: 'DF-ENV-001',
            explanation: 'Required environment variable is missing or invalid at runtime.',
            suggestions: [
                'Open Environment Variables tab',
                'Add missing variable key and value',
                'Redeploy the project'
            ],
            rawError: masked
        };
    }

    if (/cannot connect to the Docker daemon/i.test(masked) || /docker daemon not running/i.test(masked) || /docker: command not found/i.test(masked)) {
        return {
            category: 'Docker Error',
            code: 'DF-DOCKER-001',
            explanation: 'Could not communicate with Docker service on the VPS.',
            suggestions: [
                'Check Docker status on the VPS using command: systemctl status docker',
                'Restart the docker daemon service: systemctl restart docker',
                'Verify the current VPS user has permission to use Docker'
            ],
            rawError: masked
        };
    }

    if (/ssh connection failed/i.test(masked) || /All configured authentication methods failed/i.test(masked) || /ssh: connect to host/i.test(masked) || /timed out connecting/i.test(masked)) {
        return {
            category: 'SSH Error',
            code: 'DF-SSH-001',
            explanation: 'Unable to connect to the VPS via SSH.',
            suggestions: [
                'Verify IP Address, Port, Username, and authentication credentials',
                'Check firewalls (allow port 22 or your custom SSH port)',
                'Ensure the VPS is online, running, and accessible'
            ],
            rawError: masked
        };
    }

    if (/permission denied/i.test(masked) || /EACCES/i.test(masked) || /permission denied \(os error 13\)/i.test(masked)) {
        return {
            category: 'Permission Error',
            code: 'DF-PERM-001',
            explanation: 'File system permission or execution permission denied on the host.',
            suggestions: [
                'Verify target directory permissions on VPS',
                'Ensure target user has sudo or appropriate group permissions (e.g. docker group)'
            ],
            rawError: masked
        };
    }

    if (/network is unreachable/i.test(masked) || /connection timed out/i.test(masked) || /fetch failed/i.test(masked) || /npm ERR! network/i.test(masked)) {
        return {
            category: 'Network Error',
            code: 'DF-NET-001',
            explanation: 'Network connection timeout or unreachable registry during build/deploy.',
            suggestions: [
                'Verify internet connectivity on the VPS',
                'Check status of public package registries (NPM/PyPI/Docker Hub)',
                'Retry the deployment build'
            ],
            rawError: masked
        };
    }

    if (/asset validation failed/i.test(masked) || /INVALID_VALIDATION_URL/i.test(masked) || /static asset validation failed/i.test(masked)) {
        return {
            category: 'Validation Error',
            code: 'DF-VAL-001',
            explanation: 'Post-deployment health validation failed.\nSome static assets returned non-200 responses or the URL format was malformed.',
            suggestions: [
                'Review static base path settings and asset URLs',
                'Verify all scripts, styles, and image tags resolve to 200 OK',
                'Check validator logs for specific missing asset paths'
            ],
            rawError: masked
        };
    }

    return {
        category: 'Unknown Error',
        code: 'DF-UNK-999',
        explanation: masked || 'An unexpected error occurred during the deployment lifecycle.',
        suggestions: [
            'Review the build and system deployment logs for details',
            'Verify server resource limits (CPU/Memory/Disk)',
            'Reach out to DeployForge support if the error persists'
        ],
        rawError: masked
    };
}
