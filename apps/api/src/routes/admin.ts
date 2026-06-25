import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '@deployforge/database';
import { z } from 'zod';
import crypto from 'crypto';
import { PasswordService, TokenService } from '@deployforge/security';
import { config } from '../config/env';
import { DeploymentService } from '../services/deployment.service';
import { GitHubService } from '../services/github.service';
import { CacheService } from '../services/cache.service';
import { AdminService } from '../services/admin.service';
import { apiError, cookie } from '../utils/http';
import { BackupService } from '../services/backup.service';

const restoreBackupSchema = z.object({
    filename: z.string().min(1),
});

const pruneBackupSchema = z.object({
    retentionCount: z.coerce.number().int().min(1).max(100).default(7),
});

const adminTokenService = new TokenService(config.auth.adminJwtSecret);

const adminLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const createAdminSchema = z.object({
    adminSecret: z.string().min(1).optional(),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['ADMIN', 'MODERATOR']),
    name: z.string().min(1),
});

const userQuerySchema = z.object({
    search: z.string().optional(),
    status: z.string().optional(),
});

const deploymentQuerySchema = z.object({
    status: z.string().optional(),
    userId: z.string().optional(),
});

const logQuerySchema = z.object({
    userId: z.string().optional(),
    service: z.string().optional(),
    severity: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
});

const idParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid ID format' }),
});

const userIdParamsSchema = z.object({
    userId: z.string().uuid({ message: 'Invalid User ID format' }),
});

function hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function error(reply: any, statusCode: number, message: string, errorCode: string) {
    return apiError(reply, statusCode, errorCode as any, message);
}

function adminAccessCookie(token: string, maxAge: number) {
    return cookie('adminAccessToken', token, maxAge, { httpOnly: true });
}

function canManagePlatform(role: string) {
    return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

async function audit(request: FastifyRequest, action: string, data: { targetUserId?: string; targetRole?: string; targetType?: string; targetId?: string } = {}) {
    if (!request.admin?.id) return;
    await prisma.adminActivity.create({
        data: {
            adminId: request.admin.id,
            action,
            targetUserId: data.targetUserId,
            targetRole: data.targetRole,
            targetType: data.targetType,
            targetId: data.targetId,
            ipAddress: request.ip,
        },
    });
}

async function auditAdminLoginEvent(admin: { id: string; role: string } | null, action: string, ipAddress?: string) {
    if (!admin) return;

    await prisma.adminActivity.create({
        data: {
            adminId: admin.id,
            action,
            targetUserId: admin.id,
            targetRole: admin.role,
            targetType: 'ADMIN_USER',
            targetId: admin.id,
            ipAddress,
        },
    });
}

export default async function adminRoutes(fastify: FastifyInstance) {
    fastify.post('/login', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { email, password } = adminLoginSchema.parse(request.body);

        const lockoutKey = `admin_lockout:${email}`;
        const isLocked = await CacheService.get<boolean>(lockoutKey);
        if (isLocked) {
            const admin = await prisma.adminUser.findUnique({ where: { email } });
            await auditAdminLoginEvent(admin, 'ADMIN_LOCKOUT_ATTEMPT', request.ip);
            return error(reply, 429, 'Too many login attempts. Account is temporarily locked.', 'LOCKOUT_ACTIVE');
        }

        const admin = await prisma.adminUser.findUnique({ where: { email } });

        const handleFailedAttempt = async () => {
            const failKey = `admin_fail_count:${email}`;
            const currentFailures = (await CacheService.get<number>(failKey)) || 0;
            const nextFailures = currentFailures + 1;

            await auditAdminLoginEvent(admin, 'ADMIN_LOGIN_FAILURE', request.ip);

            if (nextFailures >= config.security.adminMaxAttempts) {
                await CacheService.set(lockoutKey, true, config.security.adminLockoutTime);
                await CacheService.del(failKey);
                await auditAdminLoginEvent(admin, 'ADMIN_LOCKOUT', request.ip);
            } else {
                await CacheService.set(failKey, nextFailures, 900);
            }
        };

        if (!admin || !['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(admin.role)) {
            await handleFailedAttempt();
            return error(reply, 401, 'Invalid admin credentials', 'INVALID_CREDENTIALS');
        }

        const valid = await PasswordService.verify(admin.passwordHash, password);
        if (!valid) {
            await handleFailedAttempt();
            return error(reply, 401, 'Invalid admin credentials', 'INVALID_CREDENTIALS');
        }

        const failKey = `admin_fail_count:${email}`;
        await CacheService.del(failKey);

        const session = await prisma.adminSession.create({
            data: {
                adminId: admin.id,
                tokenHash: crypto.randomBytes(32).toString('hex'),
                userAgent: request.headers['user-agent'],
                ipAddress: request.ip,
                expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
            },
        });

        const adminAccessToken = adminTokenService.generateAccessToken({
            adminId: admin.id,
            sessionId: session.id,
            tokenType: 'admin',
            role: admin.role,
        });

        await prisma.adminSession.update({
            where: { id: session.id },
            data: { tokenHash: hashToken(adminAccessToken) },
        });
        await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
        await prisma.adminActivity.create({
            data: {
                adminId: admin.id,
                action: 'ADMIN_LOGIN',
                targetUserId: admin.id,
                targetRole: admin.role,
                targetType: 'ADMIN_USER',
                targetId: admin.id,
                ipAddress: request.ip,
            },
        });
        reply.header('Set-Cookie', adminAccessCookie(adminAccessToken, 8 * 60 * 60));

        return {
            success: true,
            data: {
                admin: { id: admin.id, email: admin.email, role: admin.role },
            },
        };
    });

    fastify.post('/logout', { preHandler: [(fastify as any).requireModerator] }, async (request, reply) => {
        if (request.adminSessionId) {
            await prisma.adminSession.update({ where: { id: request.adminSessionId }, data: { revokedAt: new Date() } });
        }
        await audit(request, 'ADMIN_LOGOUT', { targetUserId: request.admin?.id, targetRole: request.admin?.role, targetType: 'ADMIN_USER', targetId: request.admin?.id });
        reply.header('Set-Cookie', adminAccessCookie('', 0));
        return { success: true, data: { message: 'Admin logged out' } };
    });

    fastify.get('/me', { preHandler: [(fastify as any).requireModerator] }, async (request) => {
        return { success: true, data: request.admin };
    });

    fastify.post('/create-user', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const data = createAdminSchema.parse(request.body);
        if (data.adminSecret && data.adminSecret !== config.auth.adminSecret) {
            return error(reply, 403, 'Invalid admin secret', 'INVALID_ADMIN_SECRET');
        }

        PasswordService.assertStrong(data.password);
        const passwordHash = await PasswordService.hash(data.password);
        const admin = await prisma.adminUser.create({
            data: {
                email: data.email,
                name: data.name,
                passwordHash,
                role: data.role,
                createdById: request.admin.id,
            },
            select: { id: true, email: true, name: true, role: true, createdById: true, createdAt: true },
        });
        await audit(request, data.role === 'ADMIN' ? 'CREATE_ADMIN' : 'CREATE_MODERATOR', { targetUserId: admin.id, targetRole: admin.role, targetType: 'ADMIN_USER', targetId: admin.id });
        return { success: true, data: admin };
    });

    fastify.get('/users', { preHandler: [(fastify as any).requireModerator] }, async () => {
        const admins = await prisma.adminUser.findMany({
            select: { id: true, email: true, name: true, role: true, createdById: true, lastLoginAt: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: admins };
    });

    fastify.patch('/users/:id/role', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        const { role } = z.object({ role: z.enum(['ADMIN', 'MODERATOR', 'USER']) }).parse(request.body);

        // 1. Try to find the user in the AdminUser table
        const adminUser = await prisma.adminUser.findUnique({ where: { id } });
        if (adminUser) {
            if (adminUser.role === 'SUPER_ADMIN') {
                return error(reply, 400, 'You cannot modify or demote the Super Admin account', 'INSUFFICIENT_ROLE');
            }

            if (role === 'USER') {
                // Demote ADMIN/MODERATOR -> USER
                // Ensure they have a record in the User table
                let userRecord = await prisma.user.findUnique({ where: { email: adminUser.email } });
                if (!userRecord) {
                    userRecord = await prisma.user.create({
                        data: {
                            email: adminUser.email,
                            name: adminUser.name,
                            passwordHash: adminUser.passwordHash,
                            role: 'USER',
                            isVerified: true,
                        }
                    });
                } else {
                    await prisma.user.update({
                        where: { id: userRecord.id },
                        data: { role: 'USER' }
                    });
                }

                // Delete admin-specific records
                await prisma.adminSession.deleteMany({ where: { adminId: id } });
                await prisma.adminActivity.deleteMany({ where: { adminId: id } });
                await prisma.adminUser.delete({ where: { id } });

                await audit(request, 'DEMOTE_ADMIN_TO_USER', { targetUserId: userRecord.id, targetRole: 'USER', targetType: 'USER', targetId: userRecord.id });
                return { success: true, data: { id: userRecord.id, email: userRecord.email, role: 'USER' } };
            } else {
                // Update role in AdminUser table
                const updatedAdmin = await prisma.adminUser.update({
                    where: { id },
                    data: { role },
                    select: { id: true, email: true, role: true, name: true, updatedAt: true }
                });

                // Also update User table role if they exist there
                const userRecord = await prisma.user.findUnique({ where: { email: adminUser.email } });
                if (userRecord) {
                    await prisma.user.update({
                        where: { id: userRecord.id },
                        data: { role }
                    });
                }

                await audit(request, 'UPDATE_ADMIN_ROLE', { targetUserId: id, targetRole: role, targetType: 'ADMIN_USER', targetId: id });
                return { success: true, data: updatedAdmin };
            }
        }

        // 2. Try to find the user in the regular User table
        const regularUser = await prisma.user.findUnique({ where: { id } });
        if (regularUser) {
            if (role === 'USER') {
                return { success: true, data: { id: regularUser.id, email: regularUser.email, role: 'USER' } };
            }

            if (!regularUser.email) {
                return error(reply, 400, 'User email is required to promote to administrator', 'INVALID_INPUT');
            }

            const email = regularUser.email;

            // Promote USER -> ADMIN/MODERATOR
            let adminRecord = await prisma.adminUser.findUnique({ where: { email } });
            if (!adminRecord) {
                const passwordHash = regularUser.passwordHash || await PasswordService.hash(crypto.randomBytes(16).toString('hex'));
                adminRecord = await prisma.adminUser.create({
                    data: {
                        email,
                        name: regularUser.name,
                        passwordHash,
                        role,
                        createdById: request.admin.id,
                    }
                });
            } else {
                await prisma.adminUser.update({
                    where: { id: adminRecord.id },
                    data: { role }
                });
            }

            // Update role in User table
            await prisma.user.update({
                where: { id },
                data: { role }
            });

            await audit(request, 'PROMOTE_USER_TO_ADMIN', { targetUserId: regularUser.id, targetRole: role, targetType: 'ADMIN_USER', targetId: adminRecord.id });
            return { success: true, data: { id: adminRecord.id, email: adminRecord.email, role } };
        }

        return error(reply, 404, 'User not found', 'NOT_FOUND');
    });

    fastify.delete('/users/:id', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        if (id === request.admin.id) return error(reply, 400, 'You cannot delete your own super admin account', 'INSUFFICIENT_ROLE');

        const adminUser = await prisma.adminUser.findUnique({ where: { id } });
        if (!adminUser) return error(reply, 404, 'Admin user not found', 'NOT_FOUND');
        if (adminUser.role === 'SUPER_ADMIN') return error(reply, 400, 'You cannot delete the Super Admin account', 'INSUFFICIENT_ROLE');

        await prisma.adminActivity.deleteMany({ where: { adminId: id } });
        await prisma.adminSession.deleteMany({ where: { adminId: id } });
        await prisma.adminUser.delete({ where: { id } });
        await audit(request, adminUser.role === 'ADMIN' ? 'DELETE_ADMIN' : 'DELETE_MODERATOR', { targetUserId: id, targetType: 'ADMIN_USER', targetId: id });
        return { success: true, data: { message: 'Admin user deleted' } };
    });

    fastify.get('/overview', { preHandler: [(fastify as any).requireModerator] }, async () => {
        const [
            totalUsers,
            totalAdmins,
            totalModerators,
            activeUsers,
            suspendedUsers,
            disabledUsers,
            recentRegistrations,
            totalDeployments,
            activeDeployments,
            totalVps,
            connectedGitHubAccounts,
            totalRepositories,
            recentActivities,
            latestHealth,
            deploymentJobs
        ] = await Promise.all([
            prisma.user.count(),
            prisma.adminUser.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }),
            prisma.adminUser.count({ where: { role: 'MODERATOR' } }),
            prisma.user.count({ where: { status: 'ACTIVE' } }),
            prisma.user.count({ where: { status: 'SUSPENDED' } }),
            prisma.user.count({ where: { status: 'DISABLED' } }),
            prisma.user.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, email: true, name: true, createdAt: true, status: true } }),
            prisma.deployment.count(),
            prisma.deployment.count({ where: { status: { in: ['RUNNING', 'BUILDING', 'PENDING'] } } }),
            prisma.vPS.count(),
            prisma.gitHubAccount.count(),
            prisma.repository.count(),
            prisma.adminActivity.findMany({ take: 12, orderBy: { timestamp: 'desc' }, include: { admin: { select: { id: true, email: true, role: true } } } }),
            prisma.vPSHealth.findMany({ take: 100, orderBy: { checkedAt: 'desc' } }),
            prisma.deploymentJob.findMany({ take: 100, orderBy: { createdAt: 'desc' } }),
        ]);
        const avg = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
        const successJobs = deploymentJobs.filter((job) => job.status === 'SUCCESS').length;
        return {
            success: true,
            data: {
                totals: {
                    totalUsers,
                    totalAdmins,
                    totalModerators,
                    activeUsers,
                    suspendedUsers,
                    disabledUsers,
                    totalDeployments,
                    activeDeployments,
                    totalVps,
                    connectedGitHubAccounts,
                    totalRepositories
                },
                recentRegistrations,
                resources: { cpuUsage: avg(latestHealth.map((item) => item.cpuUsage)), memoryUsage: avg(latestHealth.map((item) => item.memoryUsage)), diskUsage: avg(latestHealth.map((item) => item.diskUsage)) },
                queue: { recentJobs: deploymentJobs.length, failedJobs: deploymentJobs.filter((job) => job.status === 'FAILED').length, successRate: deploymentJobs.length ? Math.round((successJobs / deploymentJobs.length) * 100) : 0 },
                recentActivities,
            },
        };
    });

    fastify.get('/platform-users', { preHandler: [(fastify as any).requireModerator] }, async (request) => {
        const query = userQuerySchema.parse(request.query);
        const users = await prisma.user.findMany({
            where: {
                ...(query.search ? { OR: [{ email: { contains: query.search, mode: 'insensitive' } }, { name: { contains: query.search, mode: 'insensitive' } }] } : {}),
                ...(query.status ? { status: query.status as any } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { deployments: true, vps: true, projects: true } }, githubAccount: { select: { id: true, username: true, connectedAt: true } } },
        });
        return { success: true, data: users };
    });

    fastify.get('/platform-users/:id', { preHandler: [(fastify as any).requireModerator] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        const user = await prisma.user.findUnique({
            where: { id },
            include: {
                deployments: { include: { project: true, vps: true }, orderBy: { createdAt: 'desc' } },
                vps: { include: { healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } } }, orderBy: { createdAt: 'desc' } },
                githubAccount: { include: { repositories: { orderBy: { updatedAt: 'desc' } } } },
                sessions: { select: { id: true, userAgent: true, ipAddress: true, expiresAt: true, createdAt: true } },
            },
        });
        if (!user) return error(reply, 404, 'User not found', 'NOT_FOUND');
        return { success: true, data: user };
    });

    fastify.patch('/platform-users/:id/status', { preHandler: [(fastify as any).requireModerator] }, async (request, reply) => {
        if (!canManagePlatform(request.admin.role)) return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { id } = idParamsSchema.parse(request.params);
        const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).parse(request.body);
        const user = await prisma.user.update({ where: { id }, data: { status: status as any } });
        if (status === 'SUSPENDED') {
            await CacheService.clearPattern(`user-session:${id}:*`);
        }
        await audit(request, status === 'SUSPENDED' ? 'SUSPEND_PLATFORM_USER' : 'ACTIVATE_PLATFORM_USER', { targetUserId: id, targetType: 'USER', targetId: id });
        return { success: true, data: user };
    });

    fastify.delete('/platform-users/:id', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request) => {
        const { id } = idParamsSchema.parse(request.params);
        await AdminService.deleteUserCascade(id);
        await audit(request, 'DELETE_PLATFORM_USER', { targetUserId: id, targetType: 'USER', targetId: id });
        return { success: true, data: { message: 'User deleted' } };
    });

    fastify.get('/deployments', { preHandler: [(fastify as any).requireModerator] }, async (request) => {
        const query = deploymentQuerySchema.parse(request.query);
        const deployments = await prisma.deployment.findMany({
            where: { ...(query.status ? { status: query.status as any } : {}), ...(query.userId ? { userId: query.userId } : {}) },
            include: { user: { select: { id: true, email: true, name: true } }, project: true, vps: true, deploymentLogs: { take: 3, orderBy: { createdAt: 'desc' } }, history: { take: 3, orderBy: { createdAt: 'desc' } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: deployments };
    });

    fastify.get('/deployments/:id/logs', { preHandler: [(fastify as any).requireModerator] }, async (request) => {
        const { id } = idParamsSchema.parse(request.params);
        const logs = await prisma.deploymentLog.findMany({ where: { deploymentId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
        return { success: true, data: logs };
    });

    fastify.get('/deployments/:id/history', { preHandler: [(fastify as any).requireModerator] }, async (request) => {
        const { id } = idParamsSchema.parse(request.params);
        const history = await prisma.deploymentHistory.findMany({ where: { deploymentId: id }, orderBy: { createdAt: 'desc' } });
        return { success: true, data: history };
    });

    fastify.post('/deployments/:id/stop', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        const deployment = await prisma.deployment.findUnique({ where: { id }, select: { userId: true } });
        if (!deployment) return error(reply, 404, 'Deployment not found', 'NOT_FOUND');
        await DeploymentService.stopDeployment(deployment.userId, id);
        await audit(request, 'STOP_DEPLOYMENT', { targetType: 'DEPLOYMENT', targetId: id });
        return { success: true, data: { message: 'Deployment stopped' } };
    });

    fastify.post('/deployments/:id/restart', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        const deployment = await prisma.deployment.findUnique({ where: { id }, select: { userId: true } });
        if (!deployment) return error(reply, 404, 'Deployment not found', 'NOT_FOUND');
        await DeploymentService.startDeployment(deployment.userId, id);
        await audit(request, 'RESTART_DEPLOYMENT', { targetType: 'DEPLOYMENT', targetId: id });
        return { success: true, data: { message: 'Deployment restarted' } };
    });

    fastify.delete('/deployments/:id', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        await AdminService.deleteDeploymentCascade(id);
        await audit(request, 'DELETE_DEPLOYMENT', { targetType: 'DEPLOYMENT', targetId: id });
        return { success: true, data: { message: 'Deployment deleted' } };
    });

    fastify.get('/vps', { preHandler: [(fastify as any).requireModerator] }, async () => {
        const servers = await prisma.vPS.findMany({
            include: { user: { select: { id: true, email: true, name: true } }, healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } }, systemMetrics: { take: 1, orderBy: { timestamp: 'desc' } }, _count: { select: { deployments: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: servers };
    });

    fastify.delete('/vps/:id', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { id } = idParamsSchema.parse(request.params);
        await AdminService.deleteVpsCascade(id);
        await audit(request, 'DELETE_VPS', { targetType: 'VPS', targetId: id });
        return { success: true, data: { message: 'VPS removed' } };
    });

    fastify.get('/github/accounts', { preHandler: [(fastify as any).requireModerator] }, async () => {
        const accounts = await prisma.gitHubAccount.findMany({ include: { user: { select: { id: true, email: true, name: true } }, repositories: { orderBy: { updatedAt: 'desc' } } }, orderBy: { connectedAt: 'desc' } });
        return { success: true, data: accounts };
    });

    fastify.post('/github/accounts/:userId/sync', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { userId } = userIdParamsSchema.parse(request.params);
        const repos = await GitHubService.syncRepos(userId);
        await audit(request, 'FORCE_REPOSITORY_SYNC', { targetUserId: userId, targetType: 'GITHUB_ACCOUNT', targetId: userId });
        return { success: true, data: { count: repos.length } };
    });

    fastify.delete('/github/accounts/:userId', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { userId } = userIdParamsSchema.parse(request.params);
        const account = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!account) return error(reply, 404, 'GitHub account not found', 'NOT_FOUND');
        await prisma.repository.deleteMany({ where: { githubAccountId: account.id } });
        await prisma.gitHubAccount.delete({ where: { userId } });
        await audit(request, 'REMOVE_GITHUB_CONNECTION', { targetUserId: userId, targetType: 'GITHUB_ACCOUNT', targetId: userId });
        return { success: true, data: { message: 'GitHub connection removed' } };
    });

    fastify.get('/monitoring', { preHandler: [(fastify as any).requireModerator] }, async () => {
        const [health, metrics, deployments, jobs] = await Promise.all([
            prisma.vPSHealth.findMany({ take: 100, orderBy: { checkedAt: 'desc' } }),
            prisma.systemMetrics.findMany({ take: 100, orderBy: { timestamp: 'desc' } }),
            prisma.deployment.findMany({ select: { status: true } }),
            prisma.deploymentJob.findMany({ take: 200, orderBy: { createdAt: 'desc' } }),
        ]);
        const avg = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
        const failedDeployments = deployments.filter((deployment) => deployment.status === 'FAILED').length;
        const successfulJobs = jobs.filter((job) => job.status === 'SUCCESS').length;
        return {
            success: true,
            data: {
                cpuUsage: avg(health.map((item) => item.cpuUsage)),
                memoryUsage: avg(health.map((item) => item.memoryUsage)),
                diskUsage: avg(health.map((item) => item.diskUsage)),
                activeContainers: metrics.reduce((sum, item) => sum + item.activeContainers, 0),
                queueStatus: { queued: jobs.filter((job) => job.status === 'QUEUED').length, running: jobs.filter((job) => job.status === 'RUNNING').length, failed: jobs.filter((job) => job.status === 'FAILED').length },
                deploymentSuccessRate: deployments.length ? Math.round(((deployments.length - failedDeployments) / deployments.length) * 100) : 0,
                jobSuccessRate: jobs.length ? Math.round((successfulJobs / jobs.length) * 100) : 0,
                systemUptime: process.uptime(),
                errorRate: jobs.length ? Math.round((jobs.filter((job) => job.status === 'FAILED').length / jobs.length) * 100) : 0,
            },
        };
    });

    fastify.get('/logs', { preHandler: [(fastify as any).requireModerator] }, async (request) => {
        const query = logQuerySchema.parse(request.query);
        const createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
        const [deploymentLogs, webhookLogs, adminLogs] = await Promise.all([
            prisma.deploymentLog.findMany({ where: { ...(query.severity ? { level: query.severity } : {}), ...(Object.keys(createdAt).length ? { createdAt } : {}), ...(query.userId ? { deployment: { userId: query.userId } } : {}), ...(query.service && query.service !== 'deployment' ? { id: '__never__' } : {}) }, include: { deployment: { include: { user: { select: { id: true, email: true, name: true } }, project: true } } }, take: 100, orderBy: { createdAt: 'desc' } }),
            prisma.webhookEvent.findMany({ where: { ...(Object.keys(createdAt).length ? { createdAt } : {}), ...(query.service && query.service !== 'webhook' ? { id: '__never__' } : {}) }, take: 100, orderBy: { createdAt: 'desc' } }),
            prisma.adminActivity.findMany({ where: { ...(Object.keys(createdAt).length ? { timestamp: createdAt } : {}), ...(query.userId ? { adminId: query.userId } : {}), ...(query.service && query.service !== 'admin' ? { id: '__never__' } : {}) }, include: { admin: { select: { id: true, email: true, role: true } } }, take: 100, orderBy: { timestamp: 'desc' } }),
        ]);
        return {
            success: true,
            data: [
                ...deploymentLogs.map((log) => ({ id: log.id, service: 'deployment', severity: log.level, message: log.message, user: log.deployment.user, createdAt: log.createdAt })),
                ...webhookLogs.map((log) => ({ id: log.id, service: 'webhook', severity: log.status === 'FAILED' ? 'error' : 'info', message: `${log.event} for repo ${log.repoId}`, user: null, createdAt: log.createdAt })),
                ...adminLogs.map((log) => ({ id: log.id, service: 'admin', severity: 'info', message: `${log.action} ${log.targetType || ''}`, user: log.admin, createdAt: log.timestamp })),
            ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 200),
        };
    });

    fastify.get('/settings', { preHandler: [(fastify as any).requireModerator] }, async () => {
        return {
            success: true,
            data: {
                smtp: { host: config.email.smtp.host, port: config.email.smtp.port, secure: config.email.smtp.secure, userConfigured: Boolean(config.email.smtp.user) },
                github: { clientIdConfigured: Boolean(config.oauth.github.clientId), clientSecretConfigured: Boolean(config.oauth.github.clientSecret), callbackUrl: config.oauth.github.callbackUrl },
                google: { enabled: config.oauth.google.enabled, clientIdConfigured: Boolean(config.oauth.google.clientId), clientSecretConfigured: Boolean(config.oauth.google.clientSecret), callbackUrl: config.oauth.google.callbackUrl },
                queue: { redisConfigured: Boolean(config.redis.url), maxAttempts: 3 },
                security: { jwtConfigured: Boolean(config.auth.jwtSecret), adminJwtConfigured: Boolean(config.auth.adminJwtSecret), adminSecretConfigured: Boolean(config.auth.adminSecret), encryptionConfigured: Boolean(config.encryption.key) },
                app: { appUrl: config.app.appUrl, nodeEnv: config.app.env },
            },
        };
    });

    fastify.get('/backups', { preHandler: [(fastify as any).requireModerator] }, async () => {
        const backups = await BackupService.listBackups();
        return { success: true, data: backups };
    });

    fastify.post('/backups/create', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request) => {
        const dbBackup = await BackupService.backupDatabase(request.admin.id, request.ip, request.headers['user-agent']);
        const configBackup = await BackupService.backupConfiguration(request.admin.id, request.ip, request.headers['user-agent']);
        await BackupService.pruneOldBackups(7);
        await audit(request, 'CREATE_SYSTEM_BACKUP', { targetType: 'SYSTEM', targetId: dbBackup.filename });
        return {
            success: true,
            data: {
                dbBackup: { filename: dbBackup.filename, sizeBytes: dbBackup.sizeBytes },
                configBackup: { filename: configBackup.filename, sizeBytes: configBackup.sizeBytes },
            }
        };
    });

    fastify.post('/backups/restore', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const { filename } = restoreBackupSchema.parse(request.body);
        if (!filename.startsWith('db-backup-') || !filename.endsWith('.dump')) {
            return error(reply, 400, 'Invalid backup filename for restore. Must be a database dump file.', 'INVALID_BACKUP_FILE');
        }
        await BackupService.restoreDatabase(filename, request.admin.id, request.ip, request.headers['user-agent']);
        await audit(request, 'RESTORE_SYSTEM_BACKUP', { targetType: 'SYSTEM', targetId: filename });
        return { success: true, data: { message: `Database successfully restored from ${filename}` } };
    });

    fastify.post('/backups/prune', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request) => {
        const { retentionCount } = pruneBackupSchema.parse(request.body);
        const pruned = await BackupService.pruneOldBackups(retentionCount);
        await audit(request, 'PRUNE_SYSTEM_BACKUPS', { targetType: 'SYSTEM', targetId: `retention-${retentionCount}` });
        return { success: true, data: { prunedCount: pruned.length, prunedFiles: pruned } };
    });
}
