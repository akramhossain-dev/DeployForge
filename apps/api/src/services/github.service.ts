import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import crypto from 'crypto';
import { AuthService } from './auth.service';
import { logger } from '../utils/logger';

const encryptionService = new EncryptionService(config.encryption.key);

export class GitHubService {
    static sanitizeErrorMessage(message: string): string {
        if (!message) return '';
        let sanitized = message;
        if (config.oauth.github.clientSecret) {
            const escaped = config.oauth.github.clientSecret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            sanitized = sanitized.replace(new RegExp(escaped, 'g'), '[REDACTED]');
        }
        
        sanitized = sanitized.replace(/gh[pos]_[a-zA-Z0-9]{36,255}/g, '[REDACTED]');
        return sanitized;
    }

    static checkOAuthConfig() {
        const clientId = config.oauth.github.clientId?.trim();
        const clientSecret = config.oauth.github.clientSecret?.trim();
        if (!clientId || !clientSecret) {
            throw new Error('GitHub client ID or client secret is not configured.');
        }
    }

    static checkUserToken(accessToken?: string) {
        if (!accessToken?.trim()) {
            throw new Error('GitHub access token is missing or not provided.');
        }
    }

    static validateOAuthConfig() {
        const clientId = config.oauth.github.clientId.trim();
        const clientSecret = config.oauth.github.clientSecret.trim();
        const callbackUrl = config.oauth.github.callbackUrl.trim();

        if (!clientId || !clientSecret || !callbackUrl) {
            throw new Error('GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL.');
        }

        if (clientId === clientSecret || /^[0-9a-f]{40}$/i.test(clientId)) {
            throw new Error('Invalid GitHub OAuth config: GITHUB_CLIENT_ID looks like a Client Secret. Use the OAuth App Client ID from GitHub Developer Settings.');
        }

        if (!callbackUrl.endsWith('/github/callback') && !callbackUrl.endsWith('/auth/github/callback')) {
            throw new Error('Invalid GitHub OAuth config: GITHUB_CALLBACK_URL must point to /github/callback or /auth/github/callback.');
        }
    }

    static getAuthUrl(state: string) {
        this.validateOAuthConfig();
        this.checkOAuthConfig();
        const params = new URLSearchParams({
            client_id: config.oauth.github.clientId,
            redirect_uri: config.oauth.github.callbackUrl,
            scope: 'user:email,repo,admin:repo_hook',
            state,
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    static packEncryptedToken(accessToken: string) {
        this.checkUserToken(accessToken);
        const encryptedToken = encryptionService.encrypt(accessToken);
        return `${encryptedToken.iv}:${encryptedToken.tag}:${encryptedToken.content}`;
    }

    static async exchangeCodeForToken(code: string) {
        this.checkOAuthConfig();
        if (!code?.trim()) {
            throw new Error('GitHub OAuth code is missing or not provided.');
        }
        logger.info({ audit: true, event: 'github_oauth_code_exchange_started' }, 'Exchanging GitHub OAuth code');
        
        try {
            const response = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    client_id: config.oauth.github.clientId,
                    client_secret: config.oauth.github.clientSecret,
                    code,
                    redirect_uri: config.oauth.github.callbackUrl,
                }),
            });

            const text = await response.text();
            let data: any;
            try {
                data = JSON.parse(text);
            } catch (err: any) {
                logger.error({ status: response.status }, 'GitHub OAuth token response was not valid JSON');
                throw new Error(`GitHub returned non-JSON response: ${this.sanitizeErrorMessage(text) || 'empty response'}`);
            }

            if (!response.ok || data.error || !data.access_token) {
                const errorMsg = data.error_description || data.error || `HTTP ${response.status}`;
                logger.error({
                    status: response.status,
                    error: data.error,
                    description: this.sanitizeErrorMessage(data.error_description),
                }, 'GitHub OAuth token exchange failed');
                throw new Error(this.sanitizeErrorMessage(errorMsg));
            }
            logger.info({ audit: true, event: 'github_oauth_code_exchange_completed' }, 'GitHub OAuth code exchange completed');
            return data.access_token as string;
        } catch (err: any) {
            throw new Error(this.sanitizeErrorMessage(err.message));
        }
    }

    static async getProfile(accessToken: string) {
        this.checkUserToken(accessToken);
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            const text = await response.text();
            if (!response.ok) {
                let detail = '';
                try {
                    const parsed = JSON.parse(text);
                    detail = parsed.message || '';
                } catch {
                    detail = text;
                }
                logger.error({
                    status: response.status,
                    message: this.sanitizeErrorMessage(detail),
                }, 'GitHub profile fetch failed');
                throw new Error(this.sanitizeErrorMessage(detail || `GitHub profile fetch failed (HTTP ${response.status})`));
            }

            try {
                return JSON.parse(text);
            } catch (err: any) {
                throw new Error(`Invalid JSON response for GitHub profile: ${this.sanitizeErrorMessage(err.message)}`);
            }
        } catch (err: any) {
            throw new Error(this.sanitizeErrorMessage(err.message));
        }
    }

    static async getPrimaryEmail(accessToken: string) {
        this.checkUserToken(accessToken);
        try {
            const response = await fetch('https://api.github.com/user/emails', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            });

            const data = await response.json() as any;
            if (!response.ok) {
                throw new Error(this.sanitizeErrorMessage(data?.message || 'Unable to fetch GitHub email addresses'));
            }

            if (!Array.isArray(data)) return null;
            const primary = data.find((email) => email.primary && email.verified) || data.find((email) => email.verified);
            return primary?.email || null;
        } catch (err: any) {
            throw new Error(this.sanitizeErrorMessage(err.message));
        }
    }

    static async authenticateOAuthUser(accessToken: string, userAgent?: string, ipAddress?: string) {
        this.checkUserToken(accessToken);
        const profile = await this.getProfile(accessToken);
        const email = profile.email || await this.getPrimaryEmail(accessToken);

        if (!email) {
            throw Object.assign(new Error('GitHub account does not expose a verified email address.'), {
                errorCode: 'MISSING_GITHUB_EMAIL',
            });
        }

        const githubId = profile.id.toString();
        const tokenString = this.packEncryptedToken(accessToken);
        const existingAccount = await prisma.gitHubAccount.findUnique({
            where: { githubId },
            include: { user: true },
        });

        let user = existingAccount?.user || await prisma.user.findFirst({
            where: {
                OR: [
                    { githubId },
                    { email },
                ],
            },
        });

        if (user) {
            user = await prisma.user.update({
                where: { id: user.id },
                data: {
                    email: user.email || email,
                    githubId,
                    githubUsername: profile.login,
                    githubAvatar: profile.avatar_url,
                    avatarUrl: profile.avatar_url || user.avatarUrl,
                    name: user.name || profile.name || profile.login,
                    provider: user.passwordHash ? user.provider : 'github',
                    authProvider: 'github',
                    isVerified: true,
                },
            });
        } else {
            user = await prisma.user.create({
                data: {
                    email,
                    githubId,
                    githubUsername: profile.login,
                    githubAvatar: profile.avatar_url,
                    avatarUrl: profile.avatar_url,
                    name: profile.name || profile.login,
                    provider: 'github',
                    authProvider: 'github',
                    isVerified: true,
                },
            });
        }

        await prisma.gitHubAccount.upsert({
            where: { userId: user.id },
            update: {
                githubId,
                accessToken: tokenString,
                username: profile.login,
                email,
                avatarUrl: profile.avatar_url,
            },
            create: {
                userId: user.id,
                githubId,
                accessToken: tokenString,
                username: profile.login,
                email,
                avatarUrl: profile.avatar_url,
            },
        });

        logger.info({
            audit: true,
            event: 'github_oauth_user_authenticated',
            userId: user.id,
            githubId,
            email,
        }, 'GitHub OAuth user authenticated');

        return AuthService.issueSession(user, 'github', userAgent, ipAddress);
    }

    static async syncUser(userId: string, accessToken: string) {
        this.checkUserToken(accessToken);
        logger.info({ userId }, 'Syncing GitHub account');
        
        let profile;
        try {
            profile = await this.getProfile(accessToken);
            logger.info({
                userId,
                githubId: profile.id,
                login: profile.login,
                email: profile.email,
            }, 'GitHub profile fetched successfully');
        } catch (fetchErr: any) {
            throw new Error(`GitHub API Error: ${this.sanitizeErrorMessage(fetchErr.message)}`);
        }

        const tokenString = this.packEncryptedToken(accessToken);

        let githubAccount;
        try {
            githubAccount = await prisma.gitHubAccount.upsert({
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

            logger.info({
                userId,
                githubAccountId: githubAccount.id,
                username: githubAccount.username,
            }, 'GitHub account persisted');

            await prisma.user.update({
                where: { id: userId },
                data: {
                    githubId: profile.id.toString(),
                    githubUsername: profile.login,
                    githubAvatar: profile.avatar_url,
                    avatarUrl: profile.avatar_url || undefined,
                    authProvider: 'github',
                },
            });

            logger.info({
                userId,
                githubId: profile.id,
            }, 'User GitHub link updated');
        } catch (dbErr: any) {
            throw new Error(`Database Storage Error: ${this.sanitizeErrorMessage(dbErr.message)}`);
        }

        return githubAccount;
    }

    static async fetchRepos(accessToken: string) {
        this.checkUserToken(accessToken);
        const repos: any[] = [];
        let page = 1;

        while (true) {
            const params = new URLSearchParams({
                per_page: '100',
                sort: 'updated',
                visibility: 'all',
                affiliation: 'owner,collaborator,organization_member',
                page: String(page),
            });
            try {
                const response = await fetch(`https://api.github.com/user/repos?${params.toString()}`, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': '2022-11-28',
                    },
                });
                const data = await response.json() as any;

                if (!response.ok) {
                    logger.error({
                        status: response.status,
                        message: this.sanitizeErrorMessage(data.message),
                        page,
                    }, 'GitHub repository fetch failed');
                    throw new Error(this.sanitizeErrorMessage(data.message || 'Unable to fetch GitHub repositories'));
                }

                repos.push(...data);
                logger.info({ page, count: data.length }, 'Fetched GitHub repository page');

                if (!Array.isArray(data) || data.length < 100) break;
                page += 1;
            } catch (err: any) {
                throw new Error(this.sanitizeErrorMessage(err.message));
            }
        }

        return repos;
    }

    static async syncRepos(userId: string) {
        const account = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!account) throw new Error('GitHub account not connected');
        this.checkUserToken(account.accessToken);

        const parts = account.accessToken.split(':');
        if (parts.length !== 3) {
            throw new Error('GitHub access token format in database is invalid');
        }
        const [iv, tag, content] = parts;
        const accessToken = encryptionService.decrypt({ iv, tag, content });
        this.checkUserToken(accessToken);

        const githubRepos = await this.fetchRepos(accessToken);
        logger.info({
            userId,
            githubAccountId: account.id,
            count: githubRepos.length,
        }, 'Syncing GitHub repositories');

        const syncPromises = githubRepos.map(async (repo) => {
            return prisma.repository.upsert({
                where: { repoId: repo.id.toString() },
                update: {
                    githubAccountId: account.id,
                    name: repo.name,
                    fullName: repo.full_name,
                    description: repo.description,
                    private: repo.private,
                    defaultBranch: repo.default_branch,
                    cloneUrl: repo.clone_url,
                },
                create: {
                    githubAccountId: account.id,
                    repoId: repo.id.toString(),
                    name: repo.name,
                    fullName: repo.full_name,
                    description: repo.description,
                    private: repo.private,
                    defaultBranch: repo.default_branch,
                    cloneUrl: repo.clone_url,
                },
            });
        });

        const synced = await Promise.all(syncPromises);
        logger.info({
            userId,
            count: synced.length,
        }, 'GitHub repositories persisted');
        return synced;
    }

    static async createWebhook(userId: string, repoFullName: string) {
        const account = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!account) throw new Error('GitHub account not connected');
        this.checkUserToken(account.accessToken);

        const parts = account.accessToken.split(':');
        if (parts.length !== 3) {
            throw new Error('GitHub access token format in database is invalid');
        }
        const [iv, tag, content] = parts;
        const accessToken = encryptionService.decrypt({ iv, tag, content });
        this.checkUserToken(accessToken);

        try {
            const response = await fetch(`https://api.github.com/repos/${repoFullName}/hooks`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: 'web',
                    active: true,
                    events: ['push', 'pull_request'],
                    config: {
                        url: `${config.app.apiUrl}/webhooks/github`,
                        content_type: 'json',
                        secret: config.oauth.github.webhookSecret,
                        insecure_ssl: '0',
                    },
                }),
            });

            const data = await response.json() as any;
            if (!response.ok) {
                const details = Array.isArray(data.errors)
                    ? data.errors.map((item: any) => [item.resource, item.field, item.code, item.message].filter(Boolean).join(' ')).filter(Boolean).join('; ')
                    : '';
                const message = [data.message, details].filter(Boolean).join(': ');
                logger.error({
                    repoFullName,
                    status: response.status,
                    message: this.sanitizeErrorMessage(message),
                }, 'GitHub webhook creation failed');
                throw new Error(this.sanitizeErrorMessage(message || 'Unable to create GitHub webhook'));
            }
            if (data.id) {
                await prisma.repository.updateMany({
                    where: { githubAccountId: account.id, fullName: repoFullName },
                    data: { webhookId: data.id.toString() },
                });
            }
            return data;
        } catch (err: any) {
            throw new Error(this.sanitizeErrorMessage(err.message));
        }
    }

    static verifySignature(payload: string, signature: string) {
        if (!signature?.startsWith('sha256=')) return false;
        const hmac = crypto.createHmac('sha256', config.oauth.github.webhookSecret);
        const digest = 'sha256=' + hmac.update(payload).digest('hex');
        const signatureBuffer = Buffer.from(signature);
        const digestBuffer = Buffer.from(digest);
        if (signatureBuffer.length !== digestBuffer.length) return false;
        return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
    }
}
