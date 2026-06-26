import prisma from '@deployforge/database';
import { CacheService } from './cache.service';

export class AdminService {
    static async deleteDeploymentCascade(deploymentId: string) {
        await prisma.deployment.delete({ where: { id: deploymentId } });
    }

    static async deleteVpsCascade(vpsId: string) {
        await prisma.vPS.delete({ where: { id: vpsId } });
    }

    static async deleteUserCascade(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (user?.email) {
            await prisma.verificationToken.deleteMany({ where: { email: user.email } });
        }

        // Clear all session cache patterns from Redis to instantly log out the user from all devices
        await CacheService.clearPattern(`user-session:${userId}:*`);

        // Clear profile cache
        await CacheService.del(`user:profile:${userId}`);

        await prisma.user.delete({ where: { id: userId } });
    }
}
