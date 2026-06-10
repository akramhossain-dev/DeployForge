import { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import prisma from '@deployforge/database';
import crypto from 'crypto';

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

const tokenService = new TokenService(config.JWT_SECRET);
const adminTokenService = new TokenService(config.ADMIN_JWT_SECRET);
const adminRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'MODERATOR']);

function tokenHash(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

const authPlugin: FastifyPluginCallback = (fastify, opts, done) => {
    fastify.decorateRequest('user', null);

    fastify.decorate('authGuard', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ success: false, message: 'Unauthorized' });
            }

            const token = authHeader.split(' ')[1];
            const payload = tokenService.verifyToken(token);
            if (payload.tokenType && payload.tokenType !== 'user') {
                return reply.status(401).send({ success: false, message: 'Unauthorized', errorCode: 'UNAUTHORIZED_USER_ACCESS' });
            }

            const user = await prisma.user.findUnique({
                where: { id: payload.userId },
                select: { id: true, email: true, name: true, isVerified: true, githubId: true, githubUsername: true, githubAvatar: true, avatarUrl: true, provider: true, role: true, status: true },
            });

            if (!user) return reply.status(401).send({ success: false, message: 'Unauthorized' });
            if (user.status === 'SUSPENDED') return reply.status(403).send({ success: false, message: 'Account suspended' });

            request.user = user;
        } catch (err) {
            return reply.status(401).send({ success: false, message: 'Unauthorized' });
        }
    });

    fastify.decorate('requireAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ success: false, message: 'Admin token required', errorCode: 'UNAUTHORIZED_ADMIN_ACCESS' });
            }

            const token = authHeader.split(' ')[1];
            const payload = adminTokenService.verifyToken(token);
            if (payload.tokenType !== 'admin' || !payload.adminId || !payload.sessionId) {
                return reply.status(401).send({ success: false, message: 'Invalid admin token', errorCode: 'UNAUTHORIZED_ADMIN_ACCESS' });
            }

            const session = await prisma.adminSession.findUnique({
                where: { id: payload.sessionId },
                include: { admin: true },
            });

            if (!session || session.revokedAt || session.tokenHash !== tokenHash(token) || new Date() > session.expiresAt) {
                return reply.status(401).send({ success: false, message: 'Admin session expired', errorCode: 'UNAUTHORIZED_ADMIN_ACCESS' });
            }

            if (!adminRoles.has(session.admin.role)) {
                return reply.status(403).send({ success: false, message: 'Admin access required', errorCode: 'UNAUTHORIZED_ADMIN_ACCESS' });
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
            return reply.status(401).send({ success: false, message: 'Invalid admin token', errorCode: 'UNAUTHORIZED_ADMIN_ACCESS' });
        }
    });

    fastify.decorate('requireSuperAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
        await (fastify as any).requireAdmin(request, reply);
        if (reply.sent) return;
        if (request.admin?.role !== 'SUPER_ADMIN') {
            return reply.status(403).send({ success: false, message: 'Super admin access required', errorCode: 'INSUFFICIENT_ROLE' });
        }
    });

    fastify.decorate('requireModerator', async (request: FastifyRequest, reply: FastifyReply) => {
        await (fastify as any).requireAdmin(request, reply);
    });

    done();
};

export default fp(authPlugin);
