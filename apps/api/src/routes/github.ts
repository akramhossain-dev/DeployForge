import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import crypto from 'crypto';
import prisma from '@deployforge/database';

export default async function githubRoutes(fastify: FastifyInstance) {
    // 1. Connect GitHub
    fastify.get('/connect', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const state = crypto.randomBytes(16).toString('hex');
        // In a real app, store state in session/cache to verify in callback
        const url = GitHubService.getAuthUrl(state);
        return { url };
    });

    // 2. Callback
    fastify.get('/callback', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { code, state } = request.query as { code: string; state: string };

        if (!code) {
            return reply.status(400).send({ success: false, message: 'Code is required' });
        }

        try {
            const accessToken = await GitHubService.exchangeCodeForToken(code);
            await GitHubService.syncUser(request.user.id, accessToken);

            // Redirect back to frontend
            return reply.redirect(`${process.env.APP_URL || 'http://localhost:3000'}/dashboard/settings`);
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
