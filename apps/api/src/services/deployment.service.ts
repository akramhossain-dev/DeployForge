import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { SSHService } from '@deployforge/vps';
import { config } from '../config/env';
import { GitHubService } from './github.service';
import { deploymentQueue } from '../utils/queue';
import { LoggingService } from './logging.service';

const encryptionService = new EncryptionService(config.ENCRYPTION_KEY);

export class DeploymentService {
    static async detectFramework(files: string[]) {
        if (files.includes('next.config.js') || files.includes('next.config.mjs')) {
            return { framework: 'NEXTJS', build: 'npm install && npm run build', start: 'npm run start' };
        }
        if (files.includes('package.json')) {
            return { framework: 'NODEJS', build: 'npm install', start: 'npm start' };
        }
        if (files.includes('requirements.txt')) {
            return { framework: 'DJANGO', build: 'pip install -r requirements.txt', start: 'python manage.py runserver 0.0.0.0:8000' };
        }
        if (files.includes('composer.json')) {
            return { framework: 'LARAVEL', build: 'composer install', start: 'php artisan serve --host=0.0.0.0' };
        }
        if (files.includes('Dockerfile')) {
            return { framework: 'DOCKER', build: 'docker build -t app .', start: 'docker run app' };
        }
        return { framework: 'STATIC', build: '', start: 'serve -s .' };
    }

    static async getAvailablePort(vpsId: string): Promise<number> {
        const usedPorts = await prisma.deployment.findMany({
            where: { vpsId, status: { in: ['RUNNING', 'BUILDING'] } },
            select: { port: true },
        });

        const usedSet = new Set(usedPorts.map(p => p.port).filter(Boolean));
        for (let port = 3000; port <= 4000; port++) {
            if (!usedSet.has(port)) return port;
        }
        throw new Error('No available ports in range 3000-4000');
    }

    static async deployFromGithub(userId: string, projectId: string, vpsId: string, branch: string) {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!project || !vps) throw new Error('Project or VPS not found');

        const githubAccount = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!githubAccount) throw new Error('GitHub account not connected');

        const [iv, tag, content] = githubAccount.accessToken.split(':');
        const accessToken = encryptionService.decrypt({ iv, tag, content });

        const port = await this.getAvailablePort(vpsId);

        const deployment = await prisma.deployment.create({
            data: {
                userId,
                projectId,
                vpsId,
                status: 'PENDING',
                port,
                name: `${project.name}-${Date.now()}`,
            },
        });

        await LoggingService.log(deployment.id, `Deployment queued for ${project.repositoryUrl} on branch ${branch}`, 'system');
        console.info('[deploy] deployment queued', { userId, deploymentId: deployment.id, projectId, vpsId, branch, port });

        // Push to Queue for processing
        await deploymentQueue.add('deploy', {
            deploymentId: deployment.id,
            projectId,
            vpsId,
            branch,
            accessToken,
        }, {
            jobId: `deploy-${projectId}-${branch}`, // Deduplication: only one pending job per project+branch
        });

        return deployment;
    }

    public static async executeDeployment(deploymentId: string, project: any, vps: any, branch: string, accessToken: string) {
        const ssh = new SSHService();
        try {
            const deployment = await prisma.deployment.findUnique({ where: { id: deploymentId } });
            if (!deployment?.port) throw new Error('Deployment port is not assigned');

            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { status: 'BUILDING' },
            });
            await LoggingService.log(deploymentId, 'Connecting to VPS for deployment', 'system');

            const auth = vps.authType === 'key' || vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
                : { password: this.decrypt(vps.encryptedPassword!) };

            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...auth,
            });

            const workDir = `/home/${vps.username}/deployments/${project.name}`;
            await ssh.execute(`mkdir -p ${workDir}`);

            // GitHub Clone with Token
            const encodedToken = encodeURIComponent(accessToken);
            const repoUrl = project.repositoryUrl.replace('https://', `https://${encodedToken}@`);
            await LoggingService.log(deploymentId, `Fetching repository branch ${branch}`, 'build');
            await ssh.execute(`cd ${workDir} && git clone -b ${branch} ${repoUrl} . || git pull origin ${branch}`);

            // Detection
            const { stdout: fileList } = await ssh.execute(`ls -F ${workDir}`);
            const files = fileList.split('\n').map(f => f.replace('*', '').replace('/', ''));
            const detected = await this.detectFramework(files);
            await LoggingService.log(deploymentId, `Detected ${detected.framework} project`, 'build');

            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { framework: detected.framework, buildCommand: detected.build, startCommand: detected.start },
            });

            // Build & Run (Simplified for now)
            const containerName = `df-${project.name}-${deploymentId.slice(0, 8)}`;

            // Generic Dockerfile if not present
            if (!files.includes('Dockerfile')) {
                let dockerfileContent = '';
                if (detected.framework === 'NEXTJS' || detected.framework === 'NODEJS') {
                    dockerfileContent = `
            FROM node:20-alpine
            WORKDIR /app
            COPY . .
            RUN ${detected.build}
            EXPOSE 3000
            CMD ${detected.start.split(' ').map(s => `"${s}"`).join(', ')}
          `;
                }
                await ssh.execute(`echo '${dockerfileContent}' > ${workDir}/Dockerfile`);
            }

            await ssh.execute(`cd ${workDir} && docker build -t ${containerName} .`);
            await ssh.execute(`docker stop ${containerName} || true && docker rm ${containerName} || true`);
            const { stdout: containerId } = await ssh.execute(`docker run -d --name ${containerName} -p ${deployment.port}:3000 ${containerName}`);

            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { status: 'RUNNING', containerId: containerId.trim() },
            });

            // Save to history
            await prisma.deploymentHistory.create({
                data: {
                    deploymentId,
                    version: branch, // Or commit hash if available
                    containerId: containerId.trim(),
                    status: 'SUCCESS',
                },
            });

            await LoggingService.log(deploymentId, 'Deployment successful', 'system');
            console.info('[deploy] deployment completed', { deploymentId, containerId: containerId.trim() });

        } catch (err: any) {
            console.error('[deploy] deployment failed', { deploymentId, message: err.message });
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { status: 'FAILED' },
            });
            await LoggingService.log(deploymentId, `Deployment failed: ${err.message}`, 'error');
        } finally {
            ssh.disconnect();
        }
    }

    static async stopDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true },
        });
        if (!deployment) throw new Error('Deployment not found');
        if (!deployment.containerId) throw new Error('Deployment has no running container');

        const ssh = new SSHService();
        try {
            const auth = deployment.vps.authType === 'key' || deployment.vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(deployment.vps.encryptedPrivateKey!) }
                : { password: this.decrypt(deployment.vps.encryptedPassword!) };
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...auth,
            });
            await ssh.execute(`docker stop ${deployment.containerId}`);
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'STOPPED' } });
            await LoggingService.log(deploymentId, 'Deployment stopped', 'system');
        } finally {
            ssh.disconnect();
        }
    }

    static async startDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true },
        });
        if (!deployment) throw new Error('Deployment not found');
        if (!deployment.containerId) throw new Error('Deployment has no existing container');

        const ssh = new SSHService();
        try {
            const auth = deployment.vps.authType === 'key' || deployment.vps.authType === 'ssh_key'
                ? { privateKey: this.decrypt(deployment.vps.encryptedPrivateKey!) }
                : { password: this.decrypt(deployment.vps.encryptedPassword!) };
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...auth,
            });
            await ssh.execute(`docker start ${deployment.containerId}`);
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'RUNNING' } });
            await LoggingService.log(deploymentId, 'Deployment started', 'system');
        } finally {
            ssh.disconnect();
        }
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }
}
