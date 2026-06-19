import { FastifyRequest } from 'fastify';
import prisma from '@deployforge/database';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import { parseCookies } from './http';

const tokenService = new TokenService(config.auth.jwtSecret);

export function socketToken(request: FastifyRequest, queryToken?: string) {
    return queryToken || parseCookies(request.headers.cookie).accessToken || '';
}

export async function verifySocketUser(token: string) {
    if (!token) return null;
    const payload = tokenService.verifyToken(token);
    const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true },
    });
    return user ? { userId: user.id } : null;
}

export async function verifyDeploymentSocketAccess(deploymentId: string, token: string) {
    const session = await verifySocketUser(token);
    if (!session) return null;

    const deployment = await prisma.deployment.findFirst({
        where: { id: deploymentId, userId: session.userId },
        select: { id: true },
    });

    return deployment ? { userId: session.userId, deploymentId } : null;
}
