import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import crypto from 'crypto';
import prisma from '@deployforge/database';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';

const tokenService = new TokenService(config.JWT_SECRET);

export default async function githubRoutes(fastify: FastifyInstance) {
    // 0. Login/Register with GitHub (OAuth start)
    fastify.get('/', {
        config: {
            rateLimit: { max: 20, timeWindow: '10 minutes' },
        },
    }, async (_request, reply) => {
        try {
            const nonce = crypto.randomBytes(16).toString('hex');
            const state = tokenService.generateAccessToken({
                purpose: 'github_auth',
                nonce,
            });
            const url = GitHubService.getAuthUrl(state);
            fastify.log.info({ redirectUri: config.GITHUB_REDIRECT_URI }, 'GitHub OAuth login URL generated successfully');
            return reply.redirect(url);
        } catch (err: any) {
            fastify.log.error({ err }, 'GitHub OAuth login initiation failed');
            return reply.redirect(`${config.APP_URL}/login?github=error&error_type=oauth_config&message=${encodeURIComponent(err.message || 'GitHub OAuth is unavailable')}`);
        }
    });

    // 1. Connect GitHub (OAuth start)
    fastify.get('/connect', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        try {
            fastify.log.info({ userId: request.user.id }, 'GitHub OAuth connection initiated (OAuth start)');
            const nonce = crypto.randomBytes(16).toString('hex');
            const state = tokenService.generateAccessToken({
                userId: request.user.id,
                purpose: 'github_oauth',
                nonce,
            });
            const url = GitHubService.getAuthUrl(state);
            fastify.log.info({ userId: request.user.id, redirectUri: config.GITHUB_REDIRECT_URI }, 'GitHub OAuth connection URL generated successfully');
            return { url };
        } catch (err: any) {
            fastify.log.error({ err, userId: request.user?.id }, 'GitHub OAuth connection initiation failed');
            return reply.status(400).send({ success: false, message: err.message });
        }
    });

    // 2. Callback (Callback received)
    fastify.get('/callback', {
        config: {
            rateLimit: { max: 30, timeWindow: '10 minutes' },
        },
    }, async (request, reply) => {
        const { code, state, error, error_description } = request.query as {
            code?: string;
            state?: string;
            error?: string;
            error_description?: string;
        };

        fastify.log.info({ hasCode: !!code, hasState: !!state, error, error_description }, 'GitHub OAuth callback received');

        // Handle OAuth errors redirected directly from GitHub
        if (error) {
            fastify.log.error({ error, error_description }, 'GitHub redirected back with an authorization error');
            let errorType = 'github_api_error';
            if (error === 'redirect_uri_mismatch') {
                errorType = 'callback_mismatch';
            } else if (error === 'access_denied') {
                errorType = 'oauth_denied';
            }
            let target = 'login';
            if (state) {
                try {
                    const payload = tokenService.verifyToken(state) as any;
                    if (payload.purpose === 'github_oauth') target = 'settings';
                } catch {
                    target = 'login';
                }
            }
            return reply.redirect(`${config.APP_URL}/${target}?github=error&error_type=${errorType}&message=${encodeURIComponent(error_description || error)}`);
        }

        // Validate state parameter presence
        if (!state) {
            fastify.log.warn('GitHub OAuth callback state parameter is missing');
            return reply.redirect(`${config.APP_URL}/settings?github=error&error_type=missing_state&message=State+parameter+is+missing`);
        }

        let userId = '';
        let purpose = '';
        // Validate state parameter signature/expiration (session validation)
        try {
            fastify.log.info({ state }, 'Validating state parameter');
            const payload = tokenService.verifyToken(state) as any;
            if (!['github_oauth', 'github_auth'].includes(payload.purpose)) {
                fastify.log.warn({ payload }, 'Invalid state purpose or missing user ID in state payload');
                return reply.redirect(`${config.APP_URL}/login?github=error&error_type=session_error&message=Invalid+state+purpose`);
            }
            if (payload.purpose === 'github_oauth' && !payload.userId) {
                fastify.log.warn({ payload }, 'Missing user ID in GitHub connect state payload');
                return reply.redirect(`${config.APP_URL}/settings?github=error&error_type=session_error&message=Invalid+state+purpose+or+user+identity`);
            }
            purpose = payload.purpose;
            userId = payload.userId;
            fastify.log.info({ userId, purpose }, 'State parameter verified successfully');
        } catch (err: any) {
            fastify.log.error({ err, state }, 'State verification failed');
            return reply.redirect(`${config.APP_URL}/login?github=error&error_type=session_error&message=${encodeURIComponent(err.message || 'State validation expired or failed')}`);
        }

        // Validate code presence
        if (!code) {
            fastify.log.warn({ userId }, 'GitHub OAuth callback code parameter is missing');
            const target = purpose === 'github_auth' ? 'login' : 'settings';
            return reply.redirect(`${config.APP_URL}/${target}?github=error&error_type=bad_verification_code&message=Verification+code+is+missing`);
        }

        let accessToken = '';
        // Exchange code for access token (Token exchange request)
        try {
            fastify.log.info({ userId }, 'Exchanging OAuth authorization code for access token');
            accessToken = await GitHubService.exchangeCodeForToken(code);
            fastify.log.info({ userId }, 'OAuth code exchange successful (Code exchange result)');
        } catch (err: any) {
            fastify.log.error({ err, userId }, 'OAuth code exchange failed');
            const errMsg = err.message || 'Token exchange failed';
            let errorType = 'github_api_error';
            if (errMsg.includes('invalid_client')) {
                errorType = 'invalid_client';
            } else if (errMsg.includes('bad_verification_code') || errMsg.includes('incorrect or expired')) {
                errorType = 'bad_verification_code';
            } else if (errMsg.includes('redirect_uri_mismatch') || errMsg.includes('callback_mismatch')) {
                errorType = 'callback_mismatch';
            }
            const target = purpose === 'github_auth' ? 'login' : 'settings';
            return reply.redirect(`${config.APP_URL}/${target}?github=error&error_type=${errorType}&message=${encodeURIComponent(errMsg)}`);
        }

        if (purpose === 'github_auth') {
            try {
                const session = await GitHubService.authenticateOAuthUser(accessToken, request.headers['user-agent'], request.ip);
                const params = new URLSearchParams({
                    accessToken: session.accessToken,
                    refreshToken: session.refreshToken,
                });
                fastify.log.info({ userId: session.user.id }, 'GitHub OAuth login completed successfully');
                return reply.redirect(`${config.APP_URL}/github/callback?${params.toString()}`);
            } catch (err: any) {
                fastify.log.error({ err }, 'GitHub OAuth login failed');
                return reply.redirect(`${config.APP_URL}/login?github=error&error_type=${encodeURIComponent(err.errorCode || 'github_auth_failed')}&message=${encodeURIComponent(err.message || 'GitHub login failed')}`);
            }
        }

        let account;
        // Fetch profile, upsert GitHubAccount, and update User record (Profile fetch & DB save)
        try {
            fastify.log.info({ userId }, 'Fetching profile and creating/updating GitHubAccount in DB');
            account = await GitHubService.syncUser(userId, accessToken);
            fastify.log.info({ userId, githubAccountId: account.id }, 'GitHubAccount and User session record updated successfully (DB save result & Session update result)');
        } catch (err: any) {
            fastify.log.error({ err, userId }, 'GitHub profile sync or database storage failed');
            const errMsg = err.message || 'Database storage failed';
            let errorType = 'database_error';
            let cleanMsg = errMsg;
            if (errMsg.startsWith('GitHub API Error:')) {
                errorType = 'github_api_error';
                cleanMsg = errMsg.replace('GitHub API Error: ', '');
            } else if (errMsg.startsWith('Database Storage Error:')) {
                errorType = 'database_error';
                cleanMsg = errMsg.replace('Database Storage Error: ', '');
            }
            return reply.redirect(`${config.APP_URL}/settings?github=error&error_type=${errorType}&message=${encodeURIComponent(cleanMsg)}`);
        }

        // Sync user repositories immediately (Repository sync)
        try {
            fastify.log.info({ userId, githubAccountId: account.id }, 'Initiating immediate repository sync');
            const repos = await GitHubService.syncRepos(userId);
            fastify.log.info({ userId, githubAccountId: account.id, count: repos.length }, 'Repositories synced successfully');
        } catch (syncErr: any) {
            fastify.log.error({ err: syncErr, userId, githubAccountId: account.id }, 'GitHub connected successfully, but immediate repository sync failed');
            return reply.redirect(`${config.APP_URL}/settings?github=connected&repos=sync_failed&message=${encodeURIComponent(syncErr.message || 'Immediate repository sync failed')}`);
        }

        fastify.log.info({ userId, githubAccountId: account.id }, 'GitHub connection flow completed successfully');
        return reply.redirect(`${config.APP_URL}/settings?github=connected`);
    });

    // 3. Profile
    fastify.get('/profile', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const account = await prisma.gitHubAccount.findUnique({
            where: { userId: request.user.id }
        });
        fastify.log.info({ userId: request.user.id, connected: Boolean(account) }, 'GitHub profile fetched');
        return { success: true, data: account };
    });

    // 4. Repositories
    fastify.get('/repos', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const account = await prisma.gitHubAccount.findUnique({
            where: { userId: request.user.id },
            include: { repositories: { orderBy: { updatedAt: 'desc' } } }
        });

        if (!account) {
            fastify.log.info({ userId: request.user.id }, 'Repository fetch skipped because GitHub is not connected');
            return { success: true, data: [] };
        }

        fastify.log.info({ userId: request.user.id, count: account.repositories.length }, 'Repositories fetched from database');
        return { success: true, data: account.repositories };
    });

    // 5. Sync Repositories
    fastify.post('/repos/sync', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        fastify.log.info({ userId: request.user.id }, 'Repository sync requested');
        const repositories = await GitHubService.syncRepos(request.user.id);
        return { success: true, data: { count: repositories.length }, message: 'Repositories synced' };
    });

    // 6. Create Webhook
    fastify.post('/webhooks/create', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { repoFullName } = request.body as { repoFullName: string };
        const result = await GitHubService.createWebhook(request.user.id, repoFullName);
        return { success: true, data: result };
    });

    // 7. Disconnect GitHub
    fastify.delete('/disconnect', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const account = await prisma.gitHubAccount.findUnique({ where: { userId: request.user.id } });
        if (!account) {
            fastify.log.info({ userId: request.user.id }, 'GitHub disconnect skipped because no account exists');
            return { success: true, message: 'GitHub already disconnected' };
        }

        await prisma.repository.deleteMany({ where: { githubAccountId: account.id } });
        await prisma.gitHubAccount.delete({ where: { userId: request.user.id } });
        fastify.log.info({ userId: request.user.id, githubAccountId: account.id }, 'GitHub account disconnected');
        return { success: true, message: 'GitHub disconnected' };
    });
}
