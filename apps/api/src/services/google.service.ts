import prisma from '@deployforge/database';
import { config } from '../config/env';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import { logger } from '../utils/logger';

type GoogleTokenResponse = {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
};

type GoogleProfile = {
    id: string;
    email?: string;
    verified_email?: boolean;
    name?: string;
    picture?: string;
};

export class GoogleService {
    static validateOAuthConfig() {
        const clientId = config.oauth.google.clientId.trim();
        const clientSecret = config.oauth.google.clientSecret.trim();
        const callbackUrl = config.oauth.google.callbackUrl.trim();

        if (!config.oauth.google.enabled) {
            throw Object.assign(new Error('Google OAuth is disabled. Set GOOGLE_OAUTH_ENABLED=true to enable it.'), {
                errorCode: 'GOOGLE_OAUTH_DISABLED',
            });
        }

        if (!clientId || !clientSecret || !callbackUrl) {
            throw Object.assign(new Error('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL on the backend.'), {
                errorCode: 'GOOGLE_OAUTH_CONFIG_MISSING',
            });
        }

        if (!clientId.endsWith('.apps.googleusercontent.com')) {
            throw Object.assign(new Error('Invalid Google OAuth config: GOOGLE_CLIENT_ID must be a Google OAuth client ID.'), {
                errorCode: 'GOOGLE_OAUTH_CONFIG_INVALID',
            });
        }
    }

    static getAuthUrl(state: string) {
        this.validateOAuthConfig();
        const params = new URLSearchParams({
            client_id: config.oauth.google.clientId,
            redirect_uri: config.oauth.google.callbackUrl,
            response_type: 'code',
            scope: 'openid email profile',
            state,
            access_type: 'online',
            prompt: 'select_account',
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    static async exchangeCodeForToken(code: string) {
        this.validateOAuthConfig();
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: new URLSearchParams({
                client_id: config.oauth.google.clientId,
                client_secret: config.oauth.google.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: config.oauth.google.callbackUrl,
            }),
        });

        const data = await response.json() as GoogleTokenResponse;
        if (!response.ok || data.error || !data.access_token) {
            const message = data.error_description || data.error || `Google token exchange failed (HTTP ${response.status})`;
            throw Object.assign(new Error(message), { errorCode: 'GOOGLE_TOKEN_EXCHANGE_FAILED' });
        }

        return data.access_token;
    }

    static async getProfile(accessToken: string): Promise<GoogleProfile> {
        const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
        });

        const data = await response.json() as GoogleProfile & { error?: { message?: string } };
        if (!response.ok) {
            throw Object.assign(new Error(data.error?.message || `Google profile fetch failed (HTTP ${response.status})`), {
                errorCode: 'GOOGLE_PROFILE_FETCH_FAILED',
            });
        }

        return data;
    }

    static async authenticateOAuthUser(accessToken: string, userAgent?: string, ipAddress?: string) {
        const profile = await this.getProfile(accessToken);
        const email = profile.email?.toLowerCase();

        if (!email) {
            throw Object.assign(new Error('Google account did not return an email address.'), {
                errorCode: 'MISSING_GOOGLE_EMAIL',
            });
        }

        if (!profile.verified_email) {
            throw Object.assign(new Error('Google email must be verified before it can be used with DeployForge.'), {
                errorCode: 'GOOGLE_EMAIL_NOT_VERIFIED',
            });
        }

        const googleId = profile.id.toString();
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { googleId },
                    { email },
                ],
            },
        });

        if (user) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    email: user.email || email,
                    googleId,
                    googleEmail: email,
                    googleAvatar: profile.picture,
                    avatarUrl: user.avatarUrl || profile.picture,
                    name: user.name || profile.name || email.split('@')[0],
                    provider: user.passwordHash ? user.provider : 'google',
                    authProvider: 'google',
                    isVerified: true,
                },
            });
        } else {
            const username = await AccountService.generateUniqueUsername(email, profile.name || email.split('@')[0]);
            user = await prisma.user.create({
                data: {
                    email,
                    username,
                    googleId,
                    googleEmail: email,
                    googleAvatar: profile.picture,
                    avatarUrl: profile.picture,
                    name: profile.name || email.split('@')[0],
                    provider: 'google',
                    authProvider: 'google',
                    isVerified: true,
                },
            });
        }

        logger.info({
            audit: true,
            event: 'google_oauth_user_authenticated',
            userId: user.id,
            googleId,
            email,
        }, 'Google OAuth user authenticated');

        return AuthService.issueSession(user, 'google', userAgent, ipAddress);
    }
}
