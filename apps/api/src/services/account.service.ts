import prisma from '@deployforge/database';
import { PasswordService } from '@deployforge/security';
import { MailService } from '@deployforge/mail';
import { config } from '../config/env';
import crypto from 'crypto';

const mailService = new MailService({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
    },
});

export class AccountService {
    static async logAudit(userId: string | null, action: string, details: string, ip?: string, ua?: string, metadata?: any) {
        // Parse user agent
        let browser = 'Unknown Browser';
        let device = 'Desktop';
        let os = 'Unknown OS';
        if (ua) {
            const uaLower = ua.toLowerCase();
            if (/mobile|android|iphone|ipad|phone/i.test(uaLower)) device = 'Mobile';
            else if (/tablet|ipad/i.test(uaLower)) device = 'Tablet';
            
            if (/chrome|crios/i.test(uaLower) && !/edge|edg|opr/i.test(uaLower)) browser = 'Chrome';
            else if (/safari/i.test(uaLower) && !/chrome|crios/i.test(uaLower)) browser = 'Safari';
            else if (/firefox|fxios/i.test(uaLower)) browser = 'Firefox';
            else if (/edge|edg/i.test(uaLower)) browser = 'Edge';
            else if (/opr/i.test(uaLower)) browser = 'Opera';

            if (/windows|win32/i.test(uaLower)) os = 'Windows';
            else if (/macintosh|mac os x/i.test(uaLower)) os = 'macOS';
            else if (/linux/i.test(uaLower)) os = 'Linux';
            else if (/android/i.test(uaLower)) os = 'Android';
            else if (/iphone|ipad|ipod/i.test(uaLower)) os = 'iOS';
        }

        await prisma.auditLog.create({
            data: {
                userId,
                action,
                details,
                ipAddress: ip,
                userAgent: ua,
                device,
                browser,
                os,
                metadata: metadata ? JSON.stringify(metadata) : null,
            },
        });
    }

    static async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                username: true,
                name: true,
                avatarUrl: true,
                githubAvatar: true,
                githubUsername: true,
                isVerified: true,
                lastLoginAt: true,
                createdAt: true,
            },
        });
        if (!user) throw new Error('User not found');
        return user;
    }

    static async updateProfile(userId: string, data: { name?: string }, ip?: string, ua?: string) {
        const existing = await prisma.user.findUnique({ where: { id: userId } });
        if (!existing) throw new Error('User not found');

        const updateData: any = {};
        const changes: string[] = [];

        if (data.name !== undefined && data.name !== existing.name) {
            updateData.name = data.name;
            changes.push(`Name changed from "${existing.name || ''}" to "${data.name}"`);
        }

        if (Object.keys(updateData).length === 0) {
            return existing;
        }

        const updated = await prisma.user.update({
            where: { id: userId },
            data: updateData,
        });

        await this.logAudit(userId, 'PROFILE_UPDATE', changes.join(', '), ip, ua);
        return updated;
    }

    static async changePassword(userId: string, data: { currentPassword?: string; newPassword?: string }, ip?: string, ua?: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        if (!data.newPassword || data.newPassword.length < 8) {
            throw new Error('New password must be at least 8 characters long');
        }

        // Local accounts check
        if (user.passwordHash) {
            if (!data.currentPassword) throw new Error('Current password is required');
            const match = await PasswordService.verify(user.passwordHash, data.currentPassword);
            if (!match) throw new Error('Current password is incorrect');
        }

        const newHash = await PasswordService.hash(data.newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash },
        });

        await this.logAudit(userId, 'PASSWORD_CHANGE', 'User password successfully changed.', ip, ua);
    }

    static async forgotPassword(email: string, ip?: string, ua?: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            // Silently return to prevent user enumeration
            return;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                token: hashedToken,
                expiresAt,
            },
        });

        const resetLink = `${config.app.appUrl}/reset-password?token=${rawToken}`;
        
        await this.logAudit(user.id, 'PASSWORD_RESET_REQUEST', 'Password reset link requested.', ip, ua);

        try {
            await mailService.sendPasswordReset(email, resetLink);
        } catch (err) {
            console.warn(`[auth] SMTP error. Reset password link: ${resetLink}`);
        }
    }

    static async resetPassword(token: string, newPassword: string, ip?: string, ua?: string) {
        if (!newPassword || newPassword.length < 8) {
            throw new Error('New password must be at least 8 characters long');
        }

        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const resetTokenRecord = await prisma.passwordResetToken.findUnique({
            where: { token: hashedToken },
            include: { user: true },
        });

        if (!resetTokenRecord || resetTokenRecord.usedAt || new Date() > resetTokenRecord.expiresAt) {
            throw new Error('Invalid or expired password reset token');
        }

        const newHash = await PasswordService.hash(newPassword);
        await prisma.user.update({
            where: { id: resetTokenRecord.userId },
            data: { passwordHash: newHash },
        });

        await prisma.passwordResetToken.update({
            where: { id: resetTokenRecord.id },
            data: { usedAt: new Date() },
        });

        await this.logAudit(resetTokenRecord.userId, 'PASSWORD_RESET_SUCCESS', 'Password reset completed via token.', ip, ua);
    }

    static async sendVerification(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.email) throw new Error('User not found');
        if (user.isVerified) throw new Error('User email is already verified');

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await prisma.emailVerificationToken.create({
            data: {
                userId,
                token: hashedToken,
                expiresAt,
            },
        });

        const verificationLink = `${config.app.appUrl}/verify-email?token=${rawToken}`;

        try {
            await mailService.sendEmailVerification(user.email, verificationLink);
        } catch (err) {
            console.warn(`[auth] SMTP error. Verification link: ${verificationLink}`);
        }
    }

    static async verifyEmail(token: string, ip?: string, ua?: string) {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const verificationRecord = await prisma.emailVerificationToken.findUnique({
            where: { token: hashedToken },
        });

        if (!verificationRecord || verificationRecord.usedAt || new Date() > verificationRecord.expiresAt) {
            throw new Error('Invalid or expired verification token');
        }

        await prisma.user.update({
            where: { id: verificationRecord.userId },
            data: { isVerified: true },
        });

        await prisma.emailVerificationToken.update({
            where: { id: verificationRecord.id },
            data: { usedAt: new Date() },
        });

        await this.logAudit(verificationRecord.userId, 'EMAIL_CHANGE', 'Email address verified successfully.', ip, ua);
    }

    static async getSessions(userId: string) {
        const sessions = await prisma.userSession.findMany({
            where: { userId },
            orderBy: { lastActivity: 'desc' },
        });
        return sessions.map((s) => ({
            id: s.id,
            browser: s.browser || 'Unknown Browser',
            os: s.os || 'Unknown OS',
            device: s.device || 'Unknown Device',
            ip: s.ipAddress || 'Unknown IP',
            lastActivity: s.lastActivity,
            createdAt: s.createdAt,
        }));
    }

    static async revokeSession(userId: string, sessionId: string, ip?: string, ua?: string) {
        const session = await prisma.userSession.findFirst({
            where: { id: sessionId, userId },
        });
        if (!session) throw new Error('Session not found');

        // Revoke from userSession
        await prisma.userSession.delete({ where: { id: sessionId } });

        // Revoke legacy session
        await prisma.session.deleteMany({
            where: { userId, refreshToken: session.refreshToken },
        });

        await this.logAudit(userId, 'SESSION_REVOKED', `Session ID ${sessionId} (IP: ${session.ipAddress || 'unknown'}) was revoked.`, ip, ua);
    }

    static async revokeOtherSessions(userId: string, currentSessionId: string, ip?: string, ua?: string) {
        const otherUserSessions = await prisma.userSession.findMany({
            where: {
                userId,
                NOT: { id: currentSessionId },
            },
            select: { refreshToken: true },
        });

        const otherRefreshTokens = otherUserSessions.map((s) => s.refreshToken);

        await prisma.userSession.deleteMany({
            where: {
                userId,
                NOT: { id: currentSessionId },
            },
        });

        await prisma.session.deleteMany({
            where: {
                userId,
                refreshToken: { in: otherRefreshTokens },
            },
        });

        await this.logAudit(userId, 'LOGOUT_ALL_SESSIONS', 'Other active sessions were successfully logged out.', ip, ua);
    }

    static async revokeAllSessions(userId: string, ip?: string, ua?: string) {
        await prisma.userSession.deleteMany({ where: { userId } });
        await prisma.session.deleteMany({ where: { userId } });

        await this.logAudit(userId, 'LOGOUT_ALL_SESSIONS', 'All active sessions were successfully logged out.', ip, ua);
    }

    static async getNotificationPreferences(userId: string) {
        let prefs = await prisma.notificationPreference.findUnique({
            where: { userId },
        });
        if (!prefs) {
            prefs = await prisma.notificationPreference.create({
                data: { userId },
            });
        }
        return prefs;
    }

    static async updateNotificationPreferences(userId: string, data: any) {
        const updateData: any = {};
        const allowed = ['deployNotifications', 'buildNotifications', 'domainNotifications', 'sslNotifications', 'securityAlerts', 'productUpdates'];
        allowed.forEach((k) => {
            if (data[k] !== undefined) updateData[k] = Boolean(data[k]);
        });

        return prisma.notificationPreference.upsert({
            where: { userId },
            update: updateData,
            create: { userId, ...updateData },
        });
    }

    static async deleteAccount(userId: string, passwordConfirm: string, ip?: string, ua?: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        if (user.passwordHash) {
            const match = await PasswordService.verify(user.passwordHash, passwordConfirm);
            if (!match) {
                await this.logAudit(userId, 'ACCOUNT_DELETION_ATTEMPT', 'Account deletion attempt failed: Incorrect password.', ip, ua);
                throw new Error('Incorrect password');
            }
        }

        await this.logAudit(userId, 'ACCOUNT_DELETED', 'Account successfully deleted.', ip, ua);

        // We cascade delete sessions and tokens (handled by schema cascade rules).
        // Deployments should not be deleted automatically as requested.
        await prisma.user.delete({ where: { id: userId } });
    }

    static async getAuditLogs(
        userId: string,
        params: {
            page?: number;
            limit?: number;
            search?: string;
            category?: string;
        }
    ) {
        const page = Math.max(1, Number(params.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
        const skip = (page - 1) * limit;

        const where: any = { userId };

        if (params.search) {
            where.OR = [
                { action: { contains: params.search, mode: 'insensitive' } },
                { details: { contains: params.search, mode: 'insensitive' } },
                { ipAddress: { contains: params.search, mode: 'insensitive' } },
                { browser: { contains: params.search, mode: 'insensitive' } },
                { os: { contains: params.search, mode: 'insensitive' } },
                { device: { contains: params.search, mode: 'insensitive' } },
            ];
        }

        if (params.category && params.category !== 'all') {
            let actions: string[] = [];
            if (params.category === 'auth') {
                actions = ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT'];
            } else if (params.category === 'sessions') {
                actions = ['SESSION_REVOKED', 'LOGOUT_ALL_SESSIONS'];
            } else if (params.category === 'password') {
                actions = ['PASSWORD_CHANGE', 'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_SUCCESS'];
            } else if (params.category === 'github') {
                actions = ['GITHUB_CONNECT', 'GITHUB_DISCONNECT'];
            } else if (params.category === 'account') {
                actions = ['ACCOUNT_DELETION_ATTEMPT', 'ACCOUNT_DELETED', 'EMAIL_CHANGE', 'PROFILE_UPDATE'];
            }

            if (actions.length > 0) {
                where.action = { in: actions };
            }
        }

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}
