import prisma from '@deployforge/database';

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

        await prisma.user.delete({ where: { id: userId } });
    }
}
