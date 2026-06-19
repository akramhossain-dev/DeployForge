import prisma from '@deployforge/database';
import { PasswordService } from '@deployforge/security';
import { MailService } from '@deployforge/mail';
import { config } from '../config/env';
import crypto from 'crypto';
import { paginationMeta, parsePagination, sha256 } from '../utils/http';
import { parseUserAgent } from '../utils/user-agent';

const mailService = new MailService({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
    },
    fromEmail: config.email.fromEmail,
});

function publicError(message: string, statusCode: number) {
    return Object.assign(new Error(message), {
        statusCode,
        expose: true,
    });
}

function emailServiceUnavailableError() {
    return publicError('Email service unavailable. Please try again later.', 503);
}

export class AccountService {
    static async logAudit(userId: string | null, action: string, details: string, ip?: string, ua?: string, metadata?: any) {
        const { browser, device, os } = parseUserAgent(ua);

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

        if (!data.newPassword) throw publicError('New password is required', 400);
        PasswordService.assertStrong(data.newPassword);

        // Local accounts check
        if (user.passwordHash) {
            if (!data.currentPassword) throw publicError('Unable to change password', 400);
            const match = await PasswordService.verify(user.passwordHash, data.currentPassword);
            if (!match) throw publicError('Unable to change password', 400);
        }

        const newHash = await PasswordService.hash(data.newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash },
        });

        await this.logAudit(userId, 'PASSWORD_CHANGE', 'User password successfully changed.', ip, ua);
    }

    /**
     * Sends a password reset email with a secure token.
     *
     * Security:
     * - Returns a proper error if email not found
     * - Token is stored as SHA-256 hash
     * - Token expires in 1 hour
     * - Token is single-use (marked usedAt after consumption)
     * - SMTP errors are caught and logged internally
     */
    static async forgotPassword(email: string, ip?: string, ua?: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            await PasswordService.verifyAgainstDummy(email);
            return;
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = sha256(rawToken);
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
        } catch (error: any) {
            console.error('[auth] Failed to send password reset email', { email, error });
            throw emailServiceUnavailableError();
        }
    }

    static async resetPassword(token: string, newPassword: string, ip?: string, ua?: string) {
        PasswordService.assertStrong(newPassword);

        const hashedToken = sha256(token);
        const resetTokenRecord = await prisma.passwordResetToken.findUnique({
            where: { token: hashedToken },
            include: { user: true },
        });

        if (!resetTokenRecord || resetTokenRecord.usedAt || new Date() > resetTokenRecord.expiresAt) {
            throw publicError('Invalid or expired password reset token', 400);
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

    /**
     * Sends an email verification link to the user.
     *
     * Security:
     * - Token is stored as SHA-256 hash
     * - Token expires in 24 hours
     * - Token is single-use (marked usedAt after consumption)
     * - SMTP errors are caught and logged internally
     */
    static async sendVerification(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.email) throw new Error('User not found');
        if (user.isVerified) throw new Error('User email is already verified');

        const rawToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = sha256(rawToken);
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
        } catch (error: any) {
            console.error('[auth] Failed to send verification email', { email: user.email, error });
            throw emailServiceUnavailableError();
        }
    }

    static async verifyEmail(token: string, ip?: string, ua?: string) {
        const hashedToken = sha256(token);
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
        const sessions = await prisma.session.findMany({
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
        const session = await prisma.session.findFirst({
            where: { id: sessionId, userId },
        });
        if (!session) throw new Error('Session not found');

        await prisma.session.delete({ where: { id: sessionId } });

        await this.logAudit(userId, 'SESSION_REVOKED', `Session ID ${sessionId} (IP: ${session.ipAddress || 'unknown'}) was revoked.`, ip, ua);
    }

    static async revokeOtherSessions(userId: string, currentSessionId: string, ip?: string, ua?: string) {
        await prisma.session.deleteMany({
            where: {
                userId,
                NOT: { id: currentSessionId },
            },
        });

        await this.logAudit(userId, 'LOGOUT_ALL_SESSIONS', 'Other active sessions were successfully logged out.', ip, ua);
    }

    static async revokeAllSessions(userId: string, ip?: string, ua?: string) {
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
                throw publicError('Unable to delete account', 400);
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
        const { page, limit, skip } = parsePagination(params);

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
            pagination: paginationMeta(total, page, limit),
        };
    }
}
