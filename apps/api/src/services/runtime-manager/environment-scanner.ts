/**
 * EnvironmentScanner
 *
 * Executes a single batched SSH script on the target VPS to collect:
 *  - OS information
 *  - CPU / RAM / Disk metrics
 *  - Installed runtime versions
 *  - Service daemon status
 *
 * All commands are read-only and non-destructive.
 * The entire scan completes in one SSH round-trip for performance.
 */

import { SSHService } from '@deployforge/vps';
import { EnvironmentScanResult, InstalledRuntime, RuntimeName, ServiceStatus, SystemInfo } from './types';

export class EnvironmentScanner {

    /**
     * Scan the VPS environment.
     * Returns a structured EnvironmentScanResult.
     */
    static async scan(ssh: SSHService): Promise<EnvironmentScanResult> {
        const script = this.buildScanScript();
        const { stdout, stderr } = await ssh.execute(script, 60_000);
        return this.parseScanOutput(stdout || stderr || '');
    }

    // ─── Script Builder ───────────────────────────────────────────────────────

    private static buildScanScript(): string {
        // Each section is delimited with a unique separator so the output can be
        // parsed reliably even if some tools are missing.
        return `
set -o pipefail 2>/dev/null || true

# Helper: emit a section header
section() { echo "###SECTION:$1###"; }

# ── System ────────────────────────────────────────────────────────────────────
section "SYSTEM"
echo "OS=$(. /etc/os-release 2>/dev/null && echo "$NAME" || uname -s)"
echo "OS_VERSION=$(. /etc/os-release 2>/dev/null && echo "$VERSION_ID" || echo "unknown")"
echo "KERNEL=$(uname -r)"
echo "ARCH=$(uname -m)"
echo "CPU_MODEL=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs || echo 'unknown')"
echo "CPU_CORES=$(nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo 2>/dev/null || echo 1)"
echo "RAM_TOTAL_MB=$(awk '/MemTotal/{printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
echo "RAM_FREE_MB=$(awk '/MemAvailable/{printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
DISK_INFO=$(df -h / 2>/dev/null | awk 'NR==2{print $2"|"$4"|"$5}' || echo "unknown|unknown|unknown%")
echo "DISK_TOTAL=$(echo $DISK_INFO | cut -d'|' -f1)"
echo "DISK_FREE=$(echo $DISK_INFO | cut -d'|' -f2)"
echo "DISK_PERCENT=$(echo $DISK_INFO | cut -d'|' -f3)"
echo "UPTIME_SECONDS=$(awk '{printf "%d", $1}' /proc/uptime 2>/dev/null || echo 0)"

# ── Runtimes ──────────────────────────────────────────────────────────────────
section "RUNTIMES"
cmd_ver() {
  local name=$1; shift
  local ver
  ver=$("$@" 2>/dev/null | head -1 | tr -d '\\r') && echo "\${name}=\${ver}" || echo "\${name}=NOT_FOUND"
}

cmd_ver nodejs node --version
cmd_ver npm npm --version
cmd_ver pnpm pnpm --version
cmd_ver yarn yarn --version
cmd_ver bun bun --version
cmd_ver python python3 --version
cmd_ver java java -version 2>&1
cmd_ver php php --version
cmd_ver go go version
cmd_ver ruby ruby --version
cmd_ver docker docker --version
cmd_ver docker-compose docker compose version
cmd_ver redis redis-server --version
cmd_ver postgresql psql --version
cmd_ver mysql mysql --version
cmd_ver nginx nginx -v 2>&1

# ── Services ──────────────────────────────────────────────────────────────────
section "SERVICES"
svc_status() {
  local name=$1 svc=$2
  if command -v systemctl >/dev/null 2>&1; then
    systemctl is-active --quiet "$svc" 2>/dev/null && echo "\${name}=running" || {
      systemctl status "$svc" >/dev/null 2>&1 && echo "\${name}=stopped" || echo "\${name}=not_installed"
    }
  else
    echo "\${name}=unknown"
  fi
}

# Docker: check daemon specifically
if command -v docker >/dev/null 2>&1; then
  docker info >/dev/null 2>&1 && echo "docker=running" || echo "docker=stopped"
else
  echo "docker=not_installed"
fi

svc_status nginx nginx
svc_status redis redis
svc_status postgresql postgresql
svc_status mysql mysql

section "END"
`.trim();
    }

    // ─── Output Parser ────────────────────────────────────────────────────────

    private static parseScanOutput(raw: string): EnvironmentScanResult {
        const sections = this.splitSections(raw);

        const system = this.parseSystemSection(sections['SYSTEM'] || '');
        const runtimes = this.parseRuntimesSection(sections['RUNTIMES'] || '');
        const services = this.parseServicesSection(sections['SERVICES'] || '');

        return {
            system,
            runtimes,
            services,
            scannedAt: new Date().toISOString(),
        };
    }

    private static splitSections(raw: string): Record<string, string> {
        const result: Record<string, string> = {};
        let currentSection = '';
        const lines = raw.split('\n');

        for (const line of lines) {
            const match = line.match(/^###SECTION:(.+)###$/);
            if (match) {
                currentSection = match[1];
                result[currentSection] = '';
            } else if (currentSection && currentSection !== 'END') {
                result[currentSection] = (result[currentSection] || '') + line + '\n';
            }
        }

        return result;
    }

    private static parseSystemSection(section: string): SystemInfo {
        const kv = this.parseKeyValue(section);
        return {
            os: kv['OS'] || 'Unknown',
            osVersion: kv['OS_VERSION'] || 'Unknown',
            kernel: kv['KERNEL'] || 'Unknown',
            architecture: kv['ARCH'] || 'Unknown',
            cpuModel: kv['CPU_MODEL'] || 'Unknown',
            cpuCores: parseInt(kv['CPU_CORES'] || '1', 10) || 1,
            ramTotalMb: parseInt(kv['RAM_TOTAL_MB'] || '0', 10) || 0,
            ramFreeMb: parseInt(kv['RAM_FREE_MB'] || '0', 10) || 0,
            diskTotal: kv['DISK_TOTAL'] || 'Unknown',
            diskFree: kv['DISK_FREE'] || 'Unknown',
            diskPercent: kv['DISK_PERCENT'] || 'Unknown',
            uptimeSeconds: parseInt(kv['UPTIME_SECONDS'] || '0', 10) || 0,
        };
    }

    private static parseRuntimesSection(section: string): InstalledRuntime[] {
        const kv = this.parseKeyValue(section);
        const runtimeOrder: RuntimeName[] = [
            'nodejs', 'npm', 'pnpm', 'yarn', 'bun',
            'python', 'java', 'php', 'go', 'ruby',
            'docker', 'docker-compose', 'redis', 'postgresql', 'mysql', 'nginx',
        ];

        return runtimeOrder.map((name) => {
            const raw = kv[name] || 'NOT_FOUND';
            if (raw === 'NOT_FOUND' || raw === '') {
                return { name, version: null, installed: false };
            }
            // Extract version number from CLI output strings like:
            // "v20.11.1", "Python 3.12.0", "go version go1.22.0 linux/amd64", etc.
            const version = this.cleanVersion(name, raw);
            return { name, version, installed: true };
        });
    }

    private static parseServicesSection(section: string): ServiceStatus {
        const kv = this.parseKeyValue(section);
        const toStatus = (val?: string): 'running' | 'stopped' | 'not_installed' => {
            if (val === 'running') return 'running';
            if (val === 'stopped') return 'stopped';
            return 'not_installed';
        };
        return {
            docker: toStatus(kv['docker']),
            nginx: toStatus(kv['nginx']),
            redis: toStatus(kv['redis']),
            postgresql: toStatus(kv['postgresql']),
            mysql: toStatus(kv['mysql']),
        };
    }

    private static parseKeyValue(section: string): Record<string, string> {
        const result: Record<string, string> = {};
        for (const line of section.split('\n')) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;
            const key = line.slice(0, eq).trim();
            const val = line.slice(eq + 1).trim();
            if (key) result[key] = val;
        }
        return result;
    }

    private static cleanVersion(name: RuntimeName, raw: string): string {
        // Remove leading 'v' from version strings
        const stripped = raw.trim().replace(/^v/, '');

        switch (name) {
            case 'python':
                // "Python 3.12.0" → "3.12.0"
                return stripped.replace(/^python\s*/i, '');
            case 'java':
                // 'openjdk version "21.0.1" ...' or 'java version "17.0.6" ...'
                {
                    const m = stripped.match(/"([^"]+)"/);
                    return m ? m[1] : stripped;
                }
            case 'go':
                // "go version go1.22.0 linux/amd64" → "1.22.0"
                {
                    const m = stripped.match(/go([\d.]+)/);
                    return m ? m[1] : stripped;
                }
            case 'ruby':
                // "ruby 3.3.0 (2023-12-25 revision ...) [x86_64-linux]" → "3.3.0"
                {
                    const m = stripped.match(/ruby\s+([\d.]+)/i);
                    return m ? m[1] : stripped;
                }
            case 'php':
                // "PHP 8.3.0 (cli) ..." → "8.3.0"
                {
                    const m = stripped.match(/PHP\s+([\d.]+)/i);
                    return m ? m[1] : stripped;
                }
            case 'docker':
                // "Docker version 28.0.0, build ..." → "28.0.0"
                {
                    const m = stripped.match(/Docker version\s+([\d.]+)/i);
                    return m ? m[1] : stripped;
                }
            case 'docker-compose':
                // "Docker Compose version v2.27.0" → "2.27.0"
                {
                    const m = stripped.match(/version\s+v?([\d.]+)/i);
                    return m ? m[1] : stripped;
                }
            case 'redis':
                // "Redis server v=7.2.4 sha=00000000..." → "7.2.4"
                {
                    const m = stripped.match(/v=([\d.]+)/);
                    return m ? m[1] : stripped;
                }
            case 'nginx':
                // "nginx version: nginx/1.26.0" → "1.26.0"
                {
                    const m = stripped.match(/nginx\/([\d.]+)/i);
                    return m ? m[1] : stripped;
                }
            case 'nodejs':
                // Already stripped 'v' prefix — "20.11.1"
                {
                    const m = stripped.match(/([\d.]+)/);
                    return m ? m[1] : stripped;
                }
            default:
                // For npm, pnpm, yarn, bun, postgresql, mysql — extract first version-looking number
                {
                    const m = stripped.match(/([\d]+\.[\d.]+)/);
                    return m ? m[1] : stripped;
                }
        }
    }
}
