import { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import prisma from '@deployforge/database';
import crypto from 'crypto';
import { apiError, parseCookies } from '../utils/http';
import { CacheService } from '../services/cache.service';

declare module 'fastify' {
    interface FastifyRequest {
        user?: any;
        admin?: any;
        adminSessionId?: string;
    }
    interface FastifyInstance {
        authGuard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireSuperAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
        requireModerator: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

const tokenService = new TokenService(config.auth.jwtSecret);
const adminTokenService = new TokenService(config.auth.adminJwtSecret);
const adminRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

function tokenHash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

const authPlugin: FastifyPluginCallback = (fastify, opts, done) => {
    fastify.decorateRequest('user', null);

    fastify.decorate('authGuard', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            let token = '';
            const authHeader = request.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            } else {
                const cookies = parseCookies(request.headers.cookie);
                token = cookies['accessToken'] || '';
            }

            if (!token) {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            const payload = tokenService.verifyToken(token);
            if (payload.tokenType && payload.tokenType !== 'user') {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            if (!payload.sessionId) {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            const cacheKey = `user-session:${payload.userId}:${payload.sessionId}`;
            const cachedData = await CacheService.get<any>(cacheKey);

            let activeSession;
            let user;

            if (cachedData) {
                if (cachedData.revoked) {
                    return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
                }
                activeSession = cachedData.activeSession;
                user = cachedData.user;
            } else {
                activeSession = await prisma.session.findUnique({
                    where: { id: payload.sessionId },
                });
                if (!activeSession || new Date() > new Date(activeSession.expiresAt)) {
                    await CacheService.set(cacheKey, { revoked: true }, 60);
                    return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
                }

                user = await prisma.user.findUnique({
                    where: { id: payload.userId },
                    select: {
                        id: true,
                        email: true,
                        username: true,
                        name: true,
                        isVerified: true,
                        githubId: true,
                        githubUsername: true,
                        githubAvatar: true,
                        googleId: true,
                        googleEmail: true,
                        googleAvatar: true,
                        avatarUrl: true,
                        provider: true,
                        authProvider: true,
                        role: true,
                        status: true,
                        passwordHash: true,
                        createdAt: true,
                        lastLoginAt: true,
                    },
                });

                if (!user) return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');

                const ttlSeconds = Math.max(0, Math.floor((new Date(activeSession.expiresAt).getTime() - Date.now()) / 1000));
                await CacheService.set(cacheKey, { activeSession, user }, ttlSeconds);
            }
            if (user.status === 'SUSPENDED' || user.status === 'DISABLED') return apiError(reply, 403, 'FORBIDDEN', 'Forbidden');

            const { passwordHash, ...safeUser } = user;
            request.user = {
                ...safeUser,
                sessionId: payload.sessionId,
                connectedProviders: {
                    google: Boolean(user.googleId),
                    github: Boolean(user.githubId),
                    local: Boolean(user.passwordHash),
                },
            };
        } catch (err) {
            return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        }
    });

    const authenticateAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            const cookies = parseCookies(request.headers.cookie);
            const token = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.split(' ')[1]
                : cookies['adminAccessToken'] || '';

            if (!token) {
                apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
                return null;
            }

            const payload = adminTokenService.verifyToken(token);
            if (payload.tokenType !== 'admin' || !payload.adminId || !payload.sessionId) {
                apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
                return null;
            }

            const session = await prisma.adminSession.findUnique({
                where: { id: payload.sessionId },
                include: { admin: true },
            });

            if (!session || session.revokedAt || session.tokenHash !== tokenHash(token) || new Date() > session.expiresAt) {
                apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
                return null;
            }

            return session;
        } catch (err) {
            apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            return null;
        }
    };

    fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        const session = await authenticateAdmin(request, reply);
        if (!session) return;

        if (session.admin.role !== 'ADMIN' && session.admin.role !== 'SUPER_ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Forbidden');
        }

        request.admin = {
            id: session.admin.id,
            email: session.admin.email,
            role: session.admin.role,
            createdAt: session.admin.createdAt,
            lastLoginAt: session.admin.lastLoginAt,
        };
        request.adminSessionId = session.id;
    });

    fastify.decorate('requireSuperAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        const session = await authenticateAdmin(request, reply);
        if (!session) return;

        if (session.admin.role !== 'SUPER_ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Forbidden');
        }

        request.admin = {
            id: session.admin.id,
            email: session.admin.email,
            role: session.admin.role,
            createdAt: session.admin.createdAt,
            lastLoginAt: session.admin.lastLoginAt,
        };
        request.adminSessionId = session.id;
    });

    fastify.decorate('requireModerator', async (request: FastifyRequest, reply: FastifyReply) => {
        const session = await authenticateAdmin(request, reply);
        if (!session) return;

        if (session.admin.role !== 'MODERATOR' && session.admin.role !== 'ADMIN' && session.admin.role !== 'SUPER_ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Forbidden');
        }

        request.admin = {
            id: session.admin.id,
            email: session.admin.email,
            role: session.admin.role,
            createdAt: session.admin.createdAt,
            lastLoginAt: session.admin.lastLoginAt,
        };
        request.adminSessionId = session.id;
    });

    done();
};

export default fp(authPlugin);
