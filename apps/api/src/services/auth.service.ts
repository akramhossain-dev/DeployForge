import { PasswordService, TokenService } from '@deployforge/security';
import prisma from '@deployforge/database';
import { MailService } from '@deployforge/mail';
import { config } from '../config/env';
import crypto from 'crypto';
import { AccountService } from './account.service';

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
        const sessionId = crypto.randomUUID();
        const accessToken = tokenService.generateAccessToken({
            userId: user.id,
            role: user.role || 'USER',
            authProvider,
            tokenType: 'user',
            sessionId,
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

        // Parse user agent
        let browser = 'Unknown Browser';
        let device = 'Desktop';
        let os = 'Unknown OS';
        if (userAgent) {
            const ua = userAgent.toLowerCase();
            if (/mobile|android|iphone|ipad|phone/i.test(ua)) device = 'Mobile';
            else if (/tablet|ipad/i.test(ua)) device = 'Tablet';
            
            if (/chrome|crios/i.test(ua) && !/edge|edg|opr/i.test(ua)) browser = 'Chrome';
            else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
            else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
            else if (/edge|edg/i.test(ua)) browser = 'Edge';
            else if (/opr/i.test(ua)) browser = 'Opera';

            if (/windows|win32/i.test(ua)) os = 'Windows';
            else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
            else if (/linux/i.test(ua)) os = 'Linux';
            else if (/android/i.test(ua)) os = 'Android';
            else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
        }

        await prisma.userSession.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshToken: hashedRefreshToken,
                userAgent,
                device,
                browser,
                os,
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
        if (!user || !user.passwordHash) {
            await AccountService.logAudit(null, 'LOGIN_FAILURE', `Login failed: Invalid email or password for ${email}`, ipAddress, userAgent, { email });
            throw new Error('Invalid credentials');
        }

        if (user.status === 'SUSPENDED') {
            await AccountService.logAudit(user.id, 'LOGIN_FAILURE', 'Login failed: Account suspended', ipAddress, userAgent, { email });
            throw new Error('Account suspended');
        }
        if (!user.isVerified) {
            await AccountService.logAudit(user.id, 'LOGIN_FAILURE', 'Login failed: Email not verified', ipAddress, userAgent, { email });
            throw new Error('Please verify your email first');
        }

        const isValid = await PasswordService.verify(user.passwordHash, password);
        if (!isValid) {
            await AccountService.logAudit(user.id, 'LOGIN_FAILURE', 'Login failed: Incorrect password', ipAddress, userAgent, { email });
            throw new Error('Invalid credentials');
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
        const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await prisma.session.findUnique({
            where: { refreshToken: hashedToken },
            include: { user: true },
        });

        if (!session || new Date() > session.expiresAt) {
            if (session) {
                await prisma.session.delete({ where: { id: session.id } });
                await prisma.userSession.deleteMany({ where: { refreshToken: hashedToken } });
            }
            throw new Error('Invalid or expired refresh token');
        }

        const userSession = await prisma.userSession.findUnique({
            where: { refreshToken: hashedToken }
        });

        const accessToken = tokenService.generateAccessToken({
            userId: session.userId,
            role: session.user.role || 'USER',
            authProvider: session.authProvider === 'github' || session.authProvider === 'google' ? session.authProvider : 'local',
            tokenType: 'user',
            sessionId: userSession?.id,
        });
        return { accessToken };
    }

    static async logout(refreshToken: string, ip?: string, ua?: string) {
        const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const session = await prisma.session.findUnique({
            where: { refreshToken: hashedToken },
            select: { userId: true }
        });
        if (session) {
            await AccountService.logAudit(session.userId, 'LOGOUT', 'User logged out successfully.', ip, ua);
            await prisma.session.deleteMany({ where: { refreshToken: hashedToken } });
            await prisma.userSession.deleteMany({ where: { refreshToken: hashedToken } });
        }
    }
}
