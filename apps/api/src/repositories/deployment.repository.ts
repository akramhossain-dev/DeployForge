import prisma from '@deployforge/database';
import { Deployment, Prisma } from '@deployforge/database';

export class DeploymentRepository {
    static async findById(id: string): Promise<Deployment | null> {
        return prisma.deployment.findUnique({ where: { id } });
    }

    static async findByUserId(userId: string, id: string): Promise<Deployment | null> {
        return prisma.deployment.findFirst({ where: { id, userId } });
    }

    static async findWithRelations(id: string) {
        return prisma.deployment.findUnique({
            where: { id },
            include: { project: true, vps: true },
        });
    }

    static async create(data: Prisma.DeploymentCreateInput): Promise<Deployment> {
        return prisma.deployment.create({ data });
    }

    static async update(id: string, data: Prisma.DeploymentUpdateInput): Promise<Deployment> {
        return prisma.deployment.update({ where: { id }, data });
    }

    static async delete(id: string): Promise<Deployment> {
        return prisma.deployment.delete({ where: { id } });
    }
}
