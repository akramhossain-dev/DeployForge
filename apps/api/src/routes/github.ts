import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import crypto from 'crypto';
import prisma from '@deployforge/database';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';

const tokenService = new TokenService(config.JWT_SECRET);

export default async function githubRoutes(fastify: FastifyInstance) {
    // 1. Connect GitHub
    fastify.get('/connect', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const nonce = crypto.randomBytes(16).toString('hex');
        const state = tokenService.generateAccessToken({
            userId: request.user.id,
            purpose: 'github_oauth',
            nonce,
        });
        const url = GitHubService.getAuthUrl(state);
        return { url };
    });

    // 2. Callback
    fastify.get('/callback', async (request, reply) => {
        const { code, state } = request.query as { code: string; state: string };

        if (!code) {
            return reply.status(400).send({ success: false, message: 'Code is required' });
        }

        try {
            const payload = tokenService.verifyToken(state) as any;
            if (payload.purpose !== 'github_oauth' || !payload.userId) {
                return reply.status(400).send({ success: false, message: 'Invalid GitHub state' });
            }

            const accessToken = await GitHubService.exchangeCodeForToken(code);
            await GitHubService.syncUser(payload.userId, accessToken);

            // Redirect back to frontend
            return reply.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/settings`);
        } catch (err: any) {
            fastify.log.error(err);
            return reply.status(500).send({ success: false, message: err.message });
        }
    });

    // 3. Profile
    fastify.get('/profile', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const account = await prisma.gitHubAccount.findUnique({
            where: { userId: request.user.id }
        });
        return { success: true, data: account };
    });

    // 4. Repositories
    fastify.get('/repos', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const account = await prisma.gitHubAccount.findUnique({
            where: { userId: request.user.id },
            include: { repositories: true }
        });

        if (!account) {
            return reply.status(404).send({ success: false, message: 'GitHub not connected' });
        }

        return { success: true, data: account.repositories };
    });

    // 5. Sync Repositories
    fastify.post('/repos/sync', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        await GitHubService.syncRepos(request.user.id);
        return { success: true, message: 'Repositories synced' };
    });

    // 6. Create Webhook
    fastify.post('/webhooks/create', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { repoFullName } = request.body as { repoFullName: string };
        const result = await GitHubService.createWebhook(request.user.id, repoFullName);
        return { success: true, data: result };
    });
}
