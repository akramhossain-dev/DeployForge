import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { SSHConnectionError, SSHService } from '@deployforge/vps';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const encryptionService = new EncryptionService(config.encryption.key);

export type VpsAuthType = 'password' | 'key';

export type VpsConnectionInput = {
    ipAddress: string;
    port: number;
    username: string;
    authType: VpsAuthType | 'ssh_key';
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
            where: { userId },
            include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } },
            orderBy: { createdAt: 'desc' },
        });

        return rows.map((row) => this.sanitize(row));
    }

    static async get(userId: string, id: string) {
        const vps = await prisma.vPS.findFirst({
            where: { id, userId },
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

            return health;
        } catch (err) {
            await prisma.vPS.update({
                where: { id: vpsId },
                data: { status: 'failed', lastCheckedAt: new Date() },
            });
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    static startScheduledHealthChecks() {
        // Run health check on startup for all active VPS
        this.runAllHealthChecks().catch(() => undefined);

        // Run every 5 minutes
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
