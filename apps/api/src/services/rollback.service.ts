import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { EncryptionService } from '@deployforge/security';
import { config } from '../config/env';
import { LoggingService } from './logging.service';
import { verifyDeploymentOwnership } from '../utils/authz';
import { CacheService } from './cache.service';

const encryptionService = new EncryptionService(config.encryption.key);

export class RollbackService {
    static async getHistory(deploymentId: string) {
        return await prisma.deploymentHistory.findMany({
            where: { deploymentId },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async rollback(userId: string, deploymentId: string, historyId?: string) {
        // Enforce ownership using helper
        await verifyDeploymentOwnership(userId, deploymentId);

        // Fetch deployment with relations
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, project: true },
        });
        if (!deployment) throw new Error('Deployment not found');

        const lockKey = `project-deploy:${deployment.projectId}`;
        const release = await CacheService.acquireLock(lockKey, 300000);
        if (!release) {
            throw new Error('A deployment or rollback is already running for this project. Please wait.');
        }

        try {
            const sourceType = deployment.sourceType || (deployment.project.repositoryUrl?.startsWith('upload://') ? 'upload' : 'github');
            if (sourceType !== 'github') {
                const error = new Error('Rollback is not supported for upload deployments. Restart the last successful container instead.') as Error & { errorCode?: string; stage?: string };
                error.errorCode = 'ROLLBACK_NOT_SUPPORTED';
                error.stage = 'rollback';
                throw error;
            }
            if (deployment.type === 'STATIC' || ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '')) {
                const error = new Error('Static deployments use artifact publishing and do not have container images to roll back yet.') as Error & { errorCode?: string; stage?: string };
                error.errorCode = 'STATIC_ROLLBACK_NOT_SUPPORTED';
                error.stage = 'rollback';
                throw error;
            }

            const history = historyId
                ? await prisma.deploymentHistory.findFirst({
                    where: {
                        id: historyId,
                        deploymentId: deploymentId
                    }
                })
                : await prisma.deploymentHistory.findFirst({
                    where: { deploymentId, status: 'SUCCESS', imageTag: { not: null } },
                    orderBy: { createdAt: 'desc' },
                    skip: deployment.status === 'RUNNING' ? 1 : 0,
                });
            if (!history) throw new Error('History version not found');
            if (!history.imageTag) throw new Error('History version does not contain a rollback image');

            const vps = deployment.vps;
            const ssh = new SSHService();
            try {
                const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
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
                    await removeContainerIfExists(ssh, deployment.containerId);
                }

                const containerName = `df-${deployment.project.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${deploymentId.slice(0, 8)}`;
                const appPort = ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '') ? 80 : 3000;
                await removeContainerIfExists(ssh, containerName);
                const { stdout: newContainerId } = await ssh.execute(`docker run -d --name ${shellQuote(containerName)} --restart unless-stopped --security-opt no-new-privileges --cap-drop ALL -p ${deployment.port}:${appPort} ${shellQuote(history.imageTag)}`);

                // 3. Update DB
                await prisma.deployment.update({
                    where: { id: deploymentId },
                    data: {
                        status: 'ROLLED_BACK',
                        containerId: newContainerId.trim(),
                        commitHash: history.version
                    },
                });

                await prisma.deploymentHistory.create({
                    data: {
                        deploymentId,
                        version: history.version,
                        containerId: newContainerId.trim(),
                        imageTag: history.imageTag,
                        status: 'ROLLED_BACK',
                        env: history.env,
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
        } finally {
            await release();
        }
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}

async function removeContainerIfExists(ssh: SSHService, containerIdOrName: string) {
    const inspect = await ssh.execute(`docker inspect ${shellQuote(containerIdOrName)} >/dev/null 2>&1`).catch(() => null);
    if (inspect?.code !== 0) return;
    await ssh.execute(`docker rm -f ${shellQuote(containerIdOrName)} >/dev/null 2>&1`);
}

function shellQuote(value: string | number) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}
