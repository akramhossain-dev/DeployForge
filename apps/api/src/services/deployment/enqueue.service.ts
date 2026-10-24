import prisma from '@deployforge/database';
import fs from 'node:fs/promises';
import path from 'node:path';
import { deploymentQueue } from '../../utils/queue';
import { deploymentJobPayload } from '../../utils/deployment-job';
import { CacheService } from '../cache.service';
import { LoggingService } from '../logging.service';
import { ResourcePolicyService } from '../resource-policy.service';
import { DeploymentError } from './error';
import { EnvironmentService } from './environment.service';
import { GitHubDeploymentService } from './github.service';
import { ValidationService } from './validation.service';
import { DeploymentWorkspaceService } from './workspace.service';
import { sanitizeName } from './utils';
import type { DeploymentSource } from './types';

export class DeploymentEnqueueService {
    static async deployProject(userId: string, source: DeploymentSource) {
        const projectId = source.projectId;
        const lockKey = `project-enqueue:${projectId}`;
        const release = await CacheService.acquireLock(lockKey, 300000);
        if (!release) {
            throw new Error('A deployment is already running for this project. Please wait.');
        }

        try {
            if (source.type === 'github_repo') {
                return await this.deployFromGithub(userId, source.projectId, source.vpsId, source.branch, {
                    commitHash: source.commitHash,
                    commitMessage: source.commitMessage,
                    skipWebhookRegistration: source.skipWebhookRegistration,
                    domainName: source.domainName,
                    env: source.env,
                    mode: source.mode,
                    composeService: source.composeService,
                    composePort: source.composePort,
                    resourceTier: source.resourceTier,
                    correlationId: source.correlationId,
                });
            }

            return await this.deployFromUpload(userId, source.projectId, source.vpsId, {
                uploadPath: source.uploadPath,
                originalFileName: source.originalFileName,
                domainName: source.domainName,
                env: source.env,
                mode: source.mode,
                composeService: source.composeService,
                composePort: source.composePort,
                resourceTier: source.resourceTier,
                correlationId: source.correlationId,
            });
        } finally {
            await release();
        }
    }

    static async deployFromGithub(userId: string, projectId: string, vpsId: string, branch: string, metadata: { commitHash?: string; commitMessage?: string; skipWebhookRegistration?: boolean; domainName?: string; env?: any; mode?: string; composeService?: string; composePort?: number; resourceTier?: 'STATIC' | 'SERVER' | 'FULLSTACK'; correlationId?: string } = {}) {
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { userId },
                    { members: { some: { userId, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                ]
            }
        });
        if (!project) throw new DeploymentError('pending', 'Project not found or access denied', 'PROJECT_OR_VPS_NOT_FOUND');

        const vps = await prisma.vPS.findFirst({
            where: {
                id: vpsId,
                OR: [
                    { userId },
                    { userId: project.userId }
                ]
            }
        });
        if (!vps) throw new DeploymentError('pending', 'VPS not found or access denied', 'PROJECT_OR_VPS_NOT_FOUND');

        const mode = metadata.mode === 'sandbox' ? 'sandbox' : 'production';
        const domainName = mode === 'sandbox' ? undefined : await ValidationService.validateDomainSelection(userId, metadata.domainName, projectId);
        const encryptedEnv = EnvironmentService.encryptEnv(metadata.env);

        const githubAccount = await prisma.gitHubAccount.findFirst({
            where: {
                userId: { in: [userId, project.userId] }
            }
        });
        if (!githubAccount) throw new DeploymentError('pending', 'GitHub account not connected', 'GITHUB_NOT_CONNECTED');

        const deployment = await prisma.deployment.create({
            data: {
                userId,
                correlationId: metadata.correlationId,
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
                composeService: metadata.composeService || null,
                composePort: metadata.composePort || null,
                requestedResourceTier: metadata.resourceTier || null,
            },
        });

        try {
            await ResourcePolicyService.enforceActiveProjectLimit(project.userId, projectId);
            const policy = await ResourcePolicyService.resolve(projectId, metadata.resourceTier);
            if (policy) await ResourcePolicyService.reserve(deployment.id, policy);
        } catch (error) {
            await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } }).catch(() => undefined);
            throw error;
        }

        try {
            if (mode === 'production' && !metadata.skipWebhookRegistration) {
                await GitHubDeploymentService.ensureRepositoryWebhook(githubAccount.userId, project.repositoryUrl, deployment.id);
            }
            await LoggingService.log(deployment.id, mode === 'sandbox' ? `Sandbox run queued from GitHub for ${project.repositoryUrl} on branch ${branch}` : `Deployment queued from GitHub for ${project.repositoryUrl} on branch ${branch}`, 'system');
            await deploymentQueue.add('deploy', deploymentJobPayload(deployment.id, 'deploy', metadata.correlationId), {
                jobId: `${mode === 'sandbox' ? 'sandbox' : 'deploy'}-${projectId}-${branch}-${Date.now()}`,
            });
        } catch (error) {
            await ResourcePolicyService.releaseReservation(deployment.id);
            await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } }).catch(() => undefined);
            throw error;
        }

        return deployment;
    }

    static async deployFromUpload(userId: string, projectId: string, vpsId: string, upload: { uploadPath: string; originalFileName: string; domainName?: string; env?: any; mode?: string; composeService?: string; composePort?: number; resourceTier?: 'STATIC' | 'SERVER' | 'FULLSTACK'; correlationId?: string }) {
        const project = await prisma.project.findFirst({
            where: {
                id: projectId,
                OR: [
                    { userId },
                    { members: { some: { userId, role: { in: ['OWNER', 'ADMIN', 'DEVELOPER'] } } } }
                ]
            }
        });
        if (!project) throw new DeploymentError('uploading', 'Project not found or access denied', 'PROJECT_OR_VPS_NOT_FOUND');

        const vps = await prisma.vPS.findFirst({
            where: {
                id: vpsId,
                OR: [
                    { userId },
                    { userId: project.userId }
                ]
            }
        });
        if (!vps) throw new DeploymentError('uploading', 'VPS not found or access denied', 'PROJECT_OR_VPS_NOT_FOUND');
        const mode = upload.mode === 'sandbox' ? 'sandbox' : 'production';
        const domainName = mode === 'sandbox' ? undefined : await ValidationService.validateDomainSelection(userId, upload.domainName, projectId);
        const encryptedEnv = EnvironmentService.encryptEnv(upload.env);

        ValidationService.validateUploadFile(upload.originalFileName);
        const deployment = await prisma.deployment.create({
            data: {
                userId,
                correlationId: upload.correlationId,
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
                composeService: upload.composeService || null,
                composePort: upload.composePort || null,
                requestedResourceTier: upload.resourceTier || null,
            },
        });

        try {
            await ResourcePolicyService.enforceActiveProjectLimit(project.userId, projectId);
            const policy = await ResourcePolicyService.resolve(projectId, upload.resourceTier);
            if (policy) await ResourcePolicyService.reserve(deployment.id, policy);
        } catch (error) {
            await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } }).catch(() => undefined);
            await fs.rm(path.dirname(upload.uploadPath), { recursive: true, force: true }).catch(() => undefined);
            throw error;
        }

        let preparedUploadPath = upload.uploadPath;
        try {
            const uploadWorkspace = await DeploymentWorkspaceService.prepareUpload(deployment.id, upload.uploadPath, upload.originalFileName);
            preparedUploadPath = uploadWorkspace.archivePath;
            await prisma.deployment.update({
                where: { id: deployment.id },
                data: { uploadPath: uploadWorkspace.archivePath },
            });
            await LoggingService.log(deployment.id, mode === 'sandbox' ? `Sandbox run queued from uploaded archive ${upload.originalFileName}` : `Deployment queued from uploaded archive ${upload.originalFileName}`, 'system');
            await deploymentQueue.add('deploy', deploymentJobPayload(deployment.id, 'deploy', upload.correlationId), {
                jobId: `${mode === 'sandbox' ? 'sandbox-upload' : 'deploy-upload'}-${projectId}-${Date.now()}`,
            });
        } catch (error) {
            await ResourcePolicyService.releaseReservation(deployment.id);
            await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED' } }).catch(() => undefined);
            await DeploymentWorkspaceService.cleanup(deployment.id, preparedUploadPath);
            await fs.rm(path.dirname(upload.uploadPath), { recursive: true, force: true }).catch(() => undefined);
            throw error;
        }

        return deployment;
    }

}
