import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function isCuid(id: string): boolean {
    return /^c[a-z0-9]{24}$/.test(id);
}

async function main() {
    console.log('Starting CUID to UUID migration...');

    // 1. Migrate Project -> Deployment (projectId)
    console.log('Migrating Project tables...');
    const projects = await prisma.project.findMany();
    for (const project of projects) {
        if (isCuid(project.id)) {
            const newUuid = crypto.randomUUID();
            console.log(`Migrating Project ${project.name}: ${project.id} -> ${newUuid}`);
            
            await prisma.$transaction(async (tx) => {
                await tx.project.create({
                    data: {
                        id: newUuid,
                        userId: project.userId,
                        name: project.name,
                        repositoryUrl: project.repositoryUrl,
                        branch: project.branch,
                        framework: project.framework,
                        createdAt: project.createdAt,
                        updatedAt: project.updatedAt,
                    }
                });
                
                await tx.deployment.updateMany({
                    where: { projectId: project.id },
                    data: { projectId: newUuid }
                });
                
                await tx.project.delete({
                    where: { id: project.id }
                });
            });
        }
    }

    // 2. Migrate Session -> RefreshTokenReplay (sessionId)
    console.log('Migrating Session tables...');
    const sessions = await prisma.session.findMany();
    for (const session of sessions) {
        if (isCuid(session.id)) {
            const newUuid = crypto.randomUUID();
            console.log(`Migrating Session: ${session.id} -> ${newUuid}`);
            
            await prisma.$transaction(async (tx) => {
                await tx.session.create({
                    data: {
                        id: newUuid,
                        userId: session.userId,
                        refreshToken: session.refreshToken,
                        authProvider: session.authProvider,
                        userAgent: session.userAgent,
                        device: session.device,
                        browser: session.browser,
                        os: session.os,
                        ipAddress: session.ipAddress,
                        lastActivity: session.lastActivity,
                        expiresAt: session.expiresAt,
                        createdAt: session.createdAt,
                    }
                });
                
                await tx.refreshTokenReplay.updateMany({
                    where: { sessionId: session.id },
                    data: { sessionId: newUuid }
                });
                
                await tx.session.delete({
                    where: { id: session.id }
                });
            });
        }
    }

    // 3. Migrate other leaf CUID tables (no foreign references)
    // - RefreshTokenReplay
    console.log('Migrating RefreshTokenReplay tables...');
    const replays = await prisma.refreshTokenReplay.findMany();
    for (const replay of replays) {
        if (isCuid(replay.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.refreshTokenReplay.create({
                    data: {
                        id: newUuid,
                        tokenHash: replay.tokenHash,
                        userId: replay.userId,
                        sessionId: replay.sessionId,
                        expiresAt: replay.expiresAt,
                        createdAt: replay.createdAt,
                    }
                }),
                prisma.refreshTokenReplay.delete({ where: { id: replay.id } })
            ]);
        }
    }

    // - VerificationToken
    console.log('Migrating VerificationToken tables...');
    const verificationTokens = await prisma.verificationToken.findMany();
    for (const vt of verificationTokens) {
        if (isCuid(vt.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.verificationToken.create({
                    data: {
                        id: newUuid,
                        email: vt.email,
                        token: vt.token,
                        expiresAt: vt.expiresAt,
                        attempts: vt.attempts,
                        createdAt: vt.createdAt,
                    }
                }),
                prisma.verificationToken.delete({ where: { id: vt.id } })
            ]);
        }
    }

    // - VPSHealth
    console.log('Migrating VPSHealth tables...');
    const healths = await prisma.vPSHealth.findMany();
    for (const h of healths) {
        if (isCuid(h.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.vPSHealth.create({
                    data: {
                        id: newUuid,
                        vpsId: h.vpsId,
                        cpuUsage: h.cpuUsage,
                        memoryUsage: h.memoryUsage,
                        diskUsage: h.diskUsage,
                        uptime: h.uptime,
                        dockerInstalled: h.dockerInstalled,
                        nginxInstalled: h.nginxInstalled,
                        checkedAt: h.checkedAt,
                    }
                }),
                prisma.vPSHealth.delete({ where: { id: h.id } })
            ]);
        }
    }

    // - PasswordResetToken
    console.log('Migrating PasswordResetToken tables...');
    const prts = await prisma.passwordResetToken.findMany();
    for (const prt of prts) {
        if (isCuid(prt.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.passwordResetToken.create({
                    data: {
                        id: newUuid,
                        userId: prt.userId,
                        token: prt.token,
                        expiresAt: prt.expiresAt,
                        usedAt: prt.usedAt,
                        createdAt: prt.createdAt,
                    }
                }),
                prisma.passwordResetToken.delete({ where: { id: prt.id } })
            ]);
        }
    }

    // - EmailVerificationToken
    console.log('Migrating EmailVerificationToken tables...');
    const evts = await prisma.emailVerificationToken.findMany();
    for (const evt of evts) {
        if (isCuid(evt.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.emailVerificationToken.create({
                    data: {
                        id: newUuid,
                        userId: evt.userId,
                        token: evt.token,
                        expiresAt: evt.expiresAt,
                        usedAt: evt.usedAt,
                        createdAt: evt.createdAt,
                    }
                }),
                prisma.emailVerificationToken.delete({ where: { id: evt.id } })
            ]);
        }
    }

    // - NotificationPreference
    console.log('Migrating NotificationPreference tables...');
    const nps = await prisma.notificationPreference.findMany();
    for (const np of nps) {
        if (isCuid(np.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.notificationPreference.create({
                    data: {
                        id: newUuid,
                        userId: np.userId,
                        deployNotifications: np.deployNotifications,
                        buildNotifications: np.buildNotifications,
                        domainNotifications: np.domainNotifications,
                        sslNotifications: np.sslNotifications,
                        securityAlerts: np.securityAlerts,
                        productUpdates: np.productUpdates,
                        createdAt: np.createdAt,
                        updatedAt: np.updatedAt,
                    }
                }),
                prisma.notificationPreference.delete({ where: { id: np.id } })
            ]);
        }
    }

    // - AuditLog
    console.log('Migrating AuditLog tables...');
    const logs = await prisma.auditLog.findMany();
    for (const log of logs) {
        if (isCuid(log.id)) {
            const newUuid = crypto.randomUUID();
            await prisma.$transaction([
                prisma.auditLog.create({
                    data: {
                        id: newUuid,
                        userId: log.userId,
                        action: log.action,
                        details: log.details,
                        ipAddress: log.ipAddress,
                        device: log.device,
                        browser: log.browser,
                        os: log.os,
                        userAgent: log.userAgent,
                        metadata: log.metadata,
                        createdAt: log.createdAt,
                    }
                }),
                prisma.auditLog.delete({ where: { id: log.id } })
            ]);
        }
    }

    console.log('Migration completed successfully!');
}

main()
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
