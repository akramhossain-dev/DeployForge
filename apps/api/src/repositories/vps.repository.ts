import prisma from '@deployforge/database';
import { VPS, Prisma } from '@deployforge/database';

export class VpsRepository {
    static async findById(id: string): Promise<VPS | null> {
        return prisma.vPS.findUnique({ where: { id } });
    }

    static async findByUserId(userId: string, id: string): Promise<VPS | null> {
        return prisma.vPS.findFirst({ where: { id, userId } });
    }

    static async create(data: Prisma.VPSCreateInput): Promise<VPS> {
        return prisma.vPS.create({ data });
    }

    static async update(id: string, data: Prisma.VPSUpdateInput): Promise<VPS> {
        return prisma.vPS.update({ where: { id }, data });
    }

    static async delete(id: string): Promise<VPS> {
        return prisma.vPS.delete({ where: { id } });
    }
}
