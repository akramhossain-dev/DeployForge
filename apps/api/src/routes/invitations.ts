import { FastifyInstance } from 'fastify';
import prisma from '@deployforge/database';
import { apiError, apiSuccess } from '../utils/http';

export default async function invitationRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', async (request) => {
        if (!request.user.email) return apiSuccess([]);

        const invites = await prisma.projectInvite.findMany({
            where: {
                email: { equals: request.user.email, mode: 'insensitive' },
                expiresAt: { gt: new Date() }
            },
            include: {
                project: { select: { id: true, name: true } },
                invitedBy: { select: { id: true, name: true, email: true } }
            }
        });
        return apiSuccess(invites);
    });

    fastify.post('/:inviteId/accept', async (request, reply) => {
        const { inviteId } = request.params as any;

        const invite = await prisma.projectInvite.findUnique({
            where: { id: inviteId },
            include: { project: true }
        });
        if (!invite) return apiError(reply, 404, 'NOT_FOUND', 'Invitation not found');
        if (new Date() > invite.expiresAt) {
            await prisma.projectInvite.delete({ where: { id: inviteId } }).catch(() => undefined);
            return apiError(reply, 400, 'BAD_REQUEST', 'Invitation has expired');
        }

        if (!request.user.email || invite.email.toLowerCase() !== request.user.email.toLowerCase()) {
            return apiError(reply, 403, 'FORBIDDEN', 'This invitation was not sent to your email address');
        }

        await prisma.$transaction([
            prisma.projectMember.create({
                data: {
                    projectId: invite.projectId,
                    userId: request.user.id,
                    role: invite.role
                }
            }),
            prisma.projectInvite.delete({
                where: { id: inviteId }
            })
        ]);

        return apiSuccess({ message: 'Invitation accepted successfully' });
    });

    fastify.post('/:inviteId/decline', async (request, reply) => {
        const { inviteId } = request.params as any;

        const invite = await prisma.projectInvite.findUnique({
            where: { id: inviteId }
        });
        if (!invite) return apiError(reply, 404, 'NOT_FOUND', 'Invitation not found');

        if (!request.user.email || invite.email.toLowerCase() !== request.user.email.toLowerCase()) {
            return apiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        await prisma.projectInvite.delete({
            where: { id: inviteId }
        });

        return apiSuccess({ message: 'Invitation declined successfully' });
    });
}
