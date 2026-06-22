import prisma from '@deployforge/database';
import { User, Prisma } from '@deployforge/database';

export class UserRepository {
    static async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id } });
    }

    static async findByEmail(email: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { email } });
    }

    static async findByGithubId(githubId: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { githubId } });
    }

    static async findByGoogleId(googleId: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { googleId } });
    }

    static async create(data: Prisma.UserCreateInput): Promise<User> {
        return prisma.user.create({ data });
    }

    static async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
        return prisma.user.update({ where: { id }, data });
    }

    static async delete(id: string): Promise<User> {
        return prisma.user.delete({ where: { id } });
    }
}
