import { FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import prisma from '@deployforge/database';

declare module 'fastify' {
    interface FastifyRequest {
        user?: any;
    }
}

const tokenService = new TokenService(config.JWT_SECRET);

const authPlugin: FastifyPluginCallback = (fastify, opts, done) => {
    fastify.decorateRequest('user', null);

    fastify.decorate('authGuard', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return reply.status(401).send({ message: 'Unauthorized' });
            }

            const token = authHeader.split(' ')[1];
            const payload = tokenService.verifyToken(token);

            const user = await prisma.user.findUnique({
                where: { id: payload.userId },
                select: { id: true, email: true, name: true, isVerified: true },
            });

            if (!user) return reply.status(401).send({ message: 'Unauthorized' });

            request.user = user;
        } catch (err) {
            return reply.status(401).send({ message: 'Unauthorized' });
        }
    });

    done();
};

export default fp(authPlugin);
