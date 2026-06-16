import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import crypto from 'crypto';
import { AuthService } from '../services/auth.service';
import { AccountService } from '../services/account.service';
import { config } from '../config/env';

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional(),
    termsAccepted: z.literal(true, {
        errorMap: () => ({ message: 'You must accept Privacy Policy and Terms' }),
    }),
});

const verifyOtpSchema = z.object({
    email: z.string().email(),
    otp: z.string().length(6),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

// API-2: Strict validation for refresh token format, type, and length
const refreshSchema = z.object({
    refreshToken: z.string()
        .length(80, { message: 'Refresh token must be exactly 80 characters' })
        .regex(/^[0-9a-f]{80}$/i, { message: 'Invalid refresh token format' }),
});

// API-3: Strict validation for logout payloads
const logoutSchema = z.object({
    refreshToken: z.string()
        .length(80, { message: 'Refresh token must be exactly 80 characters' })
        .regex(/^[0-9a-f]{80}$/i, { message: 'Invalid refresh token format' }),
    sessionId: z.string().uuid({ message: 'Session ID must be a valid UUID' }).optional(),
    logoutMode: z.enum(['current', 'all', 'others']).optional().default('current'),
});

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = parts[1].trim();
        }
    });
    return cookies;
}

export default async function authRoutes(fastify: FastifyInstance) {
    fastify.post('/register', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { email, password, name } = registerSchema.parse(request.body);
        const result = await AuthService.register(email, password, name);
        return {
            success: true,
            data: {
                message: 'Registration successful. Please check your email for the verification code.',
                email: result.user.email,
            }
        };
    });

    fastify.post('/verify-otp', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { email, otp } = verifyOtpSchema.parse(request.body);
        await AuthService.verifyOTP(email, otp);
        return { success: true, data: { message: 'Email verified successfully' } };
    });

    fastify.post('/login', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { email, password } = loginSchema.parse(request.body);
        const result = await AuthService.login(
            email,
            password,
            request.headers['user-agent'],
            request.ip
        );
        
        const isProd = config.app.env === 'production';
        const accessCookie = `accessToken=${result.accessToken}; Path=/; HttpOnly; ${isProd ? 'Secure;' : ''} SameSite=Lax; Max-Age=900`;
        const refreshCookie = `refreshToken=${result.refreshToken}; Path=/; HttpOnly; ${isProd ? 'Secure;' : ''} SameSite=Lax; Max-Age=604800`;
        reply.header('Set-Cookie', [accessCookie, refreshCookie]);

        return { success: true, data: result };
    });

    fastify.post('/refresh', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        let refreshToken = '';
        const hasBody = request.body && typeof request.body === 'object' && 'refreshToken' in request.body;

        if (hasBody) {
            const result = refreshSchema.safeParse(request.body);
            if (!result.success) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: result.error.errors[0].message
                    }
                });
            }
            refreshToken = result.data.refreshToken;
        } else {
            const cookies = parseCookies(request.headers.cookie);
            const cookieToken = cookies['refreshToken'] || '';
            const result = refreshSchema.safeParse({ refreshToken: cookieToken });
            if (!result.success) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'Invalid refresh token format'
                    }
                });
            }
            refreshToken = result.data.refreshToken;
        }

        try {
            const result = await AuthService.refresh(refreshToken);
            
            const isProd = config.app.env === 'production';
            const accessCookie = `accessToken=${result.accessToken}; Path=/; HttpOnly; ${isProd ? 'Secure;' : ''} SameSite=Lax; Max-Age=900`;
            const refreshCookie = `refreshToken=${result.refreshToken}; Path=/; HttpOnly; ${isProd ? 'Secure;' : ''} SameSite=Lax; Max-Age=604800`;
            reply.header('Set-Cookie', [accessCookie, refreshCookie]);

            return { success: true, data: result };
        } catch (err: any) {
            return reply.status(401).send({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: err.message
                }
            });
        }
    });

    fastify.post('/logout', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        let refreshToken = '';
        let logoutMode = 'current';
        const hasBody = request.body && typeof request.body === 'object' && 'refreshToken' in request.body;

        if (hasBody) {
            const result = logoutSchema.safeParse(request.body);
            if (!result.success) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: result.error.errors[0].message
                    }
                });
            }
            refreshToken = result.data.refreshToken;
            logoutMode = result.data.logoutMode || 'current';
        } else {
            const cookies = parseCookies(request.headers.cookie);
            const cookieToken = cookies['refreshToken'] || '';
            const result = logoutSchema.safeParse({ refreshToken: cookieToken, logoutMode: 'current' });
            if (!result.success) {
                return reply.status(400).send({
                    success: false,
                    error: {
                        code: 'BAD_REQUEST',
                        message: 'Invalid refresh token format'
                    }
                });
            }
            refreshToken = result.data.refreshToken;
        }

        if (logoutMode === 'all') {
            const session = await prisma.session.findUnique({
                where: { refreshToken: crypto.createHash('sha256').update(refreshToken).digest('hex') }
            });
            if (session) {
                await AccountService.revokeAllSessions(session.userId, request.ip, request.headers['user-agent']);
            }
        } else if (logoutMode === 'others') {
            const session = await prisma.session.findUnique({
                where: { refreshToken: crypto.createHash('sha256').update(refreshToken).digest('hex') }
            });
            if (session) {
                await AccountService.revokeOtherSessions(session.userId, session.id, request.ip, request.headers['user-agent']);
            }
        } else {
            await AuthService.logout(refreshToken, request.ip, request.headers['user-agent']);
        }

        const accessCookie = `accessToken=; Path=/; HttpOnly; Max-Age=0`;
        const refreshCookie = `refreshToken=; Path=/; HttpOnly; Max-Age=0`;
        reply.header('Set-Cookie', [accessCookie, refreshCookie]);

        return { success: true, data: { message: 'Logged out successfully' } };
    });

    fastify.get('/me', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        return { success: true, data: { user: request.user } };
    });

    fastify.post('/forgot-password', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const { email } = z.object({ email: z.string().email() }).parse(request.body);
        await AccountService.forgotPassword(email, request.ip, request.headers['user-agent']);
        return { success: true, data: { message: 'If the account exists, a reset link has been sent.' } };
    });

    fastify.post('/reset-password', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const { token, password } = z.object({
            token: z.string().min(1),
            password: z.string().min(8),
        }).parse(request.body);
        await AccountService.resetPassword(token, password, request.ip, request.headers['user-agent']);
        return { success: true, data: { message: 'Password has been reset successfully' } };
    });

    fastify.post('/send-verification', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        await AccountService.sendVerification(request.user.id);
        return { success: true, data: { message: 'Verification email has been sent successfully' } };
    });

    fastify.post('/verify-email', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const { token } = z.object({ token: z.string().min(1) }).parse(request.body);
        await AccountService.verifyEmail(token, request.ip, request.headers['user-agent']);
        return { success: true, data: { message: 'Email verified successfully' } };
    });
}
