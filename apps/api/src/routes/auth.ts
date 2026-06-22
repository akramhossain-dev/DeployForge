import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { PasswordService, TokenService } from '@deployforge/security';
import { AuthService } from '../services/auth.service';
import { AccountService } from '../services/account.service';
import { apiError, cookie, parseCookies, sha256 } from '../utils/http';
import { config } from '../config/env';

const tokenService = new TokenService(config.auth.jwtSecret);

const strongPasswordSchema = z.string()
    .min(12)
    .refine((password) => PasswordService.validate(password).valid, {
        message: 'Password does not meet security requirements',
    });

const registerSchema = z.object({
    email: z.string().email(),
    password: strongPasswordSchema,
    name: z.string().trim().min(1).max(120).optional(),
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
    password: z.string().min(1),
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

function sessionCookie(name: 'accessToken' | 'refreshToken', value: string, maxAge: number) {
    return cookie(name, value, maxAge, { httpOnly: true });
}

export default async function authRoutes(fastify: FastifyInstance) {
    fastify.get('/csrf', {
        config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (_request, reply) => {
        const token = fastify.issueCsrfToken(reply);
        return { success: true, data: { csrfToken: token } };
    });

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
        
        const accessCookie = sessionCookie('accessToken', result.accessToken, 900);
        const refreshCookie = sessionCookie('refreshToken', result.refreshToken, 604800);
        reply.header('Set-Cookie', [accessCookie, refreshCookie]);

        return { success: true, data: { user: result.user } };
    });

    fastify.post('/refresh', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        let refreshToken = '';
        const hasBody = request.body && typeof request.body === 'object' && 'refreshToken' in request.body;

        if (hasBody) {
            const result = refreshSchema.safeParse(request.body);
            if (!result.success) {
                return apiError(reply, 400, 'BAD_REQUEST', result.error.errors[0].message);
            }
            refreshToken = result.data.refreshToken;
        } else {
            const cookies = parseCookies(request.headers.cookie);
            const cookieToken = cookies['refreshToken'] || '';
            const result = refreshSchema.safeParse({ refreshToken: cookieToken });
            if (!result.success) {
                return apiError(reply, 400, 'BAD_REQUEST', 'Invalid refresh token format');
            }
            refreshToken = result.data.refreshToken;
        }

        try {
            const result = await AuthService.refresh(refreshToken);
            
            const accessCookie = sessionCookie('accessToken', result.accessToken, 900);
            const refreshCookie = sessionCookie('refreshToken', result.refreshToken, 604800);
            reply.header('Set-Cookie', [accessCookie, refreshCookie]);

            return { success: true, data: { message: 'Session refreshed' } };
        } catch (err: any) {
            return apiError(reply, 401, 'UNAUTHORIZED', 'Invalid refresh token');
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
                return apiError(reply, 400, 'BAD_REQUEST', result.error.errors[0].message);
            }
            refreshToken = result.data.refreshToken;
            logoutMode = result.data.logoutMode || 'current';
        } else {
            const cookies = parseCookies(request.headers.cookie);
            const cookieToken = cookies['refreshToken'] || '';
            const result = logoutSchema.safeParse({ refreshToken: cookieToken, logoutMode: 'current' });
            if (!result.success) {
                return apiError(reply, 400, 'BAD_REQUEST', 'Invalid refresh token format');
            }
            refreshToken = result.data.refreshToken;
        }

        if (logoutMode === 'all') {
            const session = await prisma.session.findUnique({
                where: { refreshToken: sha256(refreshToken) }
            });
            if (session) {
                await AccountService.revokeAllSessions(session.userId, request.ip, request.headers['user-agent']);
            }
        } else if (logoutMode === 'others') {
            const session = await prisma.session.findUnique({
                where: { refreshToken: sha256(refreshToken) }
            });
            if (session) {
                await AccountService.revokeOtherSessions(session.userId, session.id, request.ip, request.headers['user-agent']);
            }
        } else {
            await AuthService.logout(refreshToken, request.ip, request.headers['user-agent']);
        }

        const accessCookie = sessionCookie('accessToken', '', 0);
        const refreshCookie = sessionCookie('refreshToken', '', 0);
        reply.header('Set-Cookie', [accessCookie, refreshCookie]);

        return { success: true, data: { message: 'Logged out successfully' } };
    });

    fastify.get('/me', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        return { success: true, data: { user: request.user } };
    });

    fastify.get('/socket-token', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request) => {
        const token = tokenService.generateAccessToken({
            userId: request.user.id,
            tokenType: 'user',
            sessionId: request.user.sessionId,
        });
        return { success: true, data: { token } };
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
            password: strongPasswordSchema,
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
