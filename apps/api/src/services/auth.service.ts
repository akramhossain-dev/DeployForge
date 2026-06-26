import { PasswordService, TokenService } from '@deployforge/security';
import prisma from '@deployforge/database';
import { MailService } from '@deployforge/mail';
import { config } from '../config/env';
import crypto from 'crypto';
import { AccountService } from './account.service';
import { sha256, timingSafeEqualString } from '../utils/http';
import { parseUserAgent } from '../utils/user-agent';
import { logger } from '../utils/logger';
import { CacheService } from './cache.service';

const tokenService = new TokenService(config.auth.jwtSecret);
const mailService = new MailService({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
    },
    fromEmail: config.email.fromEmail,
    logger,
});

function emailServiceUnavailableError() {
    return Object.assign(new Error('Email service unavailable. Please try again later.'), {
        statusCode: 503,
        expose: true,
    });
}

function publicError(message: string, statusCode: number) {
    return Object.assign(new Error(message), {
        statusCode,
        expose: true,
    });
}

function genericAuthError() {
    return publicError('Invalid email or password', 401);
}

function refreshTokenHash(refreshToken: string) {
    return sha256(refreshToken);
}

export class AuthService {
    static async issueSession(user: any, authProvider: 'local' | 'github' | 'google', userAgent?: string, ipAddress?: string) {
        const sessionId = crypto.randomUUID();
        const accessToken = tokenService.generateAccessToken({
            userId: user.id,
            role: user.role || 'USER',
            authProvider,
            tokenType: 'user',
            sessionId,
        });
        const refreshToken = crypto.randomBytes(40).toString('hex');
        const hashedRefreshToken = refreshTokenHash(refreshToken);

        const { browser, device, os } = parseUserAgent(userAgent);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const activeSession = {
            id: sessionId,
            userId: user.id,
            refreshToken: hashedRefreshToken,
            authProvider,
            userAgent,
            device,
            browser,
            os,
            ipAddress,
            expiresAt,
        };

        await prisma.session.create({
            data: activeSession,
        });

        const cacheKey = `user-session:${user.id}:${sessionId}`;
        const { passwordHash, ...safeUser } = user;
        const ttlSeconds = 7 * 24 * 60 * 60; 
        await CacheService.set(cacheKey, { activeSession, user: safeUser }, ttlSeconds);

        return { user, accessToken, refreshToken };
    }

    static async register(email: string, password: string, name?: string) {
        PasswordService.assertStrong(password);
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new Error('User already exists');
        }

        const passwordHash = await PasswordService.hash(password);
        const username = await AccountService.generateUniqueUsername(email, name);
        const user = await prisma.user.create({
            data: {
                email,
                username,
                passwordHash,
                name,
                provider: 'email',
                authProvider: 'local',
                isVerified: false,
            },
        });

        try {
            await this.sendOTP(email);
        } catch (error) {
            await prisma.verificationToken.deleteMany({ where: { email } });
            await prisma.user.delete({ where: { id: user.id } });
            throw error;
        }

        return { user: { id: user.id, email: user.email, name: user.name } };
    }

    static async sendOTP(email: string) {
        const otp = crypto.randomInt(100000, 1000000).toString();
        const hashedOTP = sha256(otp);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

        await prisma.verificationToken.upsert({
            where: { email },
            update: {
                token: hashedOTP,
                expiresAt,
                attempts: 0,
            },
            create: {
                email,
                token: hashedOTP,
                expiresAt,
            },
        });

        try {
            await mailService.sendOTP(email, otp);
        } catch (error: any) {
            logger.error({ err: error, email, audit: true, event: 'otp_email_failed' }, 'Failed to send OTP email');
            throw emailServiceUnavailableError();
        }

        return {};
    }

    static async verifyOTP(email: string, otp: string) {
        const record = await prisma.verificationToken.findUnique({ where: { email } });
        if (!record) throw publicError('OTP is required.', 400);

        if (new Date() > record.expiresAt) throw publicError('OTP expired. Please request a new one.', 400);
        if (record.attempts >= 5) throw publicError('Too many attempts. Please request a new code.', 429);

        const hashedOTP = sha256(otp);
        if (!timingSafeEqualString(hashedOTP, record.token)) {
            await prisma.verificationToken.update({
                where: { email },
                data: { attempts: { increment: 1 } },
            });
            throw publicError('Invalid OTP. Please try again.', 400);
        }

        await prisma.user.update({
            where: { email },
            data: { isVerified: true },
        });

        await prisma.verificationToken.delete({ where: { email } });
    }

    static async login(email: string, password: string, userAgent?: string, ipAddress?: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
            await AccountService.logAudit(null, 'LOGIN_FAILURE', `Login failed: Invalid email or password for ${email}`, ipAddress, userAgent, { email });
            await PasswordService.verifyAgainstDummy(password);
            throw genericAuthError();
        }

        if (user.status === 'SUSPENDED' || user.status === 'DISABLED') {
            await AccountService.logAudit(user.id, 'LOGIN_FAILURE', `Login failed: Account is ${user.status.toLowerCase()}`, ipAddress, userAgent, { email });
            throw genericAuthError();
        }
        if (!user.isVerified) {
            await AccountService.logAudit(user.id, 'LOGIN_FAILURE', 'Login failed: Email not verified', ipAddress, userAgent, { email });
            throw genericAuthError();
        }

        const isValid = await PasswordService.verify(user.passwordHash, password);
        if (!isValid) {
            await AccountService.logAudit(user.id, 'LOGIN_FAILURE', 'Login failed: Incorrect password', ipAddress, userAgent, { email });
            throw genericAuthError();
        }

        await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });

        const session = await this.issueSession(user, 'local', userAgent, ipAddress);
        await AccountService.logAudit(user.id, 'LOGIN_SUCCESS', 'User logged in successfully via email/password.', ipAddress, userAgent);

        return session;
    }

    static async refresh(refreshToken: string) {
        const hashedToken = refreshTokenHash(refreshToken);

        const replayedToken = await prisma.refreshTokenReplay.findUnique({ where: { tokenHash: hashedToken } });
        if (replayedToken && new Date() <= replayedToken.expiresAt) {
            const userId = replayedToken.userId;
            await prisma.session.deleteMany({ where: { userId } });
            await CacheService.clearPattern(`user-session:${userId}:*`);
            await AccountService.logAudit(userId, 'REFRESH_TOKEN_REPLAY', 'Replay attack detected on refresh token. Revoking all sessions.', undefined, undefined);
            throw publicError('Invalid refresh token', 401);
        }

        const session = await prisma.session.findUnique({
            where: { refreshToken: hashedToken },
            include: { user: true },
        });

        if (!session || new Date() > session.expiresAt) {
            if (session) {
                await prisma.session.delete({ where: { id: session.id } });
                await CacheService.del(`user-session:${session.userId}:${session.id}`);
            }
            throw publicError('Invalid refresh token', 401);
        }

        const newRefreshToken = crypto.randomBytes(40).toString('hex');
        const hashedNewRefreshToken = refreshTokenHash(newRefreshToken);
        const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        await prisma.$transaction([
            prisma.session.update({
                where: { id: session.id },
                data: {
                    refreshToken: hashedNewRefreshToken,
                    expiresAt: newExpiresAt,
                    lastActivity: new Date(),
                },
            }),
            prisma.refreshTokenReplay.create({
                data: {
                    tokenHash: hashedToken,
                    userId: session.userId,
                    sessionId: session.id,
                    expiresAt: session.expiresAt,
                },
            }),
        ]);

        await CacheService.del(`user-session:${session.userId}:${session.id}`);

        await prisma.refreshTokenReplay.deleteMany({ where: { expiresAt: { lt: new Date() } } });

        const accessToken = tokenService.generateAccessToken({
            userId: session.userId,
            role: session.user.role || 'USER',
            authProvider: session.authProvider === 'github' || session.authProvider === 'google' ? session.authProvider : 'local',
            tokenType: 'user',
            sessionId: session.id,
        });

        await AccountService.logAudit(session.userId, 'REFRESH_TOKEN_ROTATION', 'Refresh token rotated successfully.', undefined, undefined);

        return { accessToken, refreshToken: newRefreshToken };
    }

    static async logout(refreshToken: string, ip?: string, ua?: string) {
        const hashedToken = refreshTokenHash(refreshToken);
        const session = await prisma.session.findUnique({
            where: { refreshToken: hashedToken },
            select: { id: true, userId: true }
        });
        if (session) {
            await AccountService.logAudit(session.userId, 'LOGOUT', 'User logged out successfully.', ip, ua);
            await prisma.session.deleteMany({ where: { refreshToken: hashedToken } });
            await CacheService.del(`user-session:${session.userId}:${session.id}`);
        }
    }
}
