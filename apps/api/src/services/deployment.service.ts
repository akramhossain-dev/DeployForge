import prisma from '@deployforge/database';
import { EncryptionService } from '@deployforge/security';
import { SSHService } from '@deployforge/vps';
import { config } from '../config/env';
import { GitHubService } from './github.service';
import { deploymentQueue } from '../utils/queue';
import { LoggingService, LogType } from './logging.service';
import fs from 'node:fs/promises';
import path from 'node:path';

const encryptionService = new EncryptionService(config.encryption.key);

type DeploymentStatus = 'PENDING' | 'CLONING' | 'UPLOADING' | 'EXTRACTING' | 'BUILDING' | 'DEPLOYING' | 'RUNNING' | 'FAILED' | 'PAUSED' | 'DELETING' | 'ROLLED_BACK' | 'STOPPED' | 'DELETED';
type ProjectKind = 'DOCKER' | 'NEXTJS' | 'ASTRO' | 'VITE_REACT' | 'NODE_API' | 'NODEJS' | 'STATIC';
type SourceType = 'github' | 'upload';
type DeploymentMode = 'production' | 'sandbox';
type DeploymentRuntimeType = 'STATIC' | 'SERVER' | 'FULLSTACK';
type StaticHostingResult = {
    url: string;
    port: number | null;
    hostType: 'domain' | 'ip';
    domainActivated: boolean;
};

export type GitHubDeploymentSource = {
    type: 'github_repo';
    projectId: string;
    vpsId: string;
    branch: string;
    commitHash?: string;
    commitMessage?: string;
    accessToken?: string;
    skipWebhookRegistration?: boolean;
    domainName?: string;
    env?: Record<string, string>;
    mode?: DeploymentMode;
};

export type UploadedFileDeploymentSource = {
    type: 'uploaded_file';
    projectId: string;
    vpsId: string;
    uploadPath: string;
    originalFileName: string;
    domainName?: string;
    env?: Record<string, string>;
    mode?: DeploymentMode;
};

export type DeploymentSource = GitHubDeploymentSource | UploadedFileDeploymentSource;

type DetectedProject = {
    framework: ProjectKind;
    deploymentType: DeploymentRuntimeType;
    buildCommand: string;
    startCommand: string;
    appPort: number;
    dockerfileAlreadyPresent: boolean;
};

export class DeploymentError extends Error {
    stage: string;
    errorCode: string;

    constructor(stage: string, message: string, errorCode: string) {
        super(message);
        this.name = 'DeploymentError';
        this.stage = stage;
        this.errorCode = errorCode;
    }
}

export class DeploymentService {
    static async deployProject(userId: string, source: DeploymentSource) {
        if (source.type === 'github_repo') {
            return this.deployFromGithub(userId, source.projectId, source.vpsId, source.branch, {
                commitHash: source.commitHash,
                commitMessage: source.commitMessage,
                skipWebhookRegistration: source.skipWebhookRegistration,
                domainName: source.domainName,
                env: source.env,
                mode: source.mode,
            });
        }

        return this.deployFromUpload(userId, source.projectId, source.vpsId, {
            uploadPath: source.uploadPath,
            originalFileName: source.originalFileName,
            domainName: source.domainName,
            env: source.env,
            mode: source.mode,
        });
    }

    static async deployFromGithub(userId: string, projectId: string, vpsId: string, branch: string, metadata: { commitHash?: string; commitMessage?: string; skipWebhookRegistration?: boolean; domainName?: string; env?: Record<string, string>; mode?: DeploymentMode } = {}) {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!project || !vps) throw new DeploymentError('pending', 'Project or VPS not found', 'PROJECT_OR_VPS_NOT_FOUND');
        const mode = metadata.mode === 'sandbox' ? 'sandbox' : 'production';
        const domainName = mode === 'sandbox' ? undefined : await this.validateDomainSelection(userId, metadata.domainName);
        const encryptedEnv = this.encryptEnv(metadata.env);

        const githubAccount = await prisma.gitHubAccount.findUnique({ where: { userId } });
        if (!githubAccount) throw new DeploymentError('pending', 'GitHub account not connected', 'GITHUB_NOT_CONNECTED');

        const accessToken = this.decrypt(githubAccount.accessToken);
        const deployment = await prisma.deployment.create({
            data: {
                userId,
                projectId,
                vpsId,
                status: 'PENDING',
                port: null,
                name: `${sanitizeName(project.name)}-${Date.now()}`,
                sourceType: 'github',
                repoUrl: project.repositoryUrl,
                branch,
                uploadPath: null,
                commitHash: metadata.commitHash,
                commitMessage: metadata.commitMessage,
                env: encryptedEnv,
                domain: domainName || null,
                hostType: domainName ? 'domain' : 'ip',
                mode,
            },
        });

        if (mode === 'production' && !metadata.skipWebhookRegistration) {
            await this.ensureRepositoryWebhook(userId, project.repositoryUrl, deployment.id);
        }

        await LoggingService.log(deployment.id, mode === 'sandbox' ? `Sandbox run queued from GitHub for ${project.repositoryUrl} on branch ${branch}` : `Deployment queued from GitHub for ${project.repositoryUrl} on branch ${branch}`, 'system');
        await deploymentQueue.add('deploy', {
            deploymentId: deployment.id,
            source: {
                type: 'github_repo',
                projectId,
                vpsId,
                branch,
                accessToken,
                commitHash: metadata.commitHash,
                commitMessage: metadata.commitMessage,
                domainName,
                env: metadata.env,
                mode,
            } satisfies GitHubDeploymentSource,
        }, {
            jobId: `${mode === 'sandbox' ? 'sandbox' : 'deploy'}-${projectId}-${branch}-${Date.now()}`,
        });

        return deployment;
    }

    static async deployFromUpload(userId: string, projectId: string, vpsId: string, upload: { uploadPath: string; originalFileName: string; domainName?: string; env?: Record<string, string>; mode?: DeploymentMode }) {
        const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!project || !vps) throw new DeploymentError('uploading', 'Project or VPS not found', 'PROJECT_OR_VPS_NOT_FOUND');
        const mode = upload.mode === 'sandbox' ? 'sandbox' : 'production';
        const domainName = mode === 'sandbox' ? undefined : await this.validateDomainSelection(userId, upload.domainName);
        const encryptedEnv = this.encryptEnv(upload.env);

        this.validateUploadFile(upload.originalFileName);
        const deployment = await prisma.deployment.create({
            data: {
                userId,
                projectId,
                vpsId,
                status: 'PENDING',
                port: null,
                name: `${sanitizeName(project.name)}-${Date.now()}`,
                sourceType: 'upload',
                repoUrl: null,
                branch: null,
                uploadPath: upload.originalFileName,
                commitHash: null,
                env: encryptedEnv,
                domain: domainName || null,
                hostType: domainName ? 'domain' : 'ip',
                mode,
            },
        });

        const uploadWorkspace = await this.prepareUploadWorkspace(deployment.id, upload.uploadPath, upload.originalFileName);
        await prisma.deployment.update({
            where: { id: deployment.id },
            data: { uploadPath: uploadWorkspace.archivePath },
        });

        await LoggingService.log(deployment.id, mode === 'sandbox' ? `Sandbox run queued from uploaded archive ${upload.originalFileName}` : `Deployment queued from uploaded archive ${upload.originalFileName}`, 'system');
        await deploymentQueue.add('deploy', {
            deploymentId: deployment.id,
            source: {
                type: 'uploaded_file',
                projectId,
                vpsId,
                uploadPath: uploadWorkspace.archivePath,
                originalFileName: uploadWorkspace.archiveName,
                domainName,
                env: upload.env,
                mode,
            } satisfies UploadedFileDeploymentSource,
        }, {
            jobId: `${mode === 'sandbox' ? 'sandbox-upload' : 'deploy-upload'}-${projectId}-${Date.now()}`,
        });

        return deployment;
    }

    static async executeDeployment(deploymentId: string, source: DeploymentSource) {
        const deployment = await prisma.deployment.findUnique({
            where: { id: deploymentId },
            include: { project: true, vps: true },
        });
        if (!deployment) throw new DeploymentError('pending', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        this.assertSourceMatches(deployment.sourceType as SourceType, source);

        const ssh = new SSHService();
        const project = deployment.project;
        const vps = deployment.vps;
        const safeProjectName = sanitizeName(project.name);
        const releaseId = `${Date.now()}-${deploymentId.slice(0, 8)}`;
        const baseDir = `/home/${shellPath(vps.username)}/deployforge/${safeProjectName}`;
        const releasesDir = `${baseDir}/releases`;
        const workDir = `${releasesDir}/${releaseId}`;
        const staticDir = `${baseDir}/static/${releaseId}`;
        const currentLink = `${baseDir}/current`;
        const currentStaticLink = `${baseDir}/static/current`;
        const dockerName = `df-${safeProjectName}-${deploymentId.slice(0, 8)}`;
        const imageTag = `deployforge/${safeProjectName}:${releaseId}`;
        const domainName = source.domainName?.trim();
        const isSandbox = deployment.mode === 'sandbox' || source.mode === 'sandbox';
        let createdContainerId = '';
        let routingAttempted = false;
        let staticHosting: StaticHostingResult | null = null;

        try {
            await this.setStatus(deploymentId, source.type === 'github_repo' ? 'CLONING' : 'UPLOADING');
            await LoggingService.log(deploymentId, 'Connecting to VPS deployment target', 'system');
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...this.getVpsAuth(vps),
            });

            await this.run(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(releasesDir)} ${shellQuote(baseDir)}`);

            if (source.type === 'github_repo') {
                await this.prepareGithubSource(ssh, deploymentId, source, project.repositoryUrl, workDir);
            } else {
                await this.setStatus(deploymentId, 'EXTRACTING');
                await this.prepareUploadedSource(ssh, deploymentId, source, workDir);
            }

            await this.normalizeProjectRoot(ssh, deploymentId, workDir);
            await this.run(ssh, deploymentId, 'system', `ln -sfn ${shellQuote(workDir)} ${shellQuote(currentLink)}`);
            await LoggingService.log(deploymentId, 'Validating project structure', 'build');
            const detected = await this.detectProject(ssh, deploymentId, workDir);
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    framework: detected.framework,
                    type: detected.deploymentType,
                    buildCommand: detected.buildCommand,
                    startCommand: detected.startCommand,
                },
            });

            const hasEnv = await this.injectEnvironment(ssh, deploymentId, workDir, deployment.env);
            await this.setStatus(deploymentId, 'BUILDING');
            if (detected.deploymentType === 'STATIC') {
                await LoggingService.log(deploymentId, 'Building static artifact without Docker', 'build');
                await this.buildStaticArtifact(ssh, deploymentId, workDir, staticDir, detected, hasEnv);

                await this.setStatus(deploymentId, 'DEPLOYING');
                await this.run(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(`${baseDir}/static`)} && ln -sfn ${shellQuote(staticDir)} ${shellQuote(currentStaticLink)}`);
                await LoggingService.log(deploymentId, isSandbox ? 'Publishing sandbox static artifact' : 'Publishing static artifact through shared static hosting', 'system');
                routingAttempted = true;
                staticHosting = await this.configureStaticHosting(ssh, deploymentId, domainName || vps.ipAddress, staticDir, Boolean(domainName), vps.ipAddress);
                if (domainName && staticHosting.domainActivated) {
                    await this.persistDomainBinding(deploymentId, vps.id, domainName);
                }
                await this.healthCheckStatic(ssh, deploymentId, staticHosting);
            } else {
                const port = deployment.port || await this.getAvailablePort(deployment.vpsId, vps);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { port } });
                deployment.port = port;
                await LoggingService.log(deploymentId, 'Building deployment image', 'build');
                await this.buildImage(ssh, deploymentId, workDir, imageTag, detected);

                await this.setStatus(deploymentId, 'DEPLOYING');
                await LoggingService.log(deploymentId, isSandbox ? 'Creating sandbox container' : 'Creating deployment container', 'system');
                await this.assertRemotePortAvailable(ssh, deploymentId, port);
                createdContainerId = await this.deployContainer(ssh, deploymentId, workDir, dockerName, imageTag, port, detected.appPort, hasEnv);
                await LoggingService.log(deploymentId, `Container started: ${createdContainerId.slice(0, 12)}`, 'system');
                if (!isSandbox) {
                    routingAttempted = true;
                    await this.configureNginx(ssh, deploymentId, domainName || vps.ipAddress, port, Boolean(domainName));
                    if (domainName) {
                        await this.persistDomainBinding(deploymentId, vps.id, domainName);
                    }
                } else {
                    await LoggingService.log(deploymentId, `Sandbox direct port mode active at http://${vps.ipAddress}:${port}`, 'system', 'warn');
                }
                await this.healthCheck(ssh, deploymentId, port);
            }

            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    status: 'RUNNING',
                    containerId: createdContainerId || null,
                    port: staticHosting ? staticHosting.port : deployment.port,
                    domain: staticHosting?.domainActivated ? domainName || null : detected.deploymentType === 'STATIC' ? null : deployment.domain,
                    hostType: staticHosting ? staticHosting.hostType : deployment.hostType,
                    commitHash: source.type === 'github_repo' ? source.commitHash : deployment.commitHash,
                    commitMessage: source.type === 'github_repo' ? source.commitMessage : deployment.commitMessage,
                    lastStableVersion: detected.deploymentType === 'STATIC' ? releaseId : isSandbox ? imageTag : source.type === 'github_repo' ? source.commitHash || source.branch : releaseId,
                },
            });

            if (!isSandbox) {
                await prisma.deploymentHistory.create({
                    data: {
                        deploymentId,
                        version: source.type === 'github_repo' ? source.commitHash || source.branch : releaseId,
                        containerId: createdContainerId || null,
                        imageTag: detected.deploymentType === 'STATIC' ? null : imageTag,
                        status: 'SUCCESS',
                        env: deployment.env,
                    },
                });
                await LoggingService.log(deploymentId, detected.deploymentType === 'STATIC' ? 'Static deployment running through shared nginx' : `Deployment running on port ${deployment.port}`, 'system');
            } else {
                await LoggingService.log(deploymentId, detected.deploymentType === 'STATIC' ? 'Static sandbox running through shared nginx; auto cleanup scheduled in 30 minutes' : `Sandbox running on port ${deployment.port}; auto cleanup scheduled in 30 minutes`, 'system');
                await deploymentQueue.add('sandbox-cleanup', { deploymentId }, {
                    jobId: `sandbox-cleanup-${deploymentId}`,
                    delay: 30 * 60 * 1000,
                    attempts: 1,
                });
            }
        } catch (err: any) {
            const stage = err.stage || 'deploying';
            const message = err.message || 'Deployment failed';
            if (createdContainerId) {
                await this.captureContainerLogs(ssh, deploymentId, createdContainerId);
                await this.removeContainerQuietly(ssh, deploymentId, createdContainerId);
            }
            if (isSandbox) {
                await this.cleanupDeploymentWorkspace(deploymentId, source.type === 'uploaded_file' ? source.uploadPath : undefined);
                await this.removeImageIfExists(ssh, imageTag);
            }
            if (routingAttempted) {
                await this.cleanupNginx(ssh, deploymentId, domainName ? [domainName] : []);
                if (domainName) {
                    await prisma.domain.updateMany({ where: { deploymentId }, data: { status: 'DELETED' } });
                }
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null, domain: null, hostType: 'ip' } });
            await LoggingService.log(deploymentId, `Deployment failed during ${stage}: ${message}`, 'error', 'error');
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    static async getAvailablePort(vpsId: string, vps?: any): Promise<number> {
        const usedPorts = await prisma.deployment.findMany({
            where: { vpsId, status: { in: ['RUNNING', 'BUILDING', 'DEPLOYING', 'PENDING', 'CLONING', 'UPLOADING', 'EXTRACTING'] } },
            select: { port: true },
        });

        const usedSet = new Set(usedPorts.map((deployment) => deployment.port).filter(Boolean));
        if (vps) {
            for (const port of await this.getRemoteUsedPorts(vps)) usedSet.add(port);
        }

        for (let port = 3000; port <= 9000; port++) {
            if (!usedSet.has(port)) return port;
        }
        throw new DeploymentError('port_alloc', 'No available ports in range 3000-9000', 'NO_AVAILABLE_PORT');
    }

    static async detectFramework(files: string[]) {
        if (files.includes('Dockerfile')) return { framework: 'DOCKER', build: 'docker build', start: 'docker run' };
        if (files.includes('next.config.js') || files.includes('next.config.mjs') || files.includes('next.config.ts')) return { framework: 'NEXTJS', build: 'npm ci && npm run build', start: 'npm run start' };
        if (files.includes('package.json')) return { framework: 'NODEJS', build: 'npm ci || npm install', start: 'npm start' };
        if (files.includes('index.html')) return { framework: 'STATIC', build: '', start: 'nginx' };
        return { framework: 'STATIC', build: '', start: 'nginx' };
    }

    static async stopDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, project: true },
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        if (deployment.mode === 'sandbox') {
            return this.deleteDeployment(userId, deploymentId);
        }
        this.assertLifecycleTransition(deployment.status, 'STOPPED');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });
            if (this.isStaticDeployment(deployment)) {
                await this.cleanupNginx(ssh, deploymentId, []);
            } else {
                if (!deployment.containerId) throw new DeploymentError('deploying', 'Deployment has no running container', 'NO_RUNNING_CONTAINER');
                await this.stopContainerIfExists(ssh, deploymentId, deployment.containerId);
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'STOPPED' } });
            await this.logLifecycle(deploymentId, userId, 'deployment_stopped', 'success');
        } finally {
            ssh.disconnect();
        }
    }

    static async pauseDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, project: true },
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        this.assertLifecycleTransition(deployment.status, 'PAUSED');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });
            if (this.isStaticDeployment(deployment)) {
                await this.cleanupNginx(ssh, deploymentId, []);
            } else {
                if (!deployment.containerId) throw new DeploymentError('deploying', 'Deployment has no running container', 'NO_RUNNING_CONTAINER');
                if (!(await this.containerExists(ssh, deployment.containerId))) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                    throw new DeploymentError('container_sync', 'Container reference is missing on the server.', 'CONTAINER_NOT_FOUND');
                }
                await this.run(ssh, deploymentId, 'system', `docker pause ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_PAUSE_FAILED');
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'PAUSED' } });
            await this.logLifecycle(deploymentId, userId, 'deployment_paused', 'success');
        } finally {
            ssh.disconnect();
        }
    }

    static async deleteDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, domains: true, history: true, project: true },
        });
        if (!deployment) throw new DeploymentError('delete', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        if (deployment.status === 'DELETED') return { success: true, deleted: true };
        if (deployment.status === 'DELETING') return { success: true, deleting: true };
        this.assertLifecycleTransition(deployment.status, 'DELETING');

        const ssh = new SSHService();
        try {
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'DELETING' } });
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });

            await LoggingService.log(deploymentId, 'Deleting deployment resources', 'system');
            if (deployment.containerId) {
                await this.removeContainerIfExists(ssh, deploymentId, deployment.containerId, 'Removed deployment container');
            }
            const imageTags = Array.from(new Set([
                ...deployment.history.map((item: any) => item.imageTag).filter(Boolean),
                deployment.lastStableVersion?.startsWith('deployforge/') ? deployment.lastStableVersion : null,
            ].filter(Boolean)));
            for (const imageTag of imageTags) {
                await this.removeImageIfExists(ssh, imageTag);
            }
            await this.cleanupNginx(ssh, deploymentId, deployment.domains.map((domain: any) => domain.domainName));
            await this.cleanupRemoteWorkspace(ssh, deployment);
            await this.cleanupDeploymentWorkspace(deploymentId, deployment.uploadPath);

            await this.logLifecycle(deploymentId, userId, 'deployment_deleted', 'success');
            await prisma.$transaction([
                prisma.deploymentJob.deleteMany({ where: { deploymentId } }),
                prisma.deploymentLog.deleteMany({ where: { deploymentId } }),
                prisma.log.deleteMany({ where: { deploymentId } }),
                prisma.deploymentSandbox.deleteMany({ where: { deploymentId } }),
                prisma.deploymentHistory.deleteMany({ where: { deploymentId } }),
                prisma.domain.deleteMany({ where: { deploymentId } }),
                prisma.deployment.delete({ where: { id: deploymentId } }),
            ]);
            return { success: true, deleted: true };
        } catch (err: any) {
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { status: deployment.status === 'DELETING' ? 'FAILED' : deployment.status },
            }).catch(() => undefined);
            await LoggingService.log(deploymentId, `Delete failed: ${err.message}`, 'error', 'error').catch(() => undefined);
            if (err instanceof DeploymentError) throw err;
            throw new DeploymentError('delete', err.message || 'Delete cleanup failed', 'DELETE_CLEANUP_FAILED');
        } finally {
            ssh.disconnect();
        }
    }

    static async resumeDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, domains: true, project: true, history: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        this.assertLifecycleTransition(deployment.status, 'RUNNING');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });
            if (this.isStaticDeployment(deployment)) {
                const staticDir = this.staticArtifactDir(deployment, deployment.lastStableVersion || deployment.history[0]?.version);
                const exists = await ssh.execute(`test -f ${shellQuote(`${staticDir}/index.html`)}`).catch(() => null);
                if (exists?.code !== 0) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED' } });
                    throw new DeploymentError('static_hosting', 'Static artifact snapshot is missing on the server.', 'STATIC_ARTIFACT_NOT_FOUND');
                }
                const host = deployment.domain || deployment.vps.ipAddress;
                const staticHosting = await this.configureStaticHosting(ssh, deploymentId, host, staticDir, deployment.hostType === 'domain', deployment.vps.ipAddress);
                await this.healthCheckStatic(ssh, deploymentId, staticHosting);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { port: staticHosting.port, domain: staticHosting.domainActivated ? deployment.domain : null, hostType: staticHosting.hostType } });
            } else if (deployment.containerId && await this.containerExists(ssh, deployment.containerId)) {
                if (deployment.status === 'PAUSED') {
                    await this.run(ssh, deploymentId, 'system', `docker unpause ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
                } else {
                    await this.run(ssh, deploymentId, 'system', `docker start ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
                }
                await this.verifyContainerRunningOnly(ssh, deploymentId, deployment.containerId);
            } else if (deployment.history[0]?.imageTag) {
                const port = await this.getAvailablePort(deployment.vpsId, deployment.vps);
                const safeProjectName = sanitizeName(deployment.project.name);
                const dockerName = `df-${safeProjectName}-${deploymentId.slice(0, 8)}`;
                const appPort = ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '') ? 80 : 3000;
                const resumeDir = `/tmp/deployforge-resume-${deploymentId}`;
                await this.run(ssh, deploymentId, 'system', `rm -rf ${shellQuote(resumeDir)} && mkdir -p ${shellQuote(resumeDir)}`);
                const hasEnv = await this.injectEnvironment(ssh, deploymentId, resumeDir, deployment.env);
                const containerId = await this.deployContainer(ssh, deploymentId, resumeDir, dockerName, deployment.history[0].imageTag!, port, appPort, hasEnv);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { containerId, port } });
                deployment.containerId = containerId;
                deployment.port = port;
                await this.run(ssh, deploymentId, 'system', `rm -rf ${shellQuote(resumeDir)}`).catch(() => undefined);
            } else {
                await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                throw new DeploymentError('container_sync', 'Container reference is missing and no successful image snapshot is available.', 'CONTAINER_NOT_FOUND');
            }

            const host = deployment.domain || deployment.vps.ipAddress;
            if (!this.isStaticDeployment(deployment) && deployment.port) {
                await this.configureNginx(ssh, deploymentId, host, deployment.port, deployment.hostType === 'domain');
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'RUNNING' } });
            await this.logLifecycle(deploymentId, userId, deployment.status === 'PAUSED' ? 'deployment_resumed' : 'deployment_started', 'success');
            return { success: true };
        } finally {
            ssh.disconnect();
        }
    }

    static async startDeployment(userId: string, deploymentId: string) {
        return this.resumeDeployment(userId, deploymentId);
    }

    static async restartDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, project: true },
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        if (!this.isStaticDeployment(deployment) && !deployment.containerId) {
            throw new DeploymentError('deploying', 'No active container found. Deployment was never started successfully.', 'NO_CONTAINER');
        }
        if (deployment.status !== 'RUNNING') {
            throw new DeploymentError('deploying', 'Deployment not running yet', 'DEPLOYMENT_NOT_RUNNING');
        }

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'DEPLOYING' } });
            if (this.isStaticDeployment(deployment)) {
                await LoggingService.log(deploymentId, 'Refreshing static deployment routing', 'system');
                const staticDir = this.staticArtifactDir(deployment, deployment.lastStableVersion);
                const exists = await ssh.execute(`test -f ${shellQuote(`${staticDir}/index.html`)}`).catch(() => null);
                if (exists?.code !== 0) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED' } });
                    throw new DeploymentError('static_hosting', 'Static artifact snapshot is missing on the server.', 'STATIC_ARTIFACT_NOT_FOUND');
                }
                const host = deployment.domain || deployment.vps.ipAddress;
                const staticHosting = await this.configureStaticHosting(ssh, deploymentId, host, staticDir, deployment.hostType === 'domain', deployment.vps.ipAddress);
                await this.healthCheckStatic(ssh, deploymentId, staticHosting);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { port: staticHosting.port, domain: staticHosting.domainActivated ? deployment.domain : null, hostType: staticHosting.hostType } });
            } else {
                await LoggingService.log(deploymentId, 'Restarting deployment container', 'system');
                const inspect = await ssh.execute(`docker inspect ${shellQuote(deployment.containerId!)} >/dev/null 2>&1`);
                if (inspect.code !== 0) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                    throw new DeploymentError('container_sync', 'Container reference is missing on the server.', 'CONTAINER_NOT_FOUND');
                }
                await this.run(ssh, deploymentId, 'system', `docker restart ${shellQuote(deployment.containerId!)}`, 'deploying', 'DOCKER_RESTART_FAILED');
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'RUNNING' } });
            await LoggingService.log(deploymentId, this.isStaticDeployment(deployment) ? 'Static deployment routing refreshed' : 'Deployment container restarted', 'system');
        } catch (err: any) {
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED' } });
            await LoggingService.log(deploymentId, `Restart failed: ${err.message}`, 'error', 'error');
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    static async getStatus(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: {
                project: true,
                vps: true,
                domains: true,
                deploymentLogs: { take: 25, orderBy: { createdAt: 'desc' } },
                history: { take: 5, orderBy: { createdAt: 'desc' } },
            },
        });
        if (!deployment) throw new DeploymentError('status', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        return deployment;
    }

    private static async ensureRepositoryWebhook(userId: string, repositoryUrl: string, deploymentId?: string) {
        const repoFullName = extractRepoFullName(repositoryUrl);
        if (!repoFullName) return;

        const account = await prisma.gitHubAccount.findUnique({
            where: { userId },
            include: { repositories: true },
        });
        const repository = account?.repositories.find((repo) => repo.fullName === repoFullName);
        if (repository?.webhookId) return;

        try {
            await GitHubService.createWebhook(userId, repoFullName);
        } catch (err: any) {
            const message = `GitHub webhook registration skipped: ${err.message}`;
            if (deploymentId) {
                await LoggingService.log(deploymentId, message, 'system', 'warn');
                return;
            }
            console.warn('[deploy:webhook]', message);
        }
    }

    private static async prepareGithubSource(ssh: SSHService, deploymentId: string, source: GitHubDeploymentSource, repositoryUrl: string, workDir: string) {
        if (!source.accessToken) throw new DeploymentError('cloning', 'Missing GitHub access token', 'MISSING_GITHUB_TOKEN');
        const repoUrl = repositoryUrl.replace(/^https:\/\//, `https://${encodeURIComponent(source.accessToken)}@`);
        await LoggingService.log(deploymentId, `Cloning branch ${source.branch}`, 'build');
        await this.run(ssh, deploymentId, 'build', `rm -rf ${shellQuote(workDir)} && git clone --depth 1 -b ${shellQuote(source.branch)} ${shellQuote(repoUrl)} ${shellQuote(workDir)}`, 'cloning', 'GIT_CLONE_FAILED');
    }

    private static async prepareUploadedSource(ssh: SSHService, deploymentId: string, source: UploadedFileDeploymentSource, workDir: string) {
        this.validateUploadFile(source.originalFileName);
        await this.verifyLocalUploadWorkspace(source.uploadPath);
        const archiveName = sanitizeFileName(source.originalFileName);
        const remoteArchive = `${workDir}.archive/${archiveName}`;
        await LoggingService.log(deploymentId, `Uploading ${source.originalFileName}`, 'build');
        await this.run(ssh, deploymentId, 'build', `rm -rf ${shellQuote(workDir)} ${shellQuote(`${workDir}.archive`)} && mkdir -p ${shellQuote(`${workDir}.archive`)}`);
        await ssh.uploadFile(source.uploadPath, remoteArchive);
        await LoggingService.log(deploymentId, 'Extracting uploaded archive', 'build');
        await this.run(ssh, deploymentId, 'build', safeExtractCommand(remoteArchive, workDir), 'upload_extract', 'UPLOAD_EXTRACT_FAILED');
        await this.run(ssh, deploymentId, 'build', `test "$(find ${shellQuote(workDir)} -mindepth 1 -maxdepth 8 | wc -l)" -gt 0`, 'upload_extract', 'UPLOAD_EMPTY');
        await fs.writeFile(path.join(path.dirname(source.uploadPath), '.extracted'), new Date().toISOString(), { mode: 0o600 }).catch(() => undefined);
        await this.run(ssh, deploymentId, 'build', `rm -f ${shellQuote(remoteArchive)}`, 'upload_extract', 'UPLOAD_REMOTE_CLEANUP_FAILED');
    }

    private static async normalizeProjectRoot(ssh: SSHService, deploymentId: string, workDir: string) {
        const command = `cd ${shellQuote(workDir)} && if [ ! -f package.json ] && [ ! -f Dockerfile ] && [ ! -f index.html ]; then child_count=$(find . -mindepth 1 -maxdepth 1 -type d | wc -l); file_count=$(find . -mindepth 1 -maxdepth 1 -type f | wc -l); if [ "$child_count" = "1" ] && [ "$file_count" = "0" ]; then child=$(find . -mindepth 1 -maxdepth 1 -type d | head -n 1); mkdir .deployforge-flatten; find "$child" -mindepth 1 -maxdepth 1 -exec mv {} .deployforge-flatten/ \\; ; rmdir "$child"; find .deployforge-flatten -mindepth 1 -maxdepth 1 -exec mv {} . \\; ; rmdir .deployforge-flatten; echo "Normalized single-folder project archive"; fi; fi`;
        await this.run(ssh, deploymentId, 'build', command, 'building', 'WORKSPACE_NORMALIZE_FAILED');
    }

    private static async detectProject(ssh: SSHService, deploymentId: string, workDir: string): Promise<DetectedProject> {
        const { stdout } = await this.run(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && find . -maxdepth 3 -type f | sed 's#^./##'`);
        const files = stdout.split('\n').map((item) => item.trim()).filter(Boolean);
        if (files.length === 0) {
            throw new DeploymentError('building', 'Deployment workspace does not contain project files', 'WORKSPACE_NOT_FOUND');
        }
        const rootFiles = files.filter((file) => !file.includes('/'));
        const rootFileSet = new Set(rootFiles);
        const hasDockerfile = rootFiles.includes('Dockerfile');
        const hasPackageJson = rootFileSet.has('package.json');
        const hasNextConfig = rootFiles.some((file) => /^next\.config\./.test(file));

        if (hasDockerfile) {
            await LoggingService.log(deploymentId, 'Detected Docker project', 'build');
            return { framework: 'DOCKER', deploymentType: 'SERVER', buildCommand: 'docker build', startCommand: 'docker run', appPort: 3000, dockerfileAlreadyPresent: true };
        }

        if (!hasPackageJson) {
            const hasStaticEntry = rootFileSet.has('index.html') || files.some((file) => /\.html?$/i.test(file));
            if (!hasStaticEntry) {
                throw new DeploymentError('building', 'Project type could not be detected. package.json, Dockerfile, or static HTML entrypoint is required.', 'PROJECT_TYPE_MISMATCH');
            }
            await LoggingService.log(deploymentId, 'Detected static HTML project', 'build');
            return { framework: 'STATIC', deploymentType: 'STATIC', buildCommand: '', startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false };
        }

        const { stdout: pkgRaw } = await this.run(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && python3 - <<'PY'\nimport json\nwith open('package.json') as f:\n    p=json.load(f)\ndeps={}\ndeps.update(p.get('dependencies') or {})\ndeps.update(p.get('devDependencies') or {})\nprint(json.dumps({'scripts': p.get('scripts') or {}, 'deps': deps, 'main': p.get('main') or ''}))\nPY`, 'building', 'PACKAGE_PARSE_FAILED');
        let pkg: { scripts: Record<string, string>; deps: Record<string, string>; main?: string };
        try {
            pkg = JSON.parse(pkgRaw.trim());
        } catch {
            throw new DeploymentError('building', 'package.json could not be parsed', 'PACKAGE_PARSE_FAILED');
        }

        const scriptValues = [...Object.keys(pkg.scripts || {}), ...Object.values(pkg.scripts || {})];
        const scriptHasNext = scriptValues.some((script) => /\bnext\b/.test(script));
        if (pkg.deps.next || hasNextConfig || scriptHasNext) {
            const startCommand = pkg.scripts.start ? 'npm run start' : 'npx next start -H 0.0.0.0 -p 3000';
            await LoggingService.log(deploymentId, 'Detected Next.js project; using Node runtime', 'build');
            return { framework: 'NEXTJS', deploymentType: 'FULLSTACK', buildCommand: 'npm ci && npm run build', startCommand, appPort: 3000, dockerfileAlreadyPresent: false };
        }
        if (pkg.deps.astro || scriptValues.some((script) => /\bastro\b/.test(script))) {
            await LoggingService.log(deploymentId, 'Detected Astro/static project; using static file runtime', 'build');
            return { framework: 'ASTRO', deploymentType: 'STATIC', buildCommand: pkg.scripts.build ? 'npm ci && npm run build' : 'npm ci', startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false };
        }
        if (pkg.deps.vite || pkg.deps['@vitejs/plugin-react'] || pkg.deps.react) {
            await LoggingService.log(deploymentId, 'Detected Vite/React static project; using static file runtime', 'build');
            return { framework: 'VITE_REACT', deploymentType: 'STATIC', buildCommand: 'npm ci && npm run build', startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false };
        }
        if (pkg.deps.express || pkg.deps.fastify || pkg.scripts.start || pkg.scripts.dev || pkg.main) {
            const framework = pkg.deps.fastify ? 'FASTIFY' : pkg.deps.express ? 'EXPRESS' : 'NODE_API';
            await LoggingService.log(deploymentId, `Detected ${framework.toLowerCase()} project; using Node runtime`, 'build');
            return { framework: 'NODE_API', deploymentType: 'SERVER', buildCommand: pkg.scripts.build ? 'npm ci && npm run build' : 'npm ci', startCommand: pkg.scripts.start ? 'npm run start' : runtimeResolverCommand(), appPort: 3000, dockerfileAlreadyPresent: false };
        }
        await LoggingService.log(deploymentId, 'Project type is ambiguous; defaulting to static file runtime', 'build');
        return { framework: 'VITE_REACT', deploymentType: 'STATIC', buildCommand: pkg.scripts.build ? 'npm ci && npm run build' : 'npm ci', startCommand: 'nginx static mount', appPort: 80, dockerfileAlreadyPresent: false };
    }

    private static async injectEnvironment(ssh: SSHService, deploymentId: string, workDir: string, encryptedEnv?: string | null) {
        if (!encryptedEnv) {
            await LoggingService.log(deploymentId, 'No deployment environment variables configured', 'system');
            return false;
        }

        let env: Record<string, string>;
        try {
            env = this.normalizeEnv(JSON.parse(this.decrypt(encryptedEnv)));
        } catch {
            throw new DeploymentError('building', 'Deployment environment variables are invalid', 'ENV_DECRYPT_FAILED');
        }

        const lines = Object.entries(env).map(([key, value]) => `${key}=${value}`);

        if (lines.length === 0) {
            await LoggingService.log(deploymentId, 'No deployment environment variables configured', 'system');
            return false;
        }

        await this.run(ssh, deploymentId, 'system', `cat > ${shellQuote(`${workDir}/.env.deployforge`)} <<'EOF'\n${lines.join('\n')}\nEOF\nchmod 600 ${shellQuote(`${workDir}/.env.deployforge`)}`);
        await LoggingService.log(deploymentId, `Injected ${lines.length} environment variables`, 'system');
        return true;
    }

    private static async buildImage(ssh: SSHService, deploymentId: string, workDir: string, imageTag: string, detected: DetectedProject) {
        if (!detected.dockerfileAlreadyPresent) {
            await this.run(ssh, deploymentId, 'build', `cat > ${shellQuote(`${workDir}/Dockerfile`)} <<'EOF'\n${generatedDockerfile(detected)}\nEOF`);
        }

        await this.run(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && docker build --pull -t ${shellQuote(imageTag)} .`, 'building', 'DOCKER_BUILD_FAILED');
    }

    private static async buildStaticArtifact(ssh: SSHService, deploymentId: string, workDir: string, staticDir: string, detected: DetectedProject, hasEnv: boolean) {
        const envPrefix = hasEnv ? 'set -a && . ./.env.deployforge && set +a && ' : '';
        const buildCommand = detected.buildCommand
            ? `if [ -f package.json ]; then command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 || { echo "Node.js and npm are required to build this static project on the deployment worker"; exit 42; }; (npm ci || npm install) && if node -e "const p=require('./package.json'); process.exit(p.scripts&&p.scripts.build?0:1)" 2>/dev/null; then ${envPrefix}npm run build; fi; fi`
            : 'true';
        const publishCommand = `rm -rf ${shellQuote(staticDir)} && mkdir -p ${shellQuote(staticDir)} && cd ${shellQuote(workDir)} && ${buildCommand} && if [ -d dist ]; then cp -a dist/. ${shellQuote(staticDir)}/; elif [ -d build ]; then cp -a build/. ${shellQuote(staticDir)}/; elif [ -d out ]; then cp -a out/. ${shellQuote(staticDir)}/; elif [ -d public ] && find public -maxdepth 2 -name index.html | grep -q .; then cp -a public/. ${shellQuote(staticDir)}/; elif [ -f index.html ]; then cp -a . ${shellQuote(staticDir)}/; else echo "No static artifact found. Expected dist/, build/, out/, public/index.html, or index.html"; exit 43; fi && test -f ${shellQuote(`${staticDir}/index.html`)}`;
        try {
            await this.run(ssh, deploymentId, 'build', publishCommand, 'building', 'STATIC_BUILD_FAILED');
        } catch (err: any) {
            if (String(err.message || '').includes('exit code 42')) {
                throw new DeploymentError('building', 'Static build worker is missing Node.js or npm', 'STATIC_BUILD_RUNTIME_MISSING');
            }
            if (String(err.message || '').includes('exit code 43')) {
                throw new DeploymentError('building', 'Static build completed but no deployable artifact was found', 'STATIC_ARTIFACT_NOT_FOUND');
            }
            throw err;
        }
        await LoggingService.log(deploymentId, `Static artifact published to ${staticDir}`, 'build');
    }

    private static async deployContainer(ssh: SSHService, deploymentId: string, workDir: string, dockerName: string, imageTag: string, hostPort: number, appPort: number, hasEnv: boolean) {
        await this.removeContainerIfExists(ssh, deploymentId, dockerName, 'Removed previous container with matching Docker name', false);
        const envFlag = hasEnv ? ` --env-file ${shellQuote(`${workDir}/.env.deployforge`)}` : '';
        const createCommand = `docker create --name ${shellQuote(dockerName)} --restart unless-stopped --read-only --tmpfs /tmp:rw,noexec,nosuid,size=128m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=64m --tmpfs /var/run:rw,noexec,nosuid,size=16m --security-opt no-new-privileges --cap-drop ALL -p ${hostPort}:${appPort}${envFlag} ${shellQuote(imageTag)}`;
        const { stdout } = await this.run(ssh, deploymentId, 'system', createCommand, 'container_create', 'DOCKER_CREATE_FAILED');
        const createdId = stdout.trim();
        if (!/^[a-f0-9]{12,64}$/i.test(createdId)) {
            throw new DeploymentError('container_create', 'Docker did not return a valid container ID', 'INVALID_CONTAINER_ID');
        }

        try {
            const { stdout: createdState } = await this.run(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Status}}' ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_NOT_CREATED');
            if (createdState.trim() !== 'created') {
                throw new DeploymentError('container_create', 'Container was not created cleanly before start', 'CONTAINER_START_FAILED');
            }

            await this.run(ssh, deploymentId, 'system', `docker start ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_START_FAILED');
            const { stdout: fullId } = await this.run(ssh, deploymentId, 'system', `docker inspect --format '{{.Id}}' ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_NOT_CREATED');
            const containerId = fullId.trim();
            if (!/^[a-f0-9]{64}$/i.test(containerId)) {
                throw new DeploymentError('container_create', 'Docker inspect returned an invalid container ID', 'INVALID_CONTAINER_ID');
            }
            await this.verifyContainerRuntime(ssh, deploymentId, containerId, hostPort, appPort);
            return containerId;
        } catch (err) {
            await this.captureContainerLogs(ssh, deploymentId, createdId);
            await this.removeContainerQuietly(ssh, deploymentId, createdId);
            throw err;
        }
    }

    private static async verifyContainerRuntime(ssh: SSHService, deploymentId: string, containerId: string, hostPort: number, appPort: number) {
        if (!/^[a-f0-9]{64}$/i.test(containerId)) {
            throw new DeploymentError('container_create', 'Invalid Docker container ID', 'INVALID_CONTAINER_ID');
        }

        const { stdout: state } = await this.run(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.State.Status}}' ${shellQuote(containerId)}`, 'container_create', 'CONTAINER_START_FAILED');
        const [running, restarting, status] = state.trim().split(/\s+/);
        if (running !== 'true' || restarting === 'true' || status === 'restarting') {
            throw new DeploymentError('container_create', 'Container was created but did not reach a stable running state', 'CONTAINER_START_FAILED');
        }

        await this.run(ssh, deploymentId, 'system', `docker top ${shellQuote(containerId)} >/dev/null`, 'container_create', 'CONTAINER_START_FAILED');
        const portCommand = `docker port ${shellQuote(containerId)} ${appPort}/tcp | grep -Eq '(^|:)${hostPort}$'`;
        await this.run(ssh, deploymentId, 'system', portCommand, 'container_create', 'CONTAINER_PORT_NOT_EXPOSED');
    }

    private static async captureContainerLogs(ssh: SSHService, deploymentId: string, containerId: string) {
        if (!containerId) return;
        const result = await ssh.execute(`docker logs --tail 120 ${shellQuote(containerId)} 2>&1 || true`).catch(() => null);
        const output = result?.stdout?.trim() || result?.stderr?.trim();
        if (output) {
            await LoggingService.log(deploymentId, `Container startup logs:\n${output.slice(0, 8000)}`, 'runtime', 'error').catch(() => undefined);
        }
    }

    private static async removeContainerQuietly(ssh: SSHService, deploymentId: string, containerId: string) {
        if (!containerId) return;
        await this.removeContainerIfExists(ssh, deploymentId, containerId, `Rolled back container ${containerId.slice(0, 12)}`, false);
    }

    private static async stopContainerIfExists(ssh: SSHService, deploymentId: string, containerId: string) {
        if (!(await this.containerExists(ssh, containerId))) {
            await LoggingService.log(deploymentId, 'Container already absent; marked deployment stopped', 'system');
            return;
        }
        await this.run(ssh, deploymentId, 'system', `docker stop ${shellQuote(containerId)}`, 'deploying', 'CONTAINER_STOP_FAILED');
    }

    private static async removeContainerIfExists(ssh: SSHService, deploymentId: string, containerIdOrName: string, message: string, warn = false) {
        if (!(await this.containerExists(ssh, containerIdOrName))) return false;
        await this.run(ssh, deploymentId, 'system', `docker rm -f ${shellQuote(containerIdOrName)} >/dev/null`, 'delete', 'CONTAINER_DELETE_FAILED');
        await LoggingService.log(deploymentId, message, 'system', warn ? 'warn' : 'info').catch(() => undefined);
        return true;
    }

    private static async containerExists(ssh: SSHService, containerIdOrName: string) {
        if (!containerIdOrName) return false;
        const inspect = await ssh.execute(`docker inspect ${shellQuote(containerIdOrName)} >/dev/null 2>&1`).catch(() => null);
        return inspect?.code === 0;
    }

    private static async removeImageIfExists(ssh: SSHService, imageTag: string) {
        if (!imageTag) return;
        const inspect = await ssh.execute(`docker image inspect ${shellQuote(imageTag)} >/dev/null 2>&1`).catch(() => null);
        if (inspect?.code === 0) {
            await ssh.execute(`docker rmi -f ${shellQuote(imageTag)} >/dev/null 2>&1 || true`).catch(() => undefined);
        }
    }

    private static async cleanupDeploymentWorkspace(deploymentId: string, uploadPath?: string | null) {
        await fs.rm(path.join('/tmp/deployforge', 'deployments', deploymentId), { recursive: true, force: true }).catch(() => undefined);
        if (uploadPath && uploadPath.startsWith('/tmp/deployforge/deployments/')) {
            await fs.rm(path.dirname(uploadPath), { recursive: true, force: true }).catch(() => undefined);
        }
    }

    private static async cleanupRemoteWorkspace(ssh: SSHService, deployment: any) {
        const safeProjectName = sanitizeName(deployment.project?.name || deployment.name || 'project');
        const baseDir = `/home/${shellPath(deployment.vps.username)}/deployforge/${safeProjectName}`;
        const releasePattern = `${baseDir}/releases/*-${deployment.id.slice(0, 8)}`;
        const staticPattern = `${baseDir}/static/*-${deployment.id.slice(0, 8)}`;
        const command = `rm -rf ${releasePattern} ${staticPattern}; if [ -L ${shellQuote(`${baseDir}/current`)} ] && readlink ${shellQuote(`${baseDir}/current`)} | grep -q ${shellQuote(deployment.id.slice(0, 8))}; then rm -f ${shellQuote(`${baseDir}/current`)}; fi; if [ -L ${shellQuote(`${baseDir}/static/current`)} ] && readlink ${shellQuote(`${baseDir}/static/current`)} | grep -q ${shellQuote(deployment.id.slice(0, 8))}; then rm -f ${shellQuote(`${baseDir}/static/current`)}; fi`;
        await ssh.execute(command).catch(() => undefined);
    }

    private static isStaticDeployment(deployment: { type?: string | null; framework?: string | null }) {
        return deployment.type === 'STATIC' || ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '');
    }

    private static staticArtifactDir(deployment: { vps: { username: string }; project?: { name?: string | null } | null; name?: string | null; id: string }, version?: string | null) {
        const safeProjectName = sanitizeName(deployment.project?.name || deployment.name || 'project');
        const snapshot = sanitizeName(version || deployment.id.slice(0, 8));
        return `/home/${shellPath(deployment.vps.username)}/deployforge/${safeProjectName}/static/${snapshot}`;
    }

    private static async verifyContainerRunningOnly(ssh: SSHService, deploymentId: string, containerId: string) {
        const { stdout: state } = await this.run(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.State.Status}}' ${shellQuote(containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
        const [running, restarting, status] = state.trim().split(/\s+/);
        if (running !== 'true' || restarting === 'true' || status === 'restarting') {
            throw new DeploymentError('deploying', 'Container did not reach a stable running state', 'CONTAINER_START_FAILED');
        }
    }

    private static assertLifecycleTransition(current: string, next: DeploymentStatus) {
        const normalizedCurrent = current.toUpperCase();
        const allowed: Record<string, DeploymentStatus[]> = {
            PENDING: ['BUILDING', 'DELETING'],
            CLONING: ['BUILDING', 'DELETING', 'FAILED'],
            UPLOADING: ['BUILDING', 'DELETING', 'FAILED'],
            EXTRACTING: ['BUILDING', 'DELETING', 'FAILED'],
            BUILDING: ['DEPLOYING', 'DELETING', 'FAILED'],
            DEPLOYING: ['RUNNING', 'DELETING', 'FAILED'],
            RUNNING: ['STOPPED', 'PAUSED', 'DELETING', 'FAILED'],
            PAUSED: ['RUNNING', 'DELETING'],
            STOPPED: ['RUNNING', 'DELETING'],
            FAILED: ['DELETING'],
            ROLLED_BACK: ['STOPPED', 'PAUSED', 'DELETING', 'FAILED'],
            DELETING: ['DELETED'],
            DELETED: [],
        };
        if (!allowed[normalizedCurrent]?.includes(next)) {
            throw new DeploymentError('state', `Invalid deployment state transition: ${current} -> ${next}`, 'INVALID_STATE_TRANSITION');
        }
    }

    private static async logLifecycle(deploymentId: string, userId: string, action: string, result: 'success' | 'failed') {
        await LoggingService.log(deploymentId, `${action} userId=${userId} deploymentId=${deploymentId} result=${result} timestamp=${new Date().toISOString()}`, 'system', result === 'success' ? 'info' : 'error').catch(() => undefined);
    }

    private static async assertRemotePortAvailable(ssh: SSHService, deploymentId: string, port: number) {
        const result = await ssh.execute(`if command -v ss >/dev/null 2>&1; then ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .; else netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '[:.]${port}$'; fi`);
        if (result.code === 0) throw new DeploymentError('port_alloc', `Port ${port} is already in use on the target server`, 'PORT_IN_USE');
        await LoggingService.log(deploymentId, `Reserved host port ${port}`, 'system');
    }

    private static async configureNginx(ssh: SSHService, deploymentId: string, host: string, port: number, isDomain: boolean) {
        const configPath = `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`;
        const nginxConfig = `server {\n    listen 80;\n    server_name ${host};\n\n    location / {\n        proxy_pass http://127.0.0.1:${port};\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_cache_bypass $http_upgrade;\n    }\n}`;
        const command = `if ! command -v nginx >/dev/null 2>&1; then echo DIRECT_PORT_MODE; exit 0; fi; if [ ! -w /etc/nginx/conf.d ]; then echo NGINX_CONF_UNWRITABLE; exit 0; fi; printf '%s\\n' ${shellQuote(nginxConfig)} > ${shellQuote(configPath)} && nginx -t && nginx -s reload`;
        const result = await ssh.execute(command);
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        if (result.code !== 0 && result.code !== null) {
            if (output) await LoggingService.log(deploymentId, output.slice(0, 8000), 'system', 'error');
            throw new DeploymentError('proxy', output || 'Nginx reverse proxy configuration failed', 'NGINX_CONFIG_FAILED');
        }
        if (output === 'DIRECT_PORT_MODE') {
            await LoggingService.log(deploymentId, `Reverse proxy not available - using direct port mode at ${host}:${port}`, 'system');
            return;
        }
        if (output === 'NGINX_CONF_UNWRITABLE') {
            await LoggingService.log(deploymentId, `Reverse proxy config directory is not writable - using direct port mode at ${host}:${port}`, 'system', 'warn');
            return;
        }
        await LoggingService.log(deploymentId, isDomain ? `Configured domain host ${host}` : `Configured IP fallback host ${host}:${port}`, 'system');
    }

    private static async configureStaticHosting(ssh: SSHService, deploymentId: string, host: string, staticDir: string, isDomain: boolean, ipAddress: string): Promise<StaticHostingResult> {
        await this.ensureStaticNginxService(ssh, deploymentId);
        const safeHost = sanitizeDomain(host);
        const staticLocation = `/site/${deploymentId}/`;
        const domainConfigPath = `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`;
        const sharedConfigPath = '/etc/nginx/conf.d/deployforge-static.conf';
        const locationDir = '/etc/nginx/deployforge-static-locations';
        const locationPath = `${locationDir}/deployforge-${deploymentId}.conf`;
        const nginxConfig = `server {\n    listen 80;\n    server_name ${safeHost};\n    root ${staticDir};\n    index index.html;\n\n    location / {\n        try_files $uri $uri/ /index.html;\n    }\n}`;
        const locationConfig = `location ${staticLocation} {\n    alias ${staticDir}/;\n    index index.html;\n    try_files $uri $uri/ ${staticLocation}index.html;\n}`;
        const sharedConfig = `server {\n    listen 80 default_server;\n    server_name _;\n    include ${locationDir}/*.conf;\n}`;
        const command = isDomain
            ? `if ! command -v nginx >/dev/null 2>&1; then echo NGINX_MISSING; exit 44; fi; if [ ! -w /etc/nginx/conf.d ]; then echo NGINX_CONF_UNWRITABLE; exit 45; fi; rm -f ${shellQuote(locationPath)}; printf '%s\\n' ${shellQuote(nginxConfig)} > ${shellQuote(domainConfigPath)} && nginx -t && nginx -s reload`
            : `if ! command -v nginx >/dev/null 2>&1; then echo NGINX_MISSING; exit 44; fi; if [ ! -w /etc/nginx/conf.d ]; then echo NGINX_CONF_UNWRITABLE; exit 45; fi; mkdir -p ${shellQuote(locationDir)} && rm -f ${shellQuote(domainConfigPath)} && printf '%s\\n' ${shellQuote(locationConfig)} > ${shellQuote(locationPath)} && if [ ! -f ${shellQuote(sharedConfigPath)} ]; then printf '%s\\n' ${shellQuote(sharedConfig)} > ${shellQuote(sharedConfigPath)}; fi && nginx -t && nginx -s reload`;
        const result = await ssh.execute(command);
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        if (result.code === 0 || result.code === null) {
            if (output) await LoggingService.log(deploymentId, output.slice(0, 8000), 'system');
            await LoggingService.log(deploymentId, isDomain ? `Configured static domain host ${safeHost}` : `Configured shared static path http://${safeHost}${staticLocation}`, 'system');
            return {
                url: isDomain ? `http://${safeHost}` : `http://${safeHost}${staticLocation}`,
                port: null,
                hostType: isDomain ? 'domain' : 'ip',
                domainActivated: isDomain,
            };
        }

        await LoggingService.log(deploymentId, `NGINX_MISSING - activating shared fallback static server. ${output || 'nginx unavailable'}`, 'system', 'warn');
        return this.configureFallbackStaticServer(ssh, deploymentId, ipAddress, staticDir);
    }

    private static async ensureStaticNginxService(ssh: SSHService, deploymentId: string) {
        const command = `if command -v nginx >/dev/null 2>&1; then (systemctl enable --now nginx >/dev/null 2>&1 || service nginx start >/dev/null 2>&1 || nginx >/dev/null 2>&1 || true); exit 0; fi; if command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get update -y >/dev/null 2>&1 && DEBIAN_FRONTEND=noninteractive apt-get install -y nginx >/dev/null 2>&1; elif command -v yum >/dev/null 2>&1; then yum install -y nginx >/dev/null 2>&1; elif command -v apk >/dev/null 2>&1; then apk add --no-cache nginx >/dev/null 2>&1; else exit 0; fi; if command -v nginx >/dev/null 2>&1; then systemctl enable --now nginx >/dev/null 2>&1 || service nginx start >/dev/null 2>&1 || nginx >/dev/null 2>&1 || true; fi`;
        const result = await ssh.execute(command).catch(() => null);
        if (result?.code === 0 || result?.code === null) {
            const installed = await ssh.execute('command -v nginx >/dev/null 2>&1').catch(() => null);
            if (installed?.code === 0) {
                await LoggingService.log(deploymentId, 'Shared nginx static hosting layer available', 'system').catch(() => undefined);
                return;
            }
        }
        await LoggingService.log(deploymentId, 'NGINX_MISSING - shared fallback static server will be used', 'system', 'warn').catch(() => undefined);
    }

    private static async configureFallbackStaticServer(ssh: SSHService, deploymentId: string, ipAddress: string, staticDir: string): Promise<StaticHostingResult> {
        const root = '/tmp/deployforge-static-server';
        const siteDir = `${root}/site`;
        const siteLink = `${siteDir}/${deploymentId}`;
        const logPath = `${root}/static-server.log`;
        const command = `mkdir -p ${shellQuote(siteDir)} && ln -sfn ${shellQuote(staticDir)} ${shellQuote(siteLink)} && if command -v python3 >/dev/null 2>&1; then server_kind=python; elif command -v npx >/dev/null 2>&1; then server_kind=npx; else echo STATIC_FALLBACK_RUNTIME_MISSING; exit 46; fi; for port in $(seq 8979 8999); do if command -v ss >/dev/null 2>&1; then listening=$(ss -ltn "( sport = :$port )" | tail -n +2 | wc -l); else listening=$(netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Ec "[:.]$port$" || true); fi; if [ "$listening" = "0" ]; then if [ "$server_kind" = "python" ]; then nohup python3 -m http.server "$port" --bind 0.0.0.0 --directory ${shellQuote(root)} > ${shellQuote(logPath)} 2>&1 & else nohup npx --yes serve ${shellQuote(root)} -l "$port" > ${shellQuote(logPath)} 2>&1 & fi; echo $! > ${shellQuote(`${root}/static-server.pid`)}; sleep 2; fi; if wget -qO- --timeout=2 "http://127.0.0.1:$port/site/${deploymentId}/" >/dev/null 2>&1; then echo "PORT=$port"; exit 0; fi; done; echo STATIC_FALLBACK_PORT_UNAVAILABLE; exit 47`;
        const { stdout } = await this.run(ssh, deploymentId, 'system', command, 'static_hosting', 'STATIC_FALLBACK_FAILED');
        const fallbackPort = Number(stdout.match(/PORT=(\d+)/)?.[1] || 8979);
        await LoggingService.log(deploymentId, `Fallback static server active at http://${ipAddress}:${fallbackPort}/site/${deploymentId}/`, 'system', 'warn');
        return {
            url: `http://${ipAddress}:${fallbackPort}/site/${deploymentId}/`,
            port: fallbackPort,
            hostType: 'ip',
            domainActivated: false,
        };
    }

    private static async cleanupNginx(ssh: SSHService, deploymentId: string, domainNames: string[]) {
        const paths = [
            `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`,
            `/etc/nginx/deployforge-static-locations/deployforge-${deploymentId}.conf`,
            ...domainNames.flatMap((domain) => [`/etc/nginx/sites-enabled/${domain}`, `/etc/nginx/sites-available/${domain}`]),
        ];
        const removeCommand = `${paths.map((item) => `rm -f ${shellQuote(item)}`).join(' && ')}; rm -f ${shellQuote(`/tmp/deployforge-static-server/site/${deploymentId}`)}; if command -v nginx >/dev/null 2>&1; then nginx -t && nginx -s reload || true; fi`;
        await ssh.execute(removeCommand);
    }

    private static async healthCheck(ssh: SSHService, deploymentId: string, port: number) {
        await this.run(ssh, deploymentId, 'system', `for i in $(seq 1 15); do if wget -qO- --timeout=2 http://127.0.0.1:${port}/ >/dev/null 2>&1; then exit 0; fi; sleep 2; done; exit 1`, 'deploying', 'HEALTH_CHECK_FAILED');
    }

    private static async healthCheckStatic(ssh: SSHService, deploymentId: string, hosting: StaticHostingResult) {
        const url = hosting.port
            ? `http://127.0.0.1:${hosting.port}/site/${deploymentId}/`
            : hosting.hostType === 'domain'
              ? 'http://127.0.0.1/'
              : `http://127.0.0.1/site/${deploymentId}/`;
        const hostHeader = new URL(hosting.url).host;
        await this.run(ssh, deploymentId, 'system', `for i in $(seq 1 10); do if wget -qO- --timeout=2 --header=${shellQuote(`Host: ${hostHeader}`)} ${shellQuote(url)} >/dev/null 2>&1; then exit 0; fi; sleep 1; done; exit 1`, 'static_hosting', 'STATIC_HEALTH_CHECK_FAILED');
    }

    private static async setStatus(deploymentId: string, status: DeploymentStatus) {
        await prisma.deployment.update({ where: { id: deploymentId }, data: { status } });
    }

    private static getVpsAuth(vps: any) {
        return vps.authType === 'key' || vps.authType === 'ssh_key'
            ? { privateKey: this.decrypt(vps.encryptedPrivateKey!) }
            : { password: this.decrypt(vps.encryptedPassword!) };
    }

    static normalizeCustomDomain(domainName?: string | null) {
        const clean = String(domainName || '').trim().toLowerCase();
        if (!clean) return null;
        if (/^https?:\/\//i.test(clean) || clean.includes('/') || clean.includes(' ') || clean.includes('_')) {
            throw new DeploymentError('domain_validation', 'Domain must not include protocol, paths, spaces, or invalid characters', 'INVALID_DOMAIN_FORMAT');
        }
        if (clean.length > 253 || clean.includes('..') || !clean.includes('.')) {
            throw new DeploymentError('domain_validation', 'Enter a valid root domain or subdomain, for example example.com or app.example.com', 'INVALID_DOMAIN_FORMAT');
        }
        const labels = clean.split('.');
        if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
            throw new DeploymentError('domain_validation', 'Domain format is invalid', 'INVALID_DOMAIN_FORMAT');
        }
        const tld = labels[labels.length - 1];
        if (!/^[a-z]{2,63}$/.test(tld)) {
            throw new DeploymentError('domain_validation', 'Domain top-level extension is invalid', 'INVALID_DOMAIN_FORMAT');
        }
        return clean;
    }

    private static async validateDomainSelection(_userId: string, domainName?: string) {
        const clean = this.normalizeCustomDomain(domainName);
        if (!clean) return undefined;
        const existing = await prisma.domain.findFirst({
            where: {
                domainName: clean,
                deployment: { status: { not: 'DELETED' } },
            },
        });
        if (existing) throw new DeploymentError('domain_validation', 'Domain is already assigned to another deployment', 'DOMAIN_ALREADY_EXISTS');
        return clean;
    }

    private static async prepareUploadWorkspace(deploymentId: string, incomingPath: string, originalFileName: string) {
        const archiveName = normalizedArchiveName(originalFileName);
        const workspace = path.join('/tmp/deployforge', 'deployments', deploymentId);
        const archivePath = path.join(workspace, archiveName);
        const lockPath = path.join(workspace, '.upload.lock');
        await fs.rm(workspace, { recursive: true, force: true });
        await fs.mkdir(path.join(workspace, 'workspace'), { recursive: true });
        await fs.mkdir(path.join(workspace, 'logs'), { recursive: true });
        await fs.access(incomingPath).catch(() => {
            throw new DeploymentError('uploading', 'Uploaded archive disappeared before workspace preparation', 'UPLOAD_FILE_MISSING');
        });
        await fs.copyFile(incomingPath, archivePath);
        await fs.access(archivePath).catch(() => {
            throw new DeploymentError('uploading', 'Deployment workspace archive was not persisted', 'WORKSPACE_NOT_FOUND');
        });
        await fs.writeFile(lockPath, JSON.stringify({
            deploymentId,
            originalFileName,
            archiveName,
            lockedAt: new Date().toISOString(),
        }, null, 2), { mode: 0o600 });
        await fs.unlink(incomingPath).catch(() => undefined);
        await fs.rm(path.dirname(incomingPath), { recursive: true, force: true }).catch(() => undefined);
        return { archiveName, archivePath, workspace };
    }

    private static async verifyLocalUploadWorkspace(archivePath: string) {
        const workspace = path.dirname(archivePath);
        await fs.access(path.join(workspace, '.upload.lock')).catch(() => {
            throw new DeploymentError('upload_extract', 'Deployment upload lock is missing', 'WORKSPACE_NOT_FOUND');
        });
        await fs.access(path.join(workspace, 'workspace')).catch(() => {
            throw new DeploymentError('upload_extract', 'Deployment workspace directory is missing', 'WORKSPACE_NOT_FOUND');
        });
        await fs.access(archivePath).catch(() => {
            throw new DeploymentError('upload_extract', 'Uploaded archive is missing from deployment workspace', 'UPLOAD_FILE_MISSING');
        });
    }

    private static async getRemoteUsedPorts(vps: any) {
        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...this.getVpsAuth(vps),
            });
            const { stdout } = await ssh.execute(`(docker ps --format '{{.Ports}}' 2>/dev/null; if command -v ss >/dev/null 2>&1; then ss -ltnH 2>/dev/null | awk '{print $4}'; else netstat -ltn 2>/dev/null | awk 'NR>2 {print $4}'; fi)`);
            const ports = new Set<number>();
            for (const match of stdout.matchAll(/(?:0\.0\.0\.0:|127\.0\.0\.1:|:::|:)(\d{2,5})(?:->|\s|$)/g)) {
                const port = Number(match[1]);
                if (port >= 3000 && port <= 9000) ports.add(port);
            }
            return ports;
        } catch {
            return new Set<number>();
        } finally {
            ssh.disconnect();
        }
    }

    private static assertSourceMatches(sourceType: SourceType, source: DeploymentSource) {
        if (!['github', 'upload'].includes(sourceType)) {
            throw new DeploymentError('pending', 'Invalid deployment source type', 'INVALID_SOURCE_TYPE');
        }
        if (sourceType === 'github' && source.type !== 'github_repo') {
            throw new DeploymentError('pending', 'Deployment source does not match GitHub pipeline', 'SOURCE_MISMATCH');
        }
        if (sourceType === 'upload' && source.type !== 'uploaded_file') {
            throw new DeploymentError('pending', 'Deployment source does not match upload pipeline', 'SOURCE_MISMATCH');
        }
    }

    private static async persistDomainBinding(deploymentId: string, vpsId: string, domainName: string) {
        const existing = await prisma.domain.findUnique({ where: { domainName } });
        if (existing) {
            await prisma.domain.update({
                where: { id: existing.id },
                data: {
                    deploymentId,
                    vpsId,
                    status: 'ACTIVE',
                    sslStatus: 'NONE',
                    nginxConfigPath: `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`,
                },
            });
            await prisma.deployment.update({ where: { id: deploymentId }, data: { domain: domainName, hostType: 'domain' } });
            return;
        }

        await prisma.domain.create({
            data: {
                deploymentId,
                vpsId,
                domainName,
                status: 'ACTIVE',
                nginxConfigPath: `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`,
            },
        });
        await prisma.deployment.update({ where: { id: deploymentId }, data: { domain: domainName, hostType: 'domain' } });
    }

    private static decrypt(encryptedString: string) {
        const [iv, tag, content] = encryptedString.split(':');
        return encryptionService.decrypt({ iv, tag, content });
    }

    static envPreview(encryptedEnv?: string | null) {
        if (!encryptedEnv) return [];
        try {
            const parsed = JSON.parse(this.decrypt(encryptedEnv));
            return Object.keys(this.normalizeEnv(parsed)).map((key) => ({ key, value: '********' }));
        } catch {
            return [];
        }
    }

    private static encryptEnv(env?: Record<string, string>) {
        const normalized = this.normalizeEnv(env || {});
        const encrypted = encryptionService.encrypt(JSON.stringify(normalized));
        return `${encrypted.iv}:${encrypted.tag}:${encrypted.content}`;
    }

    private static normalizeEnv(env: unknown): Record<string, string> {
        if (!env || typeof env !== 'object' || Array.isArray(env)) return {};
        const normalized: Record<string, string> = {};
        for (const [rawKey, rawValue] of Object.entries(env as Record<string, unknown>)) {
            const key = rawKey.trim();
            if (!key && (rawValue === undefined || rawValue === null || rawValue === '')) continue;
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
                throw new DeploymentError('building', `Invalid environment variable key: ${rawKey}`, 'INVALID_ENV_KEY');
            }
            if (rawValue === undefined || rawValue === null) continue;
            normalized[key] = String(rawValue).replace(/\r?\n/g, '\\n');
        }
        return normalized;
    }

    private static validateUploadFile(fileName: string) {
        const clean = sanitizeFileName(fileName);
        if (clean !== fileName) throw new DeploymentError('uploading', 'Upload file name contains unsafe characters', 'UNSAFE_UPLOAD_NAME');
        if (!/\.zip$/i.test(clean) && !/\.tar\.gz$/i.test(clean) && !/\.tgz$/i.test(clean)) {
            throw new DeploymentError('uploading', 'Only .zip, .tar.gz, and .tgz uploads are supported', 'UNSUPPORTED_UPLOAD_TYPE');
        }
    }

    private static async run(ssh: SSHService, deploymentId: string, type: LogType, command: string, stage = 'deploying', errorCode = 'COMMAND_FAILED') {
        const result = await ssh.execute(command);
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        if (output) {
            const clipped = output.length > 8000 ? `${output.slice(0, 8000)}\n[output truncated]` : output;
            await LoggingService.log(deploymentId, clipped, type, result.code === 0 || result.code === null ? 'info' : 'error');
        }
        if (result.code !== 0 && result.code !== null) {
            if ((errorCode === 'DOCKER_RUN_FAILED' || errorCode === 'DOCKER_CREATE_FAILED') && /address already in use|port is already allocated|bind:.*already in use/i.test(output)) {
                throw new DeploymentError('port_alloc', output || 'Host port is already in use', 'PORT_IN_USE');
            }
            throw new DeploymentError(stage, output || `Command failed with exit code ${result.code}`, errorCode);
        }
        return result;
    }
}

function generatedDockerfile(detected: DetectedProject) {
    if (detected.framework === 'STATIC') {
        return `FROM nginx:1.27-alpine\nWORKDIR /usr/share/nginx/html\nCOPY . .\nEXPOSE 80`;
    }

    if (detected.framework === 'VITE_REACT' || detected.framework === 'ASTRO') {
        return `FROM node:20-alpine AS build\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci || npm install\nCOPY . .\nRUN ${detected.buildCommand.includes('npm run build') ? 'npm run build' : 'true'}\nRUN mkdir -p /deployforge-static && \\\n    if [ -d dist ]; then cp -a dist/. /deployforge-static/; \\\n    elif [ -d build ]; then cp -a build/. /deployforge-static/; \\\n    elif [ -d out ]; then cp -a out/. /deployforge-static/; \\\n    elif [ -f index.html ]; then cp -a . /deployforge-static/; \\\n    else echo '<!doctype html><title>DeployForge Sandbox</title><h1>No static output detected</h1>' > /deployforge-static/index.html; fi\nFROM nginx:1.27-alpine\nCOPY --from=build /deployforge-static /usr/share/nginx/html\nEXPOSE 80`;
    }

    const command = detected.framework === 'NEXTJS' ? nextRuntimeCommand(detected.startCommand) : detected.startCommand;
    return `FROM node:20-alpine\nWORKDIR /app\nENV HOSTNAME=0.0.0.0\nENV PORT=3000\nCOPY package*.json ./\nRUN npm ci || npm install\nRUN npm install -g serve\nCOPY . .\nRUN ${detected.buildCommand.includes('npm run build') ? 'npm run build' : 'true'}\nENV NODE_ENV=production\nEXPOSE 3000\nCMD ["sh", "-lc", "${command.replace(/"/g, '\\"')}"]`;
}

function runtimeResolverCommand() {
    return [
        'if node -e "const p=require(\\\'./package.json\\\'); process.exit(p.scripts&&p.scripts.start?0:1)" 2>/dev/null; then npm run start; exit $?; fi',
        'main=$(node -e "try{const p=require(\\\'./package.json\\\'); process.stdout.write(p.main||\\\'\\\')}catch{}")',
        'for f in "$main" dist/server.js dist/index.js build/server.js build/index.js index.js server.js app.js; do if [ -n "$f" ] && [ -f "$f" ]; then exec node "$f"; fi; done',
        'for d in dist build out public .; do if [ -d "$d" ] && find "$d" -maxdepth 2 -name index.html | grep -q .; then exec serve "$d" -l 3000; fi; done',
        'echo "DeployForge runtime resolver could not find a Node entrypoint or static output"; exit 1',
    ].join('; ');
}

function nextRuntimeCommand(startCommand: string) {
    return [
        'for d in out dist build; do if [ -d "$d" ] && find "$d" -maxdepth 2 -name index.html | grep -q .; then exec serve "$d" -l 3000; fi; done',
        startCommand,
    ].join('; ');
}

function safeExtractCommand(archivePath: string, destination: string) {
    return `python3 - <<'PY'\nimport os, tarfile, zipfile, pathlib, sys\narchive = ${JSON.stringify(archivePath)}\ndest = pathlib.Path(${JSON.stringify(destination)}).resolve()\ndest.mkdir(parents=True, exist_ok=True)\nmax_depth = 12\nmax_entries = 20000\n\ndef safe_target(name):\n    target = (dest / name).resolve()\n    if not str(target).startswith(str(dest) + os.sep) and target != dest:\n        raise Exception('unsafe archive path: ' + name)\n    if len(pathlib.PurePosixPath(name).parts) > max_depth:\n        raise Exception('archive nesting is too deep: ' + name)\n\nif archive.endswith('.zip'):\n    with zipfile.ZipFile(archive) as z:\n        infos = z.infolist()\n        if len(infos) > max_entries:\n            raise Exception('archive contains too many files')\n        for info in infos:\n            safe_target(info.filename)\n        z.extractall(dest)\nelif archive.endswith('.tar.gz') or archive.endswith('.tgz'):\n    with tarfile.open(archive, 'r:gz') as t:\n        members = t.getmembers()\n        if len(members) > max_entries:\n            raise Exception('archive contains too many files')\n        for member in members:\n            safe_target(member.name)\n        t.extractall(dest)\nelse:\n    raise Exception('unsupported archive type')\nPY`;
}

function sanitizeName(name: string) {
    const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return clean || 'project';
}

function sanitizeFileName(name: string) {
    return name.replace(/[^A-Za-z0-9._-]/g, '');
}

function normalizedArchiveName(name: string) {
    const clean = sanitizeFileName(name).toLowerCase();
    if (clean.endsWith('.tar.gz')) return 'upload.tar.gz';
    if (clean.endsWith('.tgz')) return 'upload.tgz';
    return 'upload.zip';
}

function shellQuote(value: string | number) {
    return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellPath(value: string) {
    return value.replace(/[^A-Za-z0-9._-]/g, '');
}

function extractRepoFullName(repositoryUrl: string) {
    const match = repositoryUrl.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s.]+)(?:\.git)?/i);
    if (!match?.groups) return null;
    return `${match.groups.owner}/${match.groups.repo}`;
}

function sanitizeDomain(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9.-]/g, '');
}
