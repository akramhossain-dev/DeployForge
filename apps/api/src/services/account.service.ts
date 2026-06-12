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

function parseUA(userAgent?: string) {
    if (!userAgent) return { browser: 'Unknown', device: 'Desktop' };
    let browser = 'Unknown';
    let device = 'Desktop';
    const ua = userAgent.toLowerCase();
    
    if (/mobile|android|iphone|ipad|phone/i.test(ua)) {
        device = 'Mobile';
    } else if (/tablet|ipad/i.test(ua)) {
        device = 'Tablet';
    }
    
    if (/chrome|crios/i.test(ua) && !/edge|edg|opr/i.test(ua)) {
        browser = 'Chrome';
    } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
        browser = 'Safari';
    } else if (/firefox|fxios/i.test(ua)) {
        browser = 'Firefox';
    } else if (/edge|edg/i.test(ua)) {
        browser = 'Edge';
    } else if (/opr/i.test(ua)) {
        browser = 'Opera';
    }
    
    return { browser, device };
}

export class AccountService {
    static async logAudit(userId: string, action: string, details: string, ip?: string, ua?: string) {
        await prisma.auditLog.create({
            data: {
                userId,
                action,
                details,
                ipAddress: ip,
                userAgent: ua,
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
                isVerified: true,
                lastLoginAt: true,
                createdAt: true,
            },
        });
        if (!user) throw new Error('User not found');
        return user;
    }

    static async updateProfile(userId: string, data: { name?: string; username?: string; email?: string }, ip?: string, ua?: string) {
        const existing = await prisma.user.findUnique({ where: { id: userId } });
        if (!existing) throw new Error('User not found');

        const updateData: any = {};
        const changes: string[] = [];

        if (data.name !== undefined && data.name !== existing.name) {
            updateData.name = data.name;
            changes.push(`Name changed from "${existing.name || ''}" to "${data.name}"`);
        }

        if (data.username !== undefined && data.username !== existing.username) {
            if (data.username) {
                const dup = await prisma.user.findUnique({ where: { username: data.username } });
                if (dup && dup.id !== userId) throw new Error('Username is already taken');
            }
            updateData.username = data.username;
            changes.push(`Username changed from "${existing.username || ''}" to "${data.username}"`);
        }

        if (data.email !== undefined && data.email !== existing.email) {
            if (data.email) {
                const dup = await prisma.user.findUnique({ where: { email: data.email } });
                if (dup && dup.id !== userId) throw new Error('Email is already in use');
            }
            updateData.email = data.email;
            updateData.isVerified = false;
            changes.push(`Email changed from "${existing.email || ''}" to "${data.email}" (Verification status reset)`);
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

    static async forgotPassword(email: string) {
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

        await this.logAudit(resetTokenRecord.userId, 'PASSWORD_CHANGE', 'Password reset completed via token.', ip, ua);
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

        await this.logAudit(userId, 'SESSION_REVOCATION', `Revoked session ID ${sessionId} (IP: ${session.ipAddress || 'unknown'}).`, ip, ua);
    }

    static async revokeOtherSessions(userId: string, currentToken: string, ip?: string, ua?: string) {
        const hashedToken = crypto.createHash('sha256').update(currentToken).digest('hex');
        
        await prisma.userSession.deleteMany({
            where: {
                userId,
                NOT: { refreshToken: hashedToken },
            },
        });

        await prisma.session.deleteMany({
            where: {
                userId,
                NOT: { refreshToken: hashedToken },
            },
        });

        await this.logAudit(userId, 'SESSION_REVOCATION', 'Revoked all other active sessions.', ip, ua);
    }

    static async revokeAllSessions(userId: string, ip?: string, ua?: string) {
        await prisma.userSession.deleteMany({ where: { userId } });
        await prisma.session.deleteMany({ where: { userId } });

        await this.logAudit(userId, 'SESSION_REVOCATION', 'Revoked all active sessions.', ip, ua);
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

    static async uploadAvatar(userId: string, data: Buffer, mimeType: string) {
        const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
        if (!allowed.includes(mimeType.toLowerCase())) {
            throw new Error('Only PNG, JPG, JPEG, and WEBP image uploads are supported');
        }

        await prisma.avatar.upsert({
            where: { userId },
            update: { data, mimeType },
            create: { userId, data, mimeType },
        });

        const avatarUrl = `/profile/avatar`;
        await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl },
        });

        return { avatarUrl };
    }

    static async getAvatar(userId: string) {
        const avatar = await prisma.avatar.findUnique({
            where: { userId },
        });
        return avatar;
    }

    static async deleteAvatar(userId: string) {
        await prisma.avatar.deleteMany({ where: { userId } });
        await prisma.user.update({
            where: { id: userId },
            data: { avatarUrl: null },
        });
    }

    static async deleteAccount(userId: string, passwordConfirm: string, ip?: string, ua?: string) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error('User not found');

        if (user.passwordHash) {
            const match = await PasswordService.verify(user.passwordHash, passwordConfirm);
            if (!match) throw new Error('Incorrect password');
        }

        // We cascade delete sessions and tokens (handled by schema cascade rules).
        // Deployments should not be deleted automatically as requested.
        await prisma.user.delete({ where: { id: userId } });
    }

    static async getAuditLogs(userId: string) {
        return prisma.auditLog.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
    }
}
