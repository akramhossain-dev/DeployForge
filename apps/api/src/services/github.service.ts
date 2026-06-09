import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import crypto from 'crypto';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

export class GitHubService {
    static getAuthUrl(state: string) {
        const params = new URLSearchParams({
            client_id: config.GITHUB_CLIENT_ID,
            redirect_uri: config.GITHUB_REDIRECT_URI,
            scope: 'user:email,repo,admin:repo_hook',
            state,
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    static async exchangeCodeForToken(code: string) {
        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: config.GITHUB_CLIENT_ID,
                client_secret: config.GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const data = await response.json() as any;
        if (data.error) {
            throw new Error(data.error_description || data.error);
        }
        return data.access_token as string;
    }

    static async getProfile(accessToken: string) {
        const response = await fetch('https://github.com/user', {
            headers: {
                Authorization: `token ${accessToken}`,
                Accept: 'application/json',
            },
        });
        return await response.json() as any;
    }

    static async syncUser(userId: string, accessToken: string) {
        const profile = await this.getProfile(accessToken);
        const encryptedToken = encryptionService.encrypt(accessToken);
        const tokenString = `${encryptedToken.iv}:${encryptedToken.tag}:${encryptedToken.content}`;

        const githubAccount = await prisma.gitHubAccount.upsert({
            where: { userId },
            update: {
                accessToken: tokenString,
                username: profile.login,
                email: profile.email,
                avatarUrl: profile.avatar_url,
            },
            create: {
                userId,
                githubId: profile.id.toString(),
                username: profile.login,
                accessToken: tokenString,
                email: profile.email,
                avatarUrl: profile.avatar_url,
            },
        });

        return githubAccount;
    }

    static async fetchRepos(accessToken: string) {
        const response = await fetch('https://github.com/user/repos?per_page=100&sort=updated', {
            headers: {
                Authorization: `token ${accessToken}`,
                Accept: 'application/json',
            },
        });
        return await response.json() as any[];
    }

    static async syncRepos(userId: string) {
        const account = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!account) throw new Error('GitHub account not connected');

        const [iv, tag, content] = account.accessToken.split(':');
        const accessToken = encryptionService.decrypt({ iv, tag, content });

        const githubRepos = await this.fetchRepos(accessToken);

        const syncPromises = githubRepos.map(async (repo) => {
            return prisma.repository.upsert({
                where: { repoId: repo.id.toString() },
                update: {
                    name: repo.name,
                    fullName: repo.full_name,
                    description: repo.description,
                    private: repo.private,
                    defaultBranch: repo.default_branch,
                },
                create: {
                    githubAccountId: account.id,
                    repoId: repo.id.toString(),
                    name: repo.name,
                    fullName: repo.full_name,
                    description: repo.description,
                    private: repo.private,
                    defaultBranch: repo.default_branch,
                },
            });
        });

        await Promise.all(syncPromises);
    }

    static async createWebhook(userId: string, repoFullName: string) {
        const account = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!account) throw new Error('GitHub account not connected');

        const [iv, tag, content] = account.accessToken.split(':');
        const accessToken = encryptionService.decrypt({ iv, tag, content });

        const response = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
            method: 'POST',
            headers: {
                Authorization: `token ${accessToken}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'web',
                active: true,
                events: ['push', 'pull_request'],
                config: {
                    url: `${config.APP_URL.replace('3000', '4000')}/webhooks/github`,
                    content_type: 'json',
                    secret: config.GITHUB_WEBHOOK_SECRET,
                    insecure_ssl: '0',
                },
            }),
        });

        const data = await response.json() as any;
        if (data.id) {
            await prisma.repository.update({
                where: { fullName: repoFullName },
                data: { webhookId: data.id.toString() },
            });
        }
        return data;
    }

    static verifySignature(payload: string, signature: string) {
        const hmac = crypto.createHmac('sha256', config.GITHUB_WEBHOOK_SECRET);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    }
}
