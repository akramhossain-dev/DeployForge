import prisma from '@deployforge/database';
import { PasswordService } from '@deployforge/security';
import { config } from '../config/env';
import { logger } from '../utils/logger';

export class SuperAdminService {
    static async ensureSuperAdmin() {
        const superAdminEmail = config.superAdmin.email;
        const superAdminPassword = config.superAdmin.password;

        if (!superAdminEmail || !superAdminPassword) {
            logger.warn('[super-admin] Super Admin credentials not configured in environment variables.');
            return;
        }

        try {
            const existingSuperAdmin = await prisma.adminUser.findFirst({
                where: { role: 'SUPER_ADMIN' }
            });

            if (existingSuperAdmin) {
                const conflictUser = await prisma.adminUser.findUnique({ where: { email: superAdminEmail } });
                if (conflictUser && conflictUser.id !== existingSuperAdmin.id) {
                    
                    await prisma.adminSession.deleteMany({ where: { adminId: conflictUser.id } });
                    await prisma.adminActivity.deleteMany({ where: { adminId: conflictUser.id } });
                    await prisma.adminUser.delete({ where: { id: conflictUser.id } });
                }

                const passwordUnchanged = await PasswordService.verify(
                    existingSuperAdmin.passwordHash,
                    superAdminPassword,
                ).catch(() => false);

                const updateData: { email: string; passwordHash?: string } = { email: superAdminEmail };
                if (!passwordUnchanged) {
                    updateData.passwordHash = await PasswordService.hash(superAdminPassword);
                    logger.info('[super-admin] Super Admin password updated (change detected).');
                }

                await prisma.adminUser.update({
                    where: { id: existingSuperAdmin.id },
                    data: updateData,
                });
                logger.info(`[super-admin] Super Admin account synced: ${superAdminEmail}`);
                return;
            }

            const passwordHash = await PasswordService.hash(superAdminPassword);

            const userWithEmail = await prisma.adminUser.findUnique({ where: { email: superAdminEmail } });
            if (userWithEmail) {
                await prisma.adminUser.update({
                    where: { id: userWithEmail.id },
                    data: { role: 'SUPER_ADMIN', passwordHash },
                });
                logger.info(`[super-admin] Existing admin ${superAdminEmail} promoted to SUPER_ADMIN.`);
            } else {
                await prisma.adminUser.create({
                    data: { email: superAdminEmail, passwordHash, role: 'SUPER_ADMIN' },
                });
                logger.info(`[super-admin] Created Super Admin account: ${superAdminEmail}`);
            }
        } catch (error) {
            logger.error({ err: error }, '[super-admin] Error ensuring Super Admin account');
        }
    }
}
