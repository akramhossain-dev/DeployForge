import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { apiError, apiSuccess } from '../utils/http';
import crypto from 'crypto';

const inviteBodySchema = z.object({
    email: z.string().email(),
    role: z.enum(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']),
});

const updateRoleBodySchema = z.object({
    role: z.enum(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER']),
});

export default async function projectRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', async (request) => {
        const projects = await prisma.project.findMany({
            where: {
                OR: [
                    { userId: request.user.id },
                    { members: { some: { userId: request.user.id } } }
                ]
            },
            include: {
                user: { select: { id: true, name: true, email: true } },
                members: { include: { user: { select: { id: true, name: true, email: true, username: true, avatarUrl: true } } } },
                deployments: { select: { id: true, status: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        return apiSuccess(projects);
    });

    fastify.get('/:projectId/members', async (request, reply) => {
        const { projectId } = request.params as any;
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { userId: request.user.id },
                    { members: { some: { userId: request.user.id } } }
                ]
            }
        });
        if (!project) return apiError(reply, 404, 'NOT_FOUND', 'Project not found');

        const members = await prisma.projectMember.findMany({
            where: { projectId },
            include: { user: { select: { id: true, name: true, email: true, username: true, avatarUrl: true } } }
        });
        const invites = await prisma.projectInvite.findMany({
            where: { projectId },
            include: { invitedBy: { select: { id: true, name: true } } }
        });

        return apiSuccess({ members, invites });
    });

    fastify.post('/:projectId/invites', async (request, reply) => {
        const { projectId } = request.params as any;
        const { email, role } = inviteBodySchema.parse(request.body);

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { members: { where: { userId: request.user.id } } }
        });
        if (!project) return apiError(reply, 404, 'NOT_FOUND', 'Project not found');

        const isOwner = project.userId === request.user.id;
        const memberRole = project.members[0]?.role;
        if (!isOwner && memberRole !== 'OWNER' && memberRole !== 'ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Only project owners and admins can invite collaborators');
        }

        const invitedUser = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } }
        });
        if (invitedUser) {
            const existingMember = await prisma.projectMember.findFirst({
                where: { projectId, userId: invitedUser.id }
            });
            if (existingMember) {
                return apiError(reply, 400, 'BAD_REQUEST', 'User is already a member of this project');
            }
        }

        const existingInvite = await prisma.projectInvite.findFirst({
            where: { projectId, email: { equals: email, mode: 'insensitive' } }
        });
        if (existingInvite) {
            return apiError(reply, 400, 'BAD_REQUEST', 'An invite has already been sent to this email address');
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const invite = await prisma.projectInvite.create({
            data: {
                projectId,
                email,
                role,
                token,
                expiresAt,
                invitedById: request.user.id
            }
        });

        return apiSuccess({ invite });
    });

    fastify.delete('/:projectId/invites/:inviteId', async (request, reply) => {
        const { projectId, inviteId } = request.params as any;
        
        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { members: { where: { userId: request.user.id } } }
        });
        if (!project) return apiError(reply, 404, 'NOT_FOUND', 'Project not found');

        const isOwner = project.userId === request.user.id;
        const memberRole = project.members[0]?.role;
        if (!isOwner && memberRole !== 'OWNER' && memberRole !== 'ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        await prisma.projectInvite.deleteMany({
            where: { id: inviteId, projectId }
        });

        return apiSuccess({ message: 'Invitation revoked successfully' });
    });

    fastify.patch('/:projectId/members/:memberId', async (request, reply) => {
        const { projectId, memberId } = request.params as any;
        const { role } = updateRoleBodySchema.parse(request.body);

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { members: { where: { userId: request.user.id } } }
        });
        if (!project) return apiError(reply, 404, 'NOT_FOUND', 'Project not found');

        const isOwner = project.userId === request.user.id;
        const memberRole = project.members[0]?.role;
        if (!isOwner && memberRole !== 'OWNER' && memberRole !== 'ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        const memberToUpdate = await prisma.projectMember.findFirst({
            where: { id: memberId, projectId }
        });
        if (!memberToUpdate) return apiError(reply, 404, 'NOT_FOUND', 'Member not found');
        if (memberToUpdate.userId === project.userId) {
            return apiError(reply, 400, 'BAD_REQUEST', 'Cannot modify the role of the project creator');
        }

        const updated = await prisma.projectMember.update({
            where: { id: memberId },
            data: { role }
        });

        return apiSuccess({ member: updated });
    });

    fastify.delete('/:projectId/members/:memberId', async (request, reply) => {
        const { projectId, memberId } = request.params as any;

        const project = await prisma.project.findUnique({
            where: { id: projectId },
            include: { members: { where: { userId: request.user.id } } }
        });
        if (!project) return apiError(reply, 404, 'NOT_FOUND', 'Project not found');

        const isOwner = project.userId === request.user.id;
        const memberRole = project.members[0]?.role;
        
        const memberToDelete = await prisma.projectMember.findFirst({
            where: { id: memberId, projectId }
        });
        if (!memberToDelete) return apiError(reply, 404, 'NOT_FOUND', 'Member not found');

        const isSelfRemoval = memberToDelete.userId === request.user.id;
        if (!isSelfRemoval && !isOwner && memberRole !== 'OWNER' && memberRole !== 'ADMIN') {
            return apiError(reply, 403, 'FORBIDDEN', 'Access denied');
        }

        if (memberToDelete.userId === project.userId) {
            return apiError(reply, 400, 'BAD_REQUEST', 'Cannot remove the project creator');
        }

        await prisma.projectMember.delete({
            where: { id: memberId }
        });

        return apiSuccess({ message: 'Member removed successfully' });
    });
}
