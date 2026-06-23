import prisma from '@deployforge/database';
import { PasswordService } from '@deployforge/security';
import { config } from '../config/env';

export class SuperAdminService {
    static async ensureSuperAdmin() {
        const superAdminEmail = config.superAdmin.email;
        const superAdminPassword = config.superAdmin.password;

        if (!superAdminEmail || !superAdminPassword) {
            console.warn('[super-admin] Super Admin credentials not configured in environment variables.');
            return;
        }

        try {
            const passwordHash = await PasswordService.hash(superAdminPassword);
            const existingSuperAdmin = await prisma.adminUser.findFirst({
                where: { role: 'SUPER_ADMIN' }
            });

            if (existingSuperAdmin) {
                const conflictUser = await prisma.adminUser.findUnique({ where: { email: superAdminEmail } });
                if (conflictUser && conflictUser.id !== existingSuperAdmin.id) {
                    // Conflict found: another admin user is using the superAdminEmail.
                    // We delete the conflicting user to ensure the single SUPER_ADMIN can take this email.
                    await prisma.adminSession.deleteMany({ where: { adminId: conflictUser.id } });
                    await prisma.adminActivity.deleteMany({ where: { adminId: conflictUser.id } });
                    await prisma.adminUser.delete({ where: { id: conflictUser.id } });
                }

                await prisma.adminUser.update({
                    where: { id: existingSuperAdmin.id },
                    data: {
                        email: superAdminEmail,
                        passwordHash,
                    }
                });
                console.log(`[super-admin] Super Admin account synced: ${superAdminEmail}`);
                return;
            }

            // No SUPER_ADMIN exists. Does an AdminUser with this email exist?
            const userWithEmail = await prisma.adminUser.findUnique({ where: { email: superAdminEmail } });
            if (userWithEmail) {
                await prisma.adminUser.update({
                    where: { id: userWithEmail.id },
                    data: {
                        role: 'SUPER_ADMIN',
                        passwordHash,
                    }
                });
                console.log(`[super-admin] Existing admin ${superAdminEmail} promoted to SUPER_ADMIN.`);
            } else {
                await prisma.adminUser.create({
                    data: {
                        email: superAdminEmail,
                        passwordHash,
                        role: 'SUPER_ADMIN',
                    }
                });
                console.log(`[super-admin] Created Super Admin account: ${superAdminEmail}`);
            }
        } catch (error) {
            console.error('[super-admin] Error ensuring Super Admin account:', error);
        }
    }
}
