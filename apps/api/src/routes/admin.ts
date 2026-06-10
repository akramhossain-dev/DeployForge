import { FastifyInstance, FastifyRequest } from 'fastify';
import prisma from '@deployforge/database';
import { z } from 'zod';
import crypto from 'crypto';
import { PasswordService, TokenService } from '@deployforge/security';
import { config } from '../config/env';
import { DeploymentService } from '../services/deployment.service';
import { GitHubService } from '../services/github.service';

const adminTokenService = new TokenService(config.ADMIN_JWT_SECRET);

const adminLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const createAdminSchema = z.object({
    adminSecret: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(['ADMIN', 'MODERATOR']),
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

function hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function error(reply: any, statusCode: number, message: string, errorCode: string) {
    return reply.status(statusCode).send({ success: false, message, errorCode });
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

async function deleteDeploymentCascade(deploymentId: string) {
    await prisma.deploymentLog.deleteMany({ where: { deploymentId } });
    await prisma.log.deleteMany({ where: { deploymentId } });
    await prisma.deploymentJob.deleteMany({ where: { deploymentId } });
    await prisma.deploymentHistory.deleteMany({ where: { deploymentId } });
    await prisma.deploymentSandbox.deleteMany({ where: { deploymentId } });
    await prisma.domain.deleteMany({ where: { deploymentId } });
    await prisma.deployment.delete({ where: { id: deploymentId } });
}

async function deleteVpsCascade(vpsId: string) {
    const deployments = await prisma.deployment.findMany({ where: { vpsId }, select: { id: true } });
    for (const deployment of deployments) await deleteDeploymentCascade(deployment.id);
    const sessions = await prisma.terminalSession.findMany({ where: { vpsId }, select: { id: true } });
    await prisma.terminalCommandLog.deleteMany({ where: { sessionId: { in: sessions.map((session) => session.id) } } });
    await prisma.terminalSession.deleteMany({ where: { vpsId } });
    await prisma.vPSHealth.deleteMany({ where: { vpsId } });
    await prisma.systemMetrics.deleteMany({ where: { vpsId } });
    await prisma.domain.deleteMany({ where: { vpsId } });
    await prisma.vPS.delete({ where: { id: vpsId } });
}

async function deleteUserCascade(userId: string) {
    const deployments = await prisma.deployment.findMany({ where: { userId }, select: { id: true } });
    for (const deployment of deployments) await deleteDeploymentCascade(deployment.id);

    const servers = await prisma.vPS.findMany({ where: { userId }, select: { id: true } });
    for (const server of servers) await deleteVpsCascade(server.id);

    const githubAccount = await prisma.gitHubAccount.findUnique({ where: { userId }, select: { id: true } });
    if (githubAccount) {
        await prisma.repository.deleteMany({ where: { githubAccountId: githubAccount.id } });
        await prisma.gitHubAccount.delete({ where: { userId } });
    }

    const terminalSessions = await prisma.terminalSession.findMany({ where: { userId }, select: { id: true } });
    await prisma.terminalCommandLog.deleteMany({ where: { sessionId: { in: terminalSessions.map((session) => session.id) } } });
    await prisma.terminalSession.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user) await prisma.verificationToken.deleteMany({ where: { email: user.email } });
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
}

export default async function adminRoutes(fastify: FastifyInstance) {
    fastify.post('/login', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { email, password } = adminLoginSchema.parse(request.body);
        const admin = await prisma.adminUser.findUnique({ where: { email } });

        if (!admin || !['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(admin.role)) {
            return error(reply, 401, 'Invalid admin credentials', 'INVALID_CREDENTIALS');
        }

        const valid = await PasswordService.verify(admin.passwordHash, password);
        if (!valid) return error(reply, 401, 'Invalid admin credentials', 'INVALID_CREDENTIALS');

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

        return {
            success: true,
            data: {
                admin: { id: admin.id, email: admin.email, role: admin.role },
                adminAccessToken,
            },
        };
    });

    fastify.post('/logout', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
        if (request.adminSessionId) {
            await prisma.adminSession.update({ where: { id: request.adminSessionId }, data: { revokedAt: new Date() } });
        }
        await audit(request, 'ADMIN_LOGOUT', { targetUserId: request.admin?.id, targetRole: request.admin?.role, targetType: 'ADMIN_USER', targetId: request.admin?.id });
        return { success: true, message: 'Admin logged out' };
    });

    fastify.get('/me', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
        return { success: true, data: request.admin };
    });

    fastify.post('/create-user', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const data = createAdminSchema.parse(request.body);
        if (data.adminSecret !== config.ADMIN_SECRET) {
            return error(reply, 403, 'Invalid admin secret', 'INVALID_ADMIN_SECRET');
        }

        const passwordHash = await PasswordService.hash(data.password);
        const admin = await prisma.adminUser.create({
            data: {
                email: data.email,
                passwordHash,
                role: data.role,
                createdById: request.admin.id,
            },
            select: { id: true, email: true, role: true, createdById: true, createdAt: true },
        });
        await audit(request, 'CREATE_ADMIN_USER', { targetUserId: admin.id, targetRole: admin.role, targetType: 'ADMIN_USER', targetId: admin.id });
        return { success: true, data: admin };
    });

    fastify.get('/users', { preHandler: [(fastify as any).requireSuperAdmin] }, async () => {
        const admins = await prisma.adminUser.findMany({
            select: { id: true, email: true, role: true, createdById: true, lastLoginAt: true, createdAt: true, updatedAt: true },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: admins };
    });

    fastify.patch('/users/:id/role', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const { role } = z.object({ role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']) }).parse(request.body);
        if (id === request.admin.id && role !== 'SUPER_ADMIN') {
            return error(reply, 400, 'You cannot demote your own super admin account', 'INSUFFICIENT_ROLE');
        }
        const admin = await prisma.adminUser.update({
            where: { id },
            data: { role },
            select: { id: true, email: true, role: true, updatedAt: true },
        });
        await audit(request, 'UPDATE_ADMIN_ROLE', { targetUserId: id, targetRole: role, targetType: 'ADMIN_USER', targetId: id });
        return { success: true, data: admin };
    });

    fastify.delete('/users/:id', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        if (id === request.admin.id) return error(reply, 400, 'You cannot delete your own super admin account', 'INSUFFICIENT_ROLE');
        await prisma.adminActivity.deleteMany({ where: { adminId: id } });
        await prisma.adminSession.deleteMany({ where: { adminId: id } });
        await prisma.adminUser.delete({ where: { id } });
        await audit(request, 'DELETE_ADMIN_USER', { targetUserId: id, targetType: 'ADMIN_USER', targetId: id });
        return { success: true, message: 'Admin user deleted' };
    });

    fastify.get('/overview', { preHandler: [(fastify as any).requireAdmin] }, async () => {
        const [totalUsers, totalDeployments, activeDeployments, totalVps, connectedGitHubAccounts, totalRepositories, recentActivities, latestHealth, deploymentJobs] = await Promise.all([
            prisma.user.count(),
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
                totals: { totalUsers, totalDeployments, activeDeployments, totalVps, connectedGitHubAccounts, totalRepositories },
                resources: { cpuUsage: avg(latestHealth.map((item) => item.cpuUsage)), memoryUsage: avg(latestHealth.map((item) => item.memoryUsage)), diskUsage: avg(latestHealth.map((item) => item.diskUsage)) },
                queue: { recentJobs: deploymentJobs.length, failedJobs: deploymentJobs.filter((job) => job.status === 'FAILED').length, successRate: deploymentJobs.length ? Math.round((successJobs / deploymentJobs.length) * 100) : 0 },
                recentActivities,
            },
        };
    });

    fastify.get('/platform-users', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
        const query = userQuerySchema.parse(request.query);
        const users = await prisma.user.findMany({
            where: {
                ...(query.search ? { OR: [{ email: { contains: query.search, mode: 'insensitive' } }, { name: { contains: query.search, mode: 'insensitive' } }] } : {}),
                ...(query.status ? { status: query.status } : {}),
            },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { deployments: true, vps: true, projects: true } }, githubAccount: { select: { id: true, username: true, connectedAt: true } } },
        });
        return { success: true, data: users };
    });

    fastify.get('/platform-users/:id', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
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

    fastify.patch('/platform-users/:id/status', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (!canManagePlatform(request.admin.role)) return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { id } = request.params as { id: string };
        const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).parse(request.body);
        const user = await prisma.user.update({ where: { id }, data: { status } });
        await audit(request, status === 'SUSPENDED' ? 'SUSPEND_PLATFORM_USER' : 'ACTIVATE_PLATFORM_USER', { targetUserId: id, targetType: 'USER', targetId: id });
        return { success: true, data: user };
    });

    fastify.delete('/platform-users/:id', { preHandler: [(fastify as any).requireSuperAdmin] }, async (request) => {
        const { id } = request.params as { id: string };
        await deleteUserCascade(id);
        await audit(request, 'DELETE_PLATFORM_USER', { targetUserId: id, targetType: 'USER', targetId: id });
        return { success: true, message: 'User deleted' };
    });

    fastify.get('/deployments', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
        const query = deploymentQuerySchema.parse(request.query);
        const deployments = await prisma.deployment.findMany({
            where: { ...(query.status ? { status: query.status } : {}), ...(query.userId ? { userId: query.userId } : {}) },
            include: { user: { select: { id: true, email: true, name: true } }, project: true, vps: true, deploymentLogs: { take: 3, orderBy: { createdAt: 'desc' } }, history: { take: 3, orderBy: { createdAt: 'desc' } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: deployments };
    });

    fastify.get('/deployments/:id/logs', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
        const { id } = request.params as { id: string };
        const logs = await prisma.deploymentLog.findMany({ where: { deploymentId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
        return { success: true, data: logs };
    });

    fastify.get('/deployments/:id/history', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
        const { id } = request.params as { id: string };
        const history = await prisma.deploymentHistory.findMany({ where: { deploymentId: id }, orderBy: { createdAt: 'desc' } });
        return { success: true, data: history };
    });

    fastify.post('/deployments/:id/stop', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (request.admin.role === 'MODERATOR') return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { id } = request.params as { id: string };
        const deployment = await prisma.deployment.findUnique({ where: { id }, select: { userId: true } });
        if (!deployment) return error(reply, 404, 'Deployment not found', 'NOT_FOUND');
        await DeploymentService.stopDeployment(deployment.userId, id);
        await audit(request, 'STOP_DEPLOYMENT', { targetType: 'DEPLOYMENT', targetId: id });
        return { success: true, message: 'Deployment stopped' };
    });

    fastify.post('/deployments/:id/restart', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (request.admin.role === 'MODERATOR') return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { id } = request.params as { id: string };
        const deployment = await prisma.deployment.findUnique({ where: { id }, select: { userId: true } });
        if (!deployment) return error(reply, 404, 'Deployment not found', 'NOT_FOUND');
        await DeploymentService.startDeployment(deployment.userId, id);
        await audit(request, 'RESTART_DEPLOYMENT', { targetType: 'DEPLOYMENT', targetId: id });
        return { success: true, message: 'Deployment restarted' };
    });

    fastify.delete('/deployments/:id', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (request.admin.role === 'MODERATOR') return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { id } = request.params as { id: string };
        await deleteDeploymentCascade(id);
        await audit(request, 'DELETE_DEPLOYMENT', { targetType: 'DEPLOYMENT', targetId: id });
        return { success: true, message: 'Deployment deleted' };
    });

    fastify.get('/vps', { preHandler: [(fastify as any).requireAdmin] }, async () => {
        const servers = await prisma.vPS.findMany({
            include: { user: { select: { id: true, email: true, name: true } }, healthRecords: { take: 1, orderBy: { checkedAt: 'desc' } }, systemMetrics: { take: 1, orderBy: { timestamp: 'desc' } }, _count: { select: { deployments: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: servers };
    });

    fastify.delete('/vps/:id', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (request.admin.role === 'MODERATOR') return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { id } = request.params as { id: string };
        await deleteVpsCascade(id);
        await audit(request, 'DELETE_VPS', { targetType: 'VPS', targetId: id });
        return { success: true, message: 'VPS removed' };
    });

    fastify.get('/github/accounts', { preHandler: [(fastify as any).requireAdmin] }, async () => {
        const accounts = await prisma.gitHubAccount.findMany({ include: { user: { select: { id: true, email: true, name: true } }, repositories: { orderBy: { updatedAt: 'desc' } } }, orderBy: { connectedAt: 'desc' } });
        return { success: true, data: accounts };
    });

    fastify.post('/github/accounts/:userId/sync', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (request.admin.role === 'MODERATOR') return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { userId } = request.params as { userId: string };
        const repos = await GitHubService.syncRepos(userId);
        await audit(request, 'FORCE_REPOSITORY_SYNC', { targetUserId: userId, targetType: 'GITHUB_ACCOUNT', targetId: userId });
        return { success: true, data: { count: repos.length } };
    });

    fastify.delete('/github/accounts/:userId', { preHandler: [(fastify as any).requireAdmin] }, async (request, reply) => {
        if (request.admin.role === 'MODERATOR') return error(reply, 403, 'Insufficient role', 'INSUFFICIENT_ROLE');
        const { userId } = request.params as { userId: string };
        const account = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!account) return error(reply, 404, 'GitHub account not found', 'NOT_FOUND');
        await prisma.repository.deleteMany({ where: { githubAccountId: account.id } });
        await prisma.gitHubAccount.delete({ where: { userId } });
        await audit(request, 'REMOVE_GITHUB_CONNECTION', { targetUserId: userId, targetType: 'GITHUB_ACCOUNT', targetId: userId });
        return { success: true, message: 'GitHub connection removed' };
    });

    fastify.get('/monitoring', { preHandler: [(fastify as any).requireAdmin] }, async () => {
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

    fastify.get('/logs', { preHandler: [(fastify as any).requireAdmin] }, async (request) => {
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

    fastify.get('/settings', { preHandler: [(fastify as any).requireAdmin] }, async () => {
        return {
            success: true,
            data: {
                smtp: { host: process.env.SMTP_HOST || '', port: process.env.SMTP_PORT || '', secure: process.env.SMTP_SECURE === 'true', userConfigured: Boolean(process.env.SMTP_USER) },
                github: { clientIdConfigured: Boolean(process.env.GITHUB_CLIENT_ID), clientSecretConfigured: Boolean(process.env.GITHUB_CLIENT_SECRET), redirectUri: process.env.GITHUB_REDIRECT_URI || '' },
                queue: { redisConfigured: Boolean(process.env.REDIS_URL), maxAttempts: 3 },
                security: { jwtConfigured: Boolean(process.env.JWT_SECRET), adminJwtConfigured: Boolean(process.env.ADMIN_JWT_SECRET), adminSecretConfigured: Boolean(process.env.ADMIN_SECRET), encryptionConfigured: Boolean(process.env.ENCRYPTION_KEY) },
                app: { appUrl: process.env.APP_URL || '', nodeEnv: process.env.NODE_ENV || 'development' },
            },
        };
    });
}
