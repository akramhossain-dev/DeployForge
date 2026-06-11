import { PasswordService, TokenService } from '@deployforge/security';
import prisma from '@deployforge/database';
import { MailService } from '@deployforge/mail';
import { config } from '../config/env';
import crypto from 'crypto';

const tokenService = new TokenService(config.auth.jwtSecret);
const mailService = new MailService({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
    },
});

export class AuthService {
    static async issueSession(user: any, authProvider: 'local' | 'github' | 'google', userAgent?: string, ipAddress?: string) {
        const accessToken = tokenService.generateAccessToken({
            userId: user.id,
            role: user.role || 'USER',
            authProvider,
            tokenType: 'user',
        });
        const refreshToken = crypto.randomBytes(40).toString('hex');
        const hashedRefreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await prisma.session.create({
            data: {
                userId: user.id,
                refreshToken: hashedRefreshToken,
                authProvider,
                userAgent,
                ipAddress,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });

        return { user, accessToken, refreshToken };
    }

    static async register(email: string, password: string, name?: string) {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new Error('User already exists');
        }

        const passwordHash = await PasswordService.hash(password);
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name,
                provider: 'email',
                authProvider: 'local',
                isVerified: false,
            },
        });

        const otpResult = await this.sendOTP(email);
        return { user, ...otpResult };
    }

    static async sendOTP(email: string) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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
            return {};
        } catch (error) {
            if (config.app.env !== 'development' && config.app.env !== 'test') {
                throw error;
            }

            console.warn(`[auth] SMTP unavailable. Development OTP for ${email}: ${otp}`);
            return { devOtp: otp };
        }
    }

    static async verifyOTP(email: string, otp: string) {
        const record = await prisma.verificationToken.findUnique({ where: { email } });
        if (!record) throw new Error('No OTP found for this email');

        if (new Date() > record.expiresAt) throw new Error('OTP expired');
        if (record.attempts >= 5) throw new Error('Too many attempts');

        const hashedOTP = crypto.createHash('sha256').update(otp).digest('hex');
        if (hashedOTP !== record.token) {
            await prisma.verificationToken.update({
                where: { email },
                data: { attempts: { increment: 1 } },
            });
            throw new Error('Invalid OTP');
        }

        await prisma.user.update({
            where: { email },
            data: { isVerified: true },
        });

        await prisma.verificationToken.delete({ where: { email } });
    }

    static async login(email: string, password: string, userAgent?: string, ipAddress?: string) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) throw new Error('Invalid credentials');

        if (user.status === 'SUSPENDED') throw new Error('Account suspended');
        if (!user.isVerified) throw new Error('Please verify your email first');

        const isValid = await PasswordService.verify(user.passwordHash, password);
        if (!isValid) throw new Error('Invalid credentials');

        return this.issueSession(user, 'local', userAgent, ipAddress);
    }

    static async refresh(refreshToken: string) {
        const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await prisma.session.findUnique({
            where: { refreshToken: hashedToken },
            include: { user: true },
        });

        if (!session || new Date() > session.expiresAt) {
            if (session) await prisma.session.delete({ where: { id: session.id } });
            throw new Error('Invalid or expired refresh token');
        }

        const accessToken = tokenService.generateAccessToken({
            userId: session.userId,
            role: session.user.role || 'USER',
            authProvider: session.authProvider === 'github' || session.authProvider === 'google' ? session.authProvider : 'local',
            tokenType: 'user',
        });
        return { accessToken };
    }

    static async logout(refreshToken: string) {
        const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        await prisma.session.deleteMany({ where: { refreshToken: hashedToken } });
    }
}
