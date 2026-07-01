import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { SSHConnectionError, SSHService } from '@deployforge/vps';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { AlertService } from './alert.service';

const encryptionService = new EncryptionService(config.encryption.key);

export type VpsAuthType = 'password' | 'key';

export type VpsConnectionInput = {
    ipAddress: string;
    port: number;
    username: string;
    authType: VpsAuthType;
    password?: string;
    privateKey?: string;
};

export type AddVpsInput = VpsConnectionInput & {
    name: string;
};

export type UpdateVpsInput = Partial<AddVpsInput>;

export type VpsConnectionTestResult =
    | {
        success: true;
        message: string;
        readiness: {
            shell: boolean;
            os: string;
            dockerInstalled: boolean;
            nginxInstalled: boolean;
        };
    }
    | {
        success: false;
        message: string;
        errorCode: string;
    };

export class VPSConnectionFailure extends Error {
    errorCode: string;
    statusCode = 400;

    constructor(message: string, errorCode = 'SSH_CONNECTION_FAILED') {
        super(message);
        this.name = 'VPSConnectionFailure';
        this.errorCode = errorCode;
    }
}

export class VPSService {
    static async validateAndAdd(userId: string, data: AddVpsInput) {
        const authType = normalizeAuthType(data.authType);
        const test = await this.testConnection({ ...data, authType });
        if (!test.success) {
            throw new VPSConnectionFailure(test.message, test.errorCode);
        }

        const vps = await prisma.vPS.create({
            data: {
                userId,
                name: data.name.trim(),
                ipAddress: data.ipAddress.trim(),
                port: data.port || 22,
                username: data.username.trim(),
                authType,
                encryptedPassword: authType === 'password' && data.password ? this.encrypt(data.password) : null,
                encryptedPrivateKey: authType === 'key' && data.privateKey ? this.encrypt(data.privateKey) : null,
                status: 'active',
                lastCheckedAt: new Date(),
            },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
        });

        await this.performHealthCheck(vps.id).catch((error) => {
            logger.warn({ vpsId: vps.id, err: error }, 'Initial VPS health check failed');
        });

        return this.sanitize(vps);
    }

    static async testConnection(data: VpsConnectionInput): Promise<VpsConnectionTestResult> {
        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: data.ipAddress,
                port: data.port || 22,
                username: data.username,
                ...buildPlainAuth(data),
            });

            const shell = await ssh.execute('printf "deployforge-ready" && command -v sh >/dev/null');
            if (shell.code !== 0 || !shell.stdout.includes('deployforge-ready')) {
                return {
                    success: false,
                    message: 'SSH connected, but the server could not run basic shell commands',
                    errorCode: 'SSH_COMMAND_FAILED',
                };
            }

            const [os, docker, nginx] = await Promise.all([
                ssh.execute('uname -a'),
                ssh.execute('docker --version'),
                ssh.execute('nginx -v'),
            ]);

            return {
                success: true,
                message: 'Connection successful',
                readiness: {
                    shell: true,
                    os: os.stdout.trim(),
                    dockerInstalled: docker.code === 0,
                    nginxInstalled: nginx.code === 0,
                },
            };
        } catch (error: any) {
            return normalizeConnectionFailure(error);
        } finally {
            ssh.disconnect();
        }
    }

    static async testStoredConnection(userId: string, vpsId: string) {
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!vps) throw new VPSConnectionFailure('VPS not found', 'VPS_NOT_FOUND');

        const result = await this.testConnection({
            ipAddress: vps.ipAddress,
            port: vps.port,
            username: vps.username,
            authType: normalizeAuthType(vps.authType),
            password: vps.encryptedPassword ? this.decrypt(vps.encryptedPassword) : undefined,
            privateKey: vps.encryptedPrivateKey ? this.decrypt(vps.encryptedPrivateKey) : undefined,
        });

        if (result.success) {
            await this.performHealthCheck(vps.id).catch((error) => {
                logger.warn({ vpsId: vps.id, err: error }, 'VPS health check after connection test failed');
            });
        } else {
            await prisma.vPS.update({
                where: { id: vps.id },
                data: {
                    status: 'failed',
                    lastCheckedAt: new Date(),
                },
            });
        }

        return result;
    }

    static async list(userId: string) {
        const rows = await prisma.vPS.findMany({
            where: {
                OR: [
                    { userId },
                    {
                        deployments: {
                            some: {
                                project: {
                                    OR: [
                                        { userId },
                                        { members: { some: { userId } } }
                                    ]
                                }
                            }
                        }
                    }
                ]
            },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
            orderBy: { createdAt: 'desc' },
        });

        return rows.map((row) => this.sanitize(row));
    }

    static async get(userId: string, id: string) {
        const vps = await prisma.vPS.findFirst({
            where: {
                id,
                OR: [
                    { userId },
                    {
                        deployments: {
                            some: {
                                project: {
                                    OR: [
                                        { userId },
                                        { members: { some: { userId } } }
                                    ]
                                }
                            }
                        }
                    }
                ]
            },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
        });
        return vps ? this.sanitize(vps) : null;
    }

    static async update(userId: string, id: string, data: UpdateVpsInput) {
        const existing = await prisma.vPS.findFirst({ where: { id, userId } });
        if (!existing) return null;

        const authType = data.authType ? normalizeAuthType(data.authType) : normalizeAuthType(existing.authType);
        const nextConnection: VpsConnectionInput = {
            ipAddress: data.ipAddress ?? existing.ipAddress,
            port: data.port ?? existing.port,
            username: data.username ?? existing.username,
            authType,
            password: data.password ?? (existing.encryptedPassword ? this.decrypt(existing.encryptedPassword) : undefined),
            privateKey: data.privateKey ?? (existing.encryptedPrivateKey ? this.decrypt(existing.encryptedPrivateKey) : undefined),
        };

        const connectionFieldsChanged = Boolean(data.ipAddress || data.port || data.username || data.authType || data.password || data.privateKey);
        if (connectionFieldsChanged) {
            const test = await this.testConnection(nextConnection);
            if (!test.success) throw new VPSConnectionFailure(test.message, test.errorCode);
        }

        const updated = await prisma.vPS.update({
            where: { id: existing.id },
            data: {
                ...(data.name ? { name: data.name.trim() } : {}),
                ...(data.ipAddress ? { ipAddress: data.ipAddress.trim() } : {}),
                ...(data.port ? { port: data.port } : {}),
                ...(data.username ? { username: data.username.trim() } : {}),
                authType,
                ...(data.authType || data.password || data.privateKey
                    ? {
                        encryptedPassword: authType === 'password' && nextConnection.password ? this.encrypt(nextConnection.password) : null,
                        encryptedPrivateKey: authType === 'key' && nextConnection.privateKey ? this.encrypt(nextConnection.privateKey) : null,
                    }
                    : {}),
                ...(connectionFieldsChanged ? { status: 'active', lastCheckedAt: new Date() } : {}),
            },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
        });

        return this.sanitize(updated);
    }

    static async delete(userId: string, id: string) {
        const existing = await prisma.vPS.findFirst({
            where: { id, userId },
            include: { _count: { select: { deployments: true, domains: true } } },
        });
        if (!existing) return false;
        if (existing._count.deployments || existing._count.domains) {
            throw new VPSConnectionFailure('VPS has deployments or domains attached and cannot be deleted yet', 'VPS_IN_USE');
        }

        const sessions = await prisma.terminalSession.findMany({ where: { vpsId: id }, select: { id: true } });
        await prisma.$transaction([
            prisma.terminalCommandLog.deleteMany({ where: { sessionId: { in: sessions.map((session) => session.id) } } }),
            prisma.terminalSession.deleteMany({ where: { vpsId: id } }),
            prisma.vPSHealth.deleteMany({ where: { vpsId: id } }),
            prisma.systemMetrics.deleteMany({ where: { vpsId: id } }),
            prisma.vPS.delete({ where: { id } }),
        ]);
        return true;
    }

    static async performHealthCheck(vpsId: string) {
        const vps = await prisma.vPS.findUnique({ where: { id: vpsId } });
        if (!vps) throw new Error('VPS not found');

        const previousStatus = vps.status;

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...buildStoredAuth(vps),
            });

            const { stdout: cpu } = await ssh.execute(`top -bn1 | grep "Cpu(s)" | awk '{for(i=1;i<=NF;i++){if($i~/id/){print 100-$(i-1)}}}'`);
            const { stdout: mem } = await ssh.execute(`free | grep Mem | awk '{print $3/$2 * 100.0}'`);
            const { stdout: disk } = await ssh.execute(`df / | tail -1 | awk '{print int($5)}'`);
            const { stdout: uptime } = await ssh.execute("cat /proc/uptime | awk '{print $1}'");
            const { code: dockerCode } = await ssh.execute('docker --version');
            const { code: nginxCode } = await ssh.execute('nginx -v');

            let runningContainers: string[] = [];
            if (dockerCode === 0) {
                try {
                    const { stdout: containersOut } = await ssh.execute("docker ps --format '{{.Names}}'");
                    runningContainers = containersOut.split('\n').map(name => name.trim()).filter(Boolean);
                } catch (err) {
                    logger.warn({ vpsId, err }, 'Failed to query running Docker containers');
                }
            }

            const health = await prisma.vPSHealth.create({
                data: {
                    vpsId,
                    cpuUsage: parseFloat(cpu.trim()) || 0,
                    memoryUsage: parseFloat(mem.trim()) || 0,
                    diskUsage: parseFloat(disk.trim()) || 0,
                    uptime: Math.floor(parseFloat(uptime.trim())) || 0,
                    dockerInstalled: dockerCode === 0,
                    nginxInstalled: nginxCode === 0,
                    runningContainers,
                },
            });

            await prisma.vPS.update({
                where: { id: vpsId },
                data: { status: 'active', lastCheckedAt: new Date() },
            });

            // Alert engine: check thresholds
            const swapResult = await ssh.execute(`free | awk '/Swap:/{if($2>0) printf "%.1f", $3/$2*100; else print "0"}'`).catch(() => ({ stdout: '0' }));
            const loadResult = await ssh.execute(`cat /proc/loadavg | awk '{print $1}'`).catch(() => ({ stdout: '0' }));
            const swapUsage = parseFloat((swapResult as any).stdout?.trim()) || 0;
            const loadAvg1 = parseFloat((loadResult as any).stdout?.trim()) || 0;

            AlertService.checkThresholds(vps.userId, vpsId, vps.name, {
                cpuUsage: health.cpuUsage,
                memoryUsage: health.memoryUsage,
                diskUsage: health.diskUsage,
                swapUsage,
                loadAvg1,
            }).catch(err => logger.warn({ err, vpsId }, 'Alert threshold check failed'));

            // If server was previously offline, emit reconnected alert
            if (previousStatus === 'failed') {
                AlertService.handleServerReconnected(vps.userId, vpsId, vps.name)
                    .catch(err => logger.warn({ err, vpsId }, 'Server reconnected alert failed'));
            }

            return health;
        } catch (err) {
            await prisma.vPS.update({
                where: { id: vpsId },
                data: { status: 'failed', lastCheckedAt: new Date() },
            });

            // Alert engine: server offline
            if (previousStatus === 'active') {
                AlertService.handleServerOffline(vps.userId, vpsId, vps.name)
                    .catch(alertErr => logger.warn({ err: alertErr, vpsId }, 'Server offline alert failed'));
            }

            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    static async getServerInfo(userId: string, vpsId: string) {
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!vps) throw new VPSConnectionFailure('VPS not found', 'VPS_NOT_FOUND');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...buildStoredAuth(vps),
            });

            // Run two sequential calls — each combines related commands into
            // a single SSH channel using printf/echo and double-quote-only awk.
            // This keeps well below OpenSSH MaxSessions=10 and avoids all
            // single-quote nesting issues inside the JS string.

            const [r1, r2] = await Promise.all([
                ssh.execute(
                    'printf "HOSTNAME=%s\\n" "$(hostname 2>/dev/null)";' +
                    'printf "KERNEL=%s\\n"   "$(uname -r 2>/dev/null)";' +
                    'printf "ARCH=%s\\n"     "$(uname -m 2>/dev/null)";' +
                    'printf "NPROC=%s\\n"    "$(nproc 2>/dev/null)";' +
                    'printf "MEM_TOTAL=%s\\n" "$(awk "/MemTotal/{print \\$2}" /proc/meminfo)";' +
                    'printf "MEM_AVAIL=%s\\n" "$(awk "/MemAvailable/{print \\$2}" /proc/meminfo)";' +
                    'printf "SWAP_TOTAL=%s\\n" "$(awk "/SwapTotal/{print \\$2}" /proc/meminfo)";' +
                    'printf "SWAP_FREE=%s\\n"  "$(awk "/SwapFree/{print \\$2}" /proc/meminfo)";' +
                    'printf "UPTIME=%s\\n"     "$(awk "{print \\$1}" /proc/uptime)";' +
                    'printf "PRIVATE_IP=%s\\n" "$(hostname -I 2>/dev/null | awk "{print \\$1}")"'
                ),
                ssh.execute(
                    'printf "CPU_MODEL=%s\\n" "$(grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed "s/^ //")";' +
                    'printf "OS=%s\\n" "$(. /etc/os-release 2>/dev/null && printf "%s" "$PRETTY_NAME" || echo Linux)";' +
                    'printf "TIMEZONE=%s\\n" "$(cat /etc/timezone 2>/dev/null | head -1 || echo UTC)";' +
                    'printf "BOOT=%s\\n" "$(uptime -s 2>/dev/null || echo -)";' +
                    'df -h / 2>/dev/null | awk "NR==2{printf \\"DISK_TOTAL=%s\\\\nDISK_USED=%s\\\\nDISK_FREE=%s\\\\nDISK_PCT=%s\\\\n\\", \\$2, \\$3, \\$4, \\$5}"'
                ),
            ]);

            // Parse key=value blocks
            function parseBlock(raw: string): Record<string, string> {
                const out: Record<string, string> = {};
                for (const line of raw.split('\n')) {
                    const eq = line.indexOf('=');
                    if (eq === -1) continue;
                    const key = line.slice(0, eq).trim();
                    const val = line.slice(eq + 1).trim();
                    if (key) out[key] = val;
                }
                return out;
            }

            const b1 = parseBlock(r1.stdout);
            const b2 = parseBlock(r2.stdout);

            const hostname  = b1.HOSTNAME  || vps.ipAddress;
            const uname     = b1.KERNEL    || '';
            const architecture = b1.ARCH   || 'x86_64';
            const cpuCores  = b1.NPROC     || '1';
            const memTotal  = b1.MEM_TOTAL || '0';
            const memFree   = b1.MEM_AVAIL || '0';
            const swapTotal = b1.SWAP_TOTAL || '0';
            const swapFree  = b1.SWAP_FREE  || '0';
            const uptime    = b1.UPTIME    || '0';
            const privateIp = b1.PRIVATE_IP || vps.ipAddress;

            const cpuModel  = b2.CPU_MODEL  || 'Unknown CPU';
            const diskTotal = b2.DISK_TOTAL || 'N/A';
            const diskUsed  = b2.DISK_USED  || 'N/A';
            const diskFree  = b2.DISK_FREE  || 'N/A';
            const diskPercent = b2.DISK_PCT || '0%';
            const osName    = b2.OS         || 'Linux';
            const timezone  = b2.TIMEZONE   || 'UTC';
            const bootTime  = b2.BOOT       || '-';

            const memTotalKb = parseInt(memTotal, 10) || 0;
            const memFreeKb  = parseInt(memFree,  10) || 0;
            const memUsedKb  = memTotalKb - memFreeKb;
            const swapTotalKb = parseInt(swapTotal, 10) || 0;
            const swapFreeKb  = parseInt(swapFree,  10) || 0;
            const swapUsedKb  = swapTotalKb - swapFreeKb;
            const uptimeSec   = parseFloat(uptime) || 0;
            const days    = Math.floor(uptimeSec / 86400);
            const hours   = Math.floor((uptimeSec % 86400) / 3600);
            const minutes = Math.floor((uptimeSec % 3600) / 60);

            return {
                hostname,
                publicIp: vps.ipAddress,
                privateIp: privateIp || vps.ipAddress,
                os: osName,
                kernel: uname,
                architecture,
                cpuModel: cpuModel || 'Unknown CPU',
                cpuCores: parseInt(cpuCores, 10) || 1,
                ramTotal: memTotalKb,
                ramUsed:  memUsedKb,
                ramFree:  memFreeKb,
                swapTotal: swapTotalKb,
                swapUsed:  swapUsedKb,
                diskTotal:   diskTotal   || 'N/A',
                diskUsed:    diskUsed    || 'N/A',
                diskFree:    diskFree    || 'N/A',
                diskPercent: diskPercent || '0%',
                uptimeSeconds:  uptimeSec,
                uptimeFormatted: `${days}d ${hours}h ${minutes}m`,
                bootTime,
                timezone,
            };
        } finally {
            ssh.disconnect();
        }
    }

    static async getLiveMetrics(userId: string, vpsId: string) {
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!vps) throw new VPSConnectionFailure('VPS not found', 'VPS_NOT_FOUND');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...buildStoredAuth(vps),
            });

            const [cpuRaw, memRaw, diskRaw, loadRaw, netRaw, diskIoRaw, tempRaw] = await Promise.all([
                ssh.execute(`top -bn1 | grep 'Cpu(s)' | awk '{for(i=1;i<=NF;i++){if($i~/id/){idle=$(i-1); sub(",",".",idle); print 100-idle}}}'`).then(r => r.stdout.trim()),
                ssh.execute(`free | awk '/Mem:/{printf "%.1f %.1f %.1f", $3/$2*100, $3/1024, $2/1024}'`).then(r => r.stdout.trim()),
                ssh.execute(`df / | tail -1 | awk '{print $5}' | tr -d '%'`).then(r => r.stdout.trim()),
                ssh.execute(`cat /proc/loadavg | awk '{print $1, $2, $3}'`).then(r => r.stdout.trim()),
                ssh.execute(`cat /proc/net/dev | awk 'NR>2 && !/lo/{rx+=$2; tx+=$10} END{print rx, tx}'`).then(r => r.stdout.trim()),
                ssh.execute(`cat /proc/diskstats | awk '{if($3~/^(s|v|h|xv)d[a-z]$/ && $3!~/[0-9]$/){read+=$6; write+=$10}} END{print read, write}'`).then(r => r.stdout.trim()).catch(() => '0 0'),
                ssh.execute(`cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk '{printf "%.1f", $1/1000}' || echo ''`).then(r => r.stdout.trim()).catch(() => ''),
            ]);

            const [memPercent, memUsedMb, memTotalMb] = (memRaw || '0 0 0').split(' ').map(Number);
            const [loadAvg1, loadAvg5, loadAvg15] = (loadRaw || '0 0 0').split(' ').map(Number);
            const [netRxBytes, netTxBytes] = (netRaw || '0 0').split(' ').map(Number);
            const [diskReadSectors, diskWriteSectors] = (diskIoRaw || '0 0').split(' ').map(Number);

            return {
                cpuPercent: parseFloat(cpuRaw) || 0,
                ramPercent: parseFloat(String(memPercent)) || 0,
                ramUsedMb: memUsedMb || 0,
                ramTotalMb: memTotalMb || 0,
                diskPercent: parseFloat(diskRaw) || 0,
                diskReadKb: Math.round((diskReadSectors * 512) / 1024),
                diskWriteKb: Math.round((diskWriteSectors * 512) / 1024),
                netRxMb: parseFloat((netRxBytes / (1024 * 1024)).toFixed(2)),
                netTxMb: parseFloat((netTxBytes / (1024 * 1024)).toFixed(2)),
                loadAvg1: loadAvg1 || 0,
                loadAvg5: loadAvg5 || 0,
                loadAvg15: loadAvg15 || 0,
                temperature: tempRaw ? parseFloat(tempRaw) : null,
                collectedAt: new Date().toISOString(),
            };
        } finally {
            ssh.disconnect();
        }
    }

    static startScheduledHealthChecks() {
        
        this.runAllHealthChecks().catch(() => undefined);

        setInterval(() => {
            this.runAllHealthChecks().catch(() => undefined);
        }, 5 * 60 * 1000);
    }

    private static async runAllHealthChecks() {
        try {
            const activeVpss = await prisma.vPS.findMany({ where: { status: 'active' } });
            await Promise.allSettled(
                activeVpss.map(async (vps) => {
                    try {
                        await this.performHealthCheck(vps.id);
                    } catch (e) {
                        logger.warn({ vpsId: vps.id, err: e }, 'Scheduled health check failed');
                    }
                })
            );
        } catch (err) {
            logger.error({ err }, 'Error in runAllHealthChecks');
        }
    }

    static sanitize<T extends Record<string, any>>(vps: T) {
        const { encryptedPassword, encryptedPrivateKey, ...safe } = vps;
        return {
            ...safe,
            authType: normalizeAuthType(vps.authType),
            status: normalizeStatus(vps.status),
        };
    }

    static encrypt(text: string) {
        const encrypted = encryptionService.encrypt(text);
        return `${encrypted.iv}:${encrypted.tag}:${encrypted.content}`;
    }

    static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}

export function normalizeAuthType(authType?: string): VpsAuthType {
    return authType === 'password' ? 'password' : 'key';
}

export function isKeyAuth(authType?: string) {
    return normalizeAuthType(authType) === 'key';
}

export function buildStoredAuth(vps: { authType: string; encryptedPrivateKey?: string | null; encryptedPassword?: string | null }) {
    if (isKeyAuth(vps.authType)) {
        if (!vps.encryptedPrivateKey) throw new VPSConnectionFailure('Private key is missing for this VPS', 'MISSING_PRIVATE_KEY');
        return { privateKey: VPSService.decrypt(vps.encryptedPrivateKey) };
    }
    if (!vps.encryptedPassword) throw new VPSConnectionFailure('Password is missing for this VPS', 'MISSING_PASSWORD');
    return { password: VPSService.decrypt(vps.encryptedPassword) };
}

function buildPlainAuth(data: VpsConnectionInput) {
    if (normalizeAuthType(data.authType) === 'key') {
        if (!data.privateKey) throw new VPSConnectionFailure('Private key is required', 'MISSING_PRIVATE_KEY');
        return { privateKey: data.privateKey };
    }
    if (!data.password) throw new VPSConnectionFailure('Password is required', 'MISSING_PASSWORD');
    return { password: data.password };
}

function normalizeStatus(status?: string) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') return 'active';
    if (normalized === 'failed' || normalized === 'error') return 'failed';
    return 'inactive';
}

function normalizeConnectionFailure(error: any): VpsConnectionTestResult {
    if (error instanceof VPSConnectionFailure) {
        return { success: false, message: error.message, errorCode: error.errorCode };
    }
    if (error instanceof SSHConnectionError) {
        return { success: false, message: error.message, errorCode: error.code };
    }
    return {
        success: false,
        message: error?.message || 'SSH connection failed',
        errorCode: error?.code || 'SSH_CONNECTION_FAILED',
    };
}
