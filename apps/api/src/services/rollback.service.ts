import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import { LoggingService } from './logging.service';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

export class RollbackService {
    static async getHistory(deploymentId: string) {
        return await prisma.deploymentHistory.findMany({
            where: { deploymentId },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async rollback(userId: string, deploymentId: string, historyId: string) {
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { vps: true, project: true },
        });
        if (!deployment || deployment.userId !== userId) throw new Error('Deployment not found');

        const history = await prisma.deploymentHistory.findUnique({
            where: { id: historyId },
        });
        if (!history) throw new Error('History version not found');

        const vps = deployment.vps;
        const ssh = new SSHService();
        try {
            const auth = vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            await LoggingService.log(deploymentId, `Starting rollback to version ${history.version}`, 'system');

            // 1. Stop current container
            if (deployment.containerId) {
                await ssh.execute(`docker stop ${deployment.containerId} && docker rm ${deployment.containerId} || true`);
            }

            // 2. Restart previous container
            // If we saved image Tag, we can run it. For now we use containerId or re-run last known good image.
            const containerName = `df-${deployment.project.name}-${deploymentId.slice(0, 8)}`;
            const { stdout: newContainerId } = await ssh.execute(`docker run -d --name ${containerName} -p ${deployment.port}:3000 ${history.containerId}`);

            // 3. Update DB
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    status: 'RUNNING',
                    containerId: newContainerId.trim(),
                    commitHash: history.version
                },
            });

            await LoggingService.log(deploymentId, `Rollback successful. Now running version ${history.version}`, 'system');

            return { success: true, version: history.version };
        } catch (err: any) {
            await LoggingService.log(deploymentId, `Rollback failed: ${err.message}`, 'error');
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
