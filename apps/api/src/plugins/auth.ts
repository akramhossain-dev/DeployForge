import { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import prisma from '@deployforge/database';
import crypto from 'crypto';
import { apiError, parseCookies } from '../utils/http';

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

            const activeSession = await prisma.session.findUnique({
                where: { id: payload.sessionId },
            });
            if (!activeSession || new Date() > activeSession.expiresAt) {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            const user = await prisma.user.findUnique({
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
            if (user.status === 'SUSPENDED') return apiError(reply, 403, 'FORBIDDEN', 'Forbidden');

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

    fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            const cookies = parseCookies(request.headers.cookie);
            const token = authHeader && authHeader.startsWith('Bearer ')
                ? authHeader.split(' ')[1]
                : cookies['adminAccessToken'] || '';

            if (!token) {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            const payload = adminTokenService.verifyToken(token);
            if (payload.tokenType !== 'admin' || !payload.adminId || !payload.sessionId) {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            const session = await prisma.adminSession.findUnique({
                where: { id: payload.sessionId },
                include: { admin: true },
            });

            if (!session || session.revokedAt || session.tokenHash !== tokenHash(token) || new Date() > session.expiresAt) {
                return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
            }

            if (!adminRoles.has(session.admin.role)) {
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
        } catch (err) {
            return apiError(reply, 401, 'UNAUTHORIZED', 'Unauthorized');
        }
    });

    fastify.decorate('requireSuperAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        await (fastify as any).requireAdmin(request, reply);
        if (reply.sent) return;
        if (request.admin?.role !== 'SUPER_ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Forbidden');
        }
    });

    fastify.decorate('requireModerator', async (request: FastifyRequest, reply: FastifyReply) => {
        await (fastify as any).requireAdmin(request, reply);
    });

    done();
};

export default fp(authPlugin);
