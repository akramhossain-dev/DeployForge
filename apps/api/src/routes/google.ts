import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { TokenService } from '@deployforge/security';
import { z } from 'zod';
import { config } from '../config/env';
import { GoogleService } from '../services/google.service';
import { cookie } from '../utils/http';

const tokenService = new TokenService(config.auth.jwtSecret);

function redirectWithError(target: 'login' | 'settings', errorCode: string, message: string) {
    return `${config.app.appUrl}/${target}?google=error&error_type=${encodeURIComponent(errorCode)}&message=${encodeURIComponent(message)}`;
}

function failOAuth(request: any, reply: any, target: 'login' | 'settings', errorCode: string, message: string, statusCode = 400) {
    if (String(request.headers.accept || '').includes('application/json')) {
        return reply.status(statusCode).send({ success: false, message, errorCode });
    }

    return reply.redirect(redirectWithError(target, errorCode, message));
}

function sessionCookie(name: 'accessToken' | 'refreshToken', value: string, maxAge: number) {
    return cookie(name, value, maxAge, { httpOnly: true });
}

const oauthCallbackQuerySchema = z.object({
    code: z.string().min(1).max(2048).optional(),
    state: z.string().min(1).max(4096).optional(),
    error: z.string().min(1).max(128).optional(),
    error_description: z.string().min(1).max(1024).optional(),
});

export default async function googleRoutes(fastify: FastifyInstance) {
    fastify.get('/', {
        config: {
            rateLimit: { max: 20, timeWindow: '10 minutes' },
        },
    }, async (_request, reply) => {
        try {
            const nonce = crypto.randomBytes(16).toString('hex');
            const state = tokenService.generateAccessToken({
                purpose: 'google_auth',
                nonce,
            });
            const url = GoogleService.getAuthUrl(state);
            fastify.log.info({ callbackUrl: config.oauth.google.callbackUrl }, 'Google OAuth login URL generated successfully');
            return reply.redirect(url);
        } catch (err: any) {
            fastify.log.error({ err }, 'Google OAuth login initiation failed');
            return failOAuth(_request, reply, 'login', err.errorCode || 'GOOGLE_OAUTH_CONFIG_MISSING', err.message || 'Google OAuth is unavailable');
        }
    });

    fastify.get('/callback', {
        config: {
            rateLimit: { max: 30, timeWindow: '10 minutes' },
        },
    }, async (request, reply) => {
        const { code, state, error, error_description } = oauthCallbackQuerySchema.parse(request.query);

        fastify.log.info({ hasCode: Boolean(code), hasState: Boolean(state), error }, 'Google OAuth callback received');

        if (error) {
            const errorCode = error === 'access_denied' ? 'GOOGLE_OAUTH_CANCELLED' : 'GOOGLE_API_ERROR';
            return failOAuth(request, reply, 'login', errorCode, error_description || error);
        }

        if (!state) {
            fastify.log.warn('Google OAuth callback state parameter is missing');
            return failOAuth(request, reply, 'login', 'GOOGLE_OAUTH_MISSING_STATE', 'State parameter is missing.');
        }

        try {
            const payload = tokenService.verifyToken(state) as any;
            if (payload.purpose !== 'google_auth' || !payload.nonce) {
                fastify.log.warn({ payload }, 'Invalid Google OAuth state purpose');
                return failOAuth(request, reply, 'login', 'GOOGLE_OAUTH_INVALID_STATE', 'Invalid OAuth state.');
            }
        } catch (err: any) {
            fastify.log.error({ err }, 'Google OAuth state verification failed');
            return failOAuth(request, reply, 'login', 'GOOGLE_OAUTH_INVALID_STATE', err.message || 'State validation expired or failed.');
        }

        if (!code) {
            fastify.log.warn('Google OAuth callback code parameter is missing');
            return failOAuth(request, reply, 'login', 'GOOGLE_OAUTH_MISSING_CODE', 'Verification code is missing.');
        }

        let accessToken = '';
        try {
            accessToken = await GoogleService.exchangeCodeForToken(code);
        } catch (err: any) {
            fastify.log.error({ err }, 'Google OAuth code exchange failed');
            return failOAuth(request, reply, 'login', err.errorCode || 'GOOGLE_TOKEN_EXCHANGE_FAILED', err.message || 'Google token exchange failed.');
        }

        try {
            const session = await GoogleService.authenticateOAuthUser(accessToken, request.headers['user-agent'], request.ip);
            
            const accessCookie = sessionCookie('accessToken', session.accessToken, 900);
            const refreshCookie = sessionCookie('refreshToken', session.refreshToken, 604800);
            reply.header('Set-Cookie', [accessCookie, refreshCookie]);

            fastify.log.info({ userId: session.user.id }, 'Google OAuth login completed successfully');
            return reply.redirect(`${config.app.appUrl}/google/callback`);
        } catch (err: any) {
            fastify.log.error({ err }, 'Google OAuth login failed');
            return failOAuth(request, reply, 'login', err.errorCode || 'GOOGLE_AUTH_FAILED', err.message || 'Google login failed.');
        }
    });
}
