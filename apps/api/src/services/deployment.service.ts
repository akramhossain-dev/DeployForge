import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { deploymentQueue } from '../utils/queue';
import { LoggingService } from './logging.service';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { CacheService } from './cache.service';

import { DeploymentError } from './deployment/error';
import { GitHubDeploymentService } from './deployment/github.service';
import { BuildService } from './deployment/build.service';
import { EnvironmentService } from './deployment/environment.service';
import { ValidationService } from './deployment/validation.service';
import { runCommand } from './deployment/runner';
import { RuntimeManagerService } from './runtime-manager';

import {
    shellQuote,
    shellPath,
    sanitizeName,
    computeFileHash,
} from './deployment/utils';
import {
    DeploymentSource,
    GitHubDeploymentSource,
    UploadedFileDeploymentSource,
    DeploymentStatus,
    StaticHostingResult,
    DetectedProject,
    DeploymentMode
} from './deployment/types';

export {
    DeploymentError,
    DeploymentSource,
    GitHubDeploymentSource,
    UploadedFileDeploymentSource,
    DeploymentStatus,
    StaticHostingResult,
    DetectedProject,
    DeploymentMode
};

export class DeploymentService {
    static async deployProject(userId: string, source: DeploymentSource) {
        const projectId = source.projectId;
        const lockKey = `project-deploy:${projectId}`;
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
                });
            }

            return await this.deployFromUpload(userId, source.projectId, source.vpsId, {
                uploadPath: source.uploadPath,
                originalFileName: source.originalFileName,
                domainName: source.domainName,
                env: source.env,
                mode: source.mode,
            });
        } finally {
            await release();
        }
    }

    static async deployFromGithub(userId: string, projectId: string, vpsId: string, branch: string, metadata: { commitHash?: string; commitMessage?: string; skipWebhookRegistration?: boolean; domainName?: string; env?: any; mode?: string } = {}) {
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
        const domainName = mode === 'sandbox' ? undefined : await ValidationService.validateDomainSelection(userId, metadata.domainName);
        const encryptedEnv = EnvironmentService.encryptEnv(metadata.env);

        const githubAccount = await prisma.gitHubAccount.findFirst({
            where: {
                userId: { in: [userId, project.userId] }
            }
        });
        if (!githubAccount) throw new DeploymentError('pending', 'GitHub account not connected', 'GITHUB_NOT_CONNECTED');

        const accessToken = EnvironmentService.decrypt(githubAccount.accessToken);
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
            await GitHubDeploymentService.ensureRepositoryWebhook(githubAccount.userId, project.repositoryUrl, deployment.id);
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
                mode: mode as any,
            } satisfies GitHubDeploymentSource,
        }, {
            jobId: `${mode === 'sandbox' ? 'sandbox' : 'deploy'}-${projectId}-${branch}-${Date.now()}`,
        });

        return deployment;
    }

    static async deployFromUpload(userId: string, projectId: string, vpsId: string, upload: { uploadPath: string; originalFileName: string; domainName?: string; env?: any; mode?: string }) {
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
        const domainName = mode === 'sandbox' ? undefined : await ValidationService.validateDomainSelection(userId, upload.domainName);
        const encryptedEnv = EnvironmentService.encryptEnv(upload.env);

        ValidationService.validateUploadFile(upload.originalFileName);
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
                mode: mode as any,
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
        this.assertSourceMatches(deployment.sourceType as any, source);

        const ssh = new SSHService();
        const project = deployment.project;
        const vps = deployment.vps;
        const safeProjectName = sanitizeName(project.name);
        const shortDeployId = deploymentId.slice(0, 8);
        const releaseId = `${Date.now()}-${shortDeployId}`;
        const baseDir = `/home/${shellPath(vps.username)}/deployforge/projects/${project.id}`;
        const releasesDir = `${baseDir}/releases`;
        const workDir = `${releasesDir}/${releaseId}`;
        const staticDir = `${baseDir}/static/${releaseId}`;
        const currentLink = `${baseDir}/current`;
        const currentStaticLink = `${baseDir}/static/current`;
        const dockerName = `df-${safeProjectName}-${shortDeployId}`;
        const imageTag = `deployforge/${safeProjectName}:${releaseId}`;
        const isSandbox = deployment.mode === 'sandbox' || source.mode === 'sandbox';
        const domainName = source.domainName?.trim();
        const effectiveDomain = domainName || (isSandbox ? `sandbox-${safeProjectName}-${shortDeployId}.${vps.ipAddress}.sslip.io` : `${safeProjectName}-${shortDeployId}.${vps.ipAddress}.sslip.io`);
        const routerId = isSandbox ? `df-sandbox-${shortDeployId}` : `df-${project.id}`;
        let createdContainerId = '';
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

            // Ensure Traefik Ingress Gateway & deployforge-net network
            await this.ensureTraefikGateway(ssh, deploymentId, vps);

            await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(releasesDir)} ${shellQuote(baseDir)}`);

            if (source.type === 'github_repo') {
                await GitHubDeploymentService.prepareGithubSource(ssh, deploymentId, source, project.repositoryUrl, workDir);
                await this.setStatus(deploymentId, 'BUILDING');
            } else {
                await this.setStatus(deploymentId, 'EXTRACTING');
                await BuildService.prepareUploadedSource(ssh, deploymentId, source, workDir);
                await this.setStatus(deploymentId, 'BUILDING');
            }

            await BuildService.normalizeProjectRoot(ssh, deploymentId, workDir);
            await runCommand(ssh, deploymentId, 'system', `ln -sfn ${shellQuote(workDir)} ${shellQuote(currentLink)}`);

            // ── Environment Preparation (Runtime Detection & Provisioning) ─────────
            await LoggingService.log(deploymentId, 'Scanning VPS environment...', 'system');
            try {
                const { stdout: fileListOut } = await ssh.execute(
                    `cd ${shellQuote(workDir)} && find . -maxdepth 3 -type f | sed 's#^./##'`
                ).catch(() => ({ stdout: '' }));
                const projectFilesList = fileListOut.split('\n').map((f) => f.trim()).filter(Boolean);

                const prepareResult = await RuntimeManagerService.analyzeAndPrepare(
                    ssh,
                    projectFilesList,
                    {},
                    (msg, level) => {
                        const logLevel = level === 'error' ? 'error' : level === 'success' ? 'build' : 'system';
                        LoggingService.log(deploymentId, msg, logLevel).catch(() => undefined);
                    },
                );

                if (!prepareResult.ready) {
                    throw new DeploymentError(
                        'building',
                        prepareResult.failureReason || 'Environment preparation failed. Required runtimes could not be installed.',
                        'ENV_PREP_FAILED',
                    );
                }
            } catch (err: any) {
                if (err instanceof DeploymentError) throw err;
                await LoggingService.log(deploymentId, `Environment scan warning: ${err?.message || 'unknown error'}`, 'system');
            }
            // ────────────────────────────────────────────────────────────

            await LoggingService.log(deploymentId, 'Validating project structure', 'build');
            const detected = await BuildService.detectProject(ssh, deploymentId, workDir);

            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    framework: detected.framework,
                    type: detected.deploymentType,
                    buildCommand: detected.buildCommand,
                    startCommand: detected.startCommand,
                },
            });

            let lockfileHash = 'nolock';
            const isDockerProject = detected.framework === 'DOCKER' || detected.framework === 'DOCKER_COMPOSE';
            if (!isDockerProject) {
                const hashTarget = detected.lockfile || 'package.json';
                const checkTargetCmd = `if [ -f ${shellQuote(`${workDir}/${hashTarget}`)} ]; then if command -v sha256sum >/dev/null 2>&1; then sha256sum ${shellQuote(`${workDir}/${hashTarget}`)} | awk '{print $1}'; else md5sum ${shellQuote(`${workDir}/${hashTarget}`)} | awk '{print $1}'; fi; else echo "missing"; fi`;
                const { stdout: hashOut } = await ssh.execute(checkTargetCmd);
                const cleanHash = hashOut.trim();
                if (cleanHash && cleanHash !== 'missing') {
                    lockfileHash = cleanHash;
                }
            }

            let sourceHash = '';
            if (source.type === 'github_repo') {
                const { stdout: gitHead } = await ssh.execute(`cd ${shellQuote(workDir)} && git rev-parse HEAD`).catch(() => ({ stdout: '' }));
                sourceHash = gitHead.trim() || source.commitHash || 'unknown-commit';
            } else {
                try {
                    sourceHash = await computeFileHash(source.uploadPath);
                } catch {
                    sourceHash = 'unknown-upload';
                }
            }

            const buildCacheKey = crypto.createHash('sha256').update(`${sourceHash}-${lockfileHash}`).digest('hex');
            const cacheDir = `${baseDir}/cache`;

            let buildCacheHit = false;
            if (detected.deploymentType === 'STATIC') {
                const checkStaticBuildCmd = `[ -f ${shellQuote(`${cacheDir}/builds/${buildCacheKey}/static/index.html`)} ]`;
                const staticBuildRes = await ssh.execute(checkStaticBuildCmd);
                buildCacheHit = staticBuildRes.code === 0;
            } else {
                const checkDockerBuildCmd = `docker image inspect ${shellQuote(`deployforge/${safeProjectName}:cache-${buildCacheKey}`)} >/dev/null 2>&1`;
                const dockerBuildRes = await ssh.execute(checkDockerBuildCmd);
                buildCacheHit = dockerBuildRes.code === 0;
            }

            if (buildCacheHit) {
                await LoggingService.log(deploymentId, `[CACHE_HIT_BUILD] Reusing cached build for key ${buildCacheKey}`, 'build');
            } else {
                await LoggingService.log(deploymentId, `[CACHE_MISS_BUILD] No build cache found for key ${buildCacheKey}`, 'build');

                let depCacheHit = false;
                if (lockfileHash !== 'nolock') {
                    const checkDepCmd = `[ -d ${shellQuote(`${cacheDir}/dependencies/${lockfileHash}/node_modules`)} ]`;
                    const depRes = await ssh.execute(checkDepCmd);
                    depCacheHit = depRes.code === 0;

                    if (depCacheHit) {
                        await LoggingService.log(deploymentId, `[CACHE_HIT_DEPENDENCIES] Reusing cached node_modules for hash ${lockfileHash}`, 'build');
                        await runCommand(ssh, deploymentId, 'build', `mkdir -p ${shellQuote(workDir)}/node_modules && cp -a ${shellQuote(`${cacheDir}/dependencies/${lockfileHash}/node_modules`)}/. ${shellQuote(workDir)}/node_modules/`);
                    } else {
                        await LoggingService.log(deploymentId, `[CACHE_MISS_DEPENDENCIES] Dependency cache miss for hash ${lockfileHash}`, 'build');
                        
                        let pm = 'npm';
                        if (detected.lockfile === 'bun.lock' || detected.lockfile === 'bun.lockb') pm = 'bun';
                        else if (detected.lockfile === 'pnpm-lock.yaml') pm = 'pnpm';
                        else if (detected.lockfile === 'yarn.lock') pm = 'yarn';

                        const pmEnsureCmd = `if [ "${pm}" = "pnpm" ] && ! command -v pnpm >/dev/null 2>&1; then npm install -g pnpm || true; fi; if [ "${pm}" = "yarn" ] && ! command -v yarn >/dev/null 2>&1; then npm install -g yarn || true; fi; if [ "${pm}" = "bun" ] && ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash || true; fi`;
                        await ssh.execute(pmEnsureCmd);

                        const installPrefix = `export PATH="$HOME/.bun/bin:$PATH" && `;
                        const installCommand = detected.installCommand || 'npm install';
                        await runCommand(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && ${installPrefix}${installCommand}`, 'building', 'DEPENDENCY_INSTALL_FAILED');

                        await runCommand(ssh, deploymentId, 'build', `if [ -d ${shellQuote(workDir)}/node_modules ]; then mkdir -p ${shellQuote(`${cacheDir}/dependencies/${lockfileHash}`)} && cp -a ${shellQuote(workDir)}/node_modules ${shellQuote(`${cacheDir}/dependencies/${lockfileHash}/`)}; fi`).catch(() => undefined);
                    }
                } else {
                    if (isDockerProject) {
                        await LoggingService.log(deploymentId, 'Docker-based project; skipping host-side dependency cache', 'build');
                    } else {
                        await LoggingService.log(deploymentId, 'No package.json or lockfile found; skipping dependency cache', 'build');
                    }
                }
            }
            
            await LoggingService.log(deploymentId, 'Analysing project and preparing build environment...', 'build');
            const hasEnv = await EnvironmentService.injectEnvironment(ssh, vps.username, deploymentId, workDir, deployment.env);
            
            if (hasEnv) {
                const envTarget = detected.framework === ('DOCKER_COMPOSE' as any) ? '.env' : '.env.deployforge';
                await runCommand(ssh, deploymentId, 'system', `cp ${shellQuote(EnvironmentService.getEnvPath(vps.username, deploymentId))} ${shellQuote(`${workDir}/${envTarget}`)}`);
            }

            try {
                if (detected.deploymentType === 'STATIC') {
                    if (buildCacheHit) {
                        await LoggingService.log(deploymentId, '[CACHE_HIT_BUILD] Restoring built static files from cache', 'build');
                        await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(path.dirname(staticDir))} && cp -a ${shellQuote(`${cacheDir}/builds/${buildCacheKey}/static`)} ${shellQuote(staticDir)}`);
                    } else {
                        await LoggingService.log(deploymentId, 'Building static artifact', 'build');
                        await BuildService.buildStaticArtifact(ssh, deploymentId, workDir, staticDir, detected, hasEnv);
                        await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(`${cacheDir}/builds/${buildCacheKey}`)} && cp -a ${shellQuote(staticDir)} ${shellQuote(`${cacheDir}/builds/${buildCacheKey}/static`)}`).catch(() => undefined);
                    }

                    await this.setStatus(deploymentId, 'DEPLOYING');
                    await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(`${baseDir}/static`)} && ln -sfn ${shellQuote(staticDir)} ${shellQuote(currentStaticLink)}`);
                    await LoggingService.log(deploymentId, 'Launching static micro-container on deployforge-net', 'system');

                    const staticContainerName = `df-static-${safeProjectName}-${shortDeployId}`;
                    createdContainerId = await this.deployStaticContainer(
                        ssh,
                        deploymentId,
                        staticDir,
                        staticContainerName,
                        effectiveDomain,
                        routerId,
                        isSandbox
                    );

                    staticHosting = {
                        url: `https://${effectiveDomain}`,
                        port: null,
                        hostType: domainName ? 'domain' : 'ip',
                        domainActivated: Boolean(domainName),
                    };

                    if (domainName) {
                        await this.persistDomainBinding(deploymentId, vps.id, domainName);
                    }

                    try {
                        await ValidationService.healthCheckStatic(ssh, deploymentId, createdContainerId);
                        await ValidationService.validateStaticAssets(ssh, deploymentId, staticHosting, vps, domainName);
                    } catch (err) {
                        await LoggingService.log(deploymentId, 'Static health check failed. Retrying once...', 'system', 'warn');
                        await new Promise((resolve) => setTimeout(resolve, 5000));
                        await ValidationService.healthCheckStatic(ssh, deploymentId, createdContainerId);
                        await ValidationService.validateStaticAssets(ssh, deploymentId, staticHosting, vps, domainName);
                    }
                } else {
                    const isCompose = detected.framework === ('DOCKER_COMPOSE' as any);

                    try {
                        if (isCompose) {
                            await LoggingService.log(deploymentId, 'Building Docker Compose services...', 'build');
                            const composeFile = detected.lockfile || 'docker-compose.yml';
                            await runCommand(ssh, deploymentId, 'build', `cd ${shellQuote(workDir)} && docker compose -f ${shellQuote(composeFile)} build`, 'building', 'DOCKER_COMPOSE_BUILD_FAILED');
                        } else {
                            if (buildCacheHit) {
                                await LoggingService.log(deploymentId, '[CACHE_HIT_BUILD] Re-tagging cached Docker image', 'build');
                                await runCommand(ssh, deploymentId, 'system', `docker tag ${shellQuote(`deployforge/${safeProjectName}:cache-${buildCacheKey}`)} ${shellQuote(imageTag)}`);
                            } else {
                                await LoggingService.log(deploymentId, 'Building deployment image', 'build');
                                await BuildService.buildImage(ssh, deploymentId, workDir, imageTag, detected);
                                await runCommand(ssh, deploymentId, 'system', `docker tag ${shellQuote(imageTag)} ${shellQuote(`deployforge/${safeProjectName}:cache-${buildCacheKey}`)}`).catch(() => undefined);
                            }
                        }

                        await this.setStatus(deploymentId, 'DEPLOYING');
                        
                        if (isCompose) {
                            await LoggingService.log(deploymentId, isSandbox ? 'Starting sandbox Docker Compose stack' : 'Starting deployment Docker Compose stack', 'system');
                            const composeFile = detected.lockfile || 'docker-compose.yml';
                            createdContainerId = await this.deployCompose(ssh, deploymentId, workDir, composeFile, dockerName, effectiveDomain, routerId);
                        } else {
                            await LoggingService.log(deploymentId, isSandbox ? 'Creating sandbox container' : 'Creating deployment container', 'system');
                            createdContainerId = await this.deployContainer(
                                ssh,
                                vps.username,
                                deploymentId,
                                workDir,
                                dockerName,
                                imageTag,
                                detected.appPort,
                                effectiveDomain,
                                routerId,
                                hasEnv,
                                isSandbox
                            );
                            await LoggingService.log(deploymentId, `Container started on deployforge-net: ${createdContainerId.slice(0, 12)}`, 'system');
                        }

                        if (domainName) {
                            await this.persistDomainBinding(deploymentId, vps.id, domainName);
                        }

                        try {
                            await ValidationService.healthCheck(ssh, deploymentId, createdContainerId, detected.appPort);
                        } catch (err) {
                            await LoggingService.log(deploymentId, 'Health check failed. Retrying once...', 'system', 'warn');
                            await new Promise((resolve) => setTimeout(resolve, 5000));
                            await ValidationService.healthCheck(ssh, deploymentId, createdContainerId, detected.appPort);
                        }
                    } catch (err: any) {
                        throw err;
                    }
                }
            } finally {
                if (hasEnv) {
                    const envTarget = detected.framework === ('DOCKER_COMPOSE' as any) ? '.env' : '.env.deployforge';
                    await ssh.execute(`rm -f ${shellQuote(`${workDir}/${envTarget}`)}`).catch(() => undefined);
                }
            }

            await prisma.deployment.update({
                where: { id: deploymentId },
                data: {
                    status: 'RUNNING',
                    containerId: createdContainerId || null,
                    port: null,
                    domain: domainName || effectiveDomain,
                    hostType: domainName ? 'domain' : 'ip',
                    commitHash: source.type === 'github_repo' ? source.commitHash : deployment.commitHash,
                    commitMessage: source.type === 'github_repo' ? source.commitMessage : deployment.commitMessage,
                    lastStableVersion: detected.deploymentType === 'STATIC' ? releaseId : isSandbox ? imageTag : source.type === 'github_repo' ? source.commitHash || source.branch : releaseId,
                },
            });

            // Zero-downtime Blue-Green: stop superseded container after new one is verified healthy
            if (!isSandbox) {
                const previousActiveDeployment = await prisma.deployment.findFirst({
                    where: {
                        projectId: project.id,
                        status: 'RUNNING',
                        id: { not: deploymentId },
                    },
                });
                if (previousActiveDeployment) {
                    if (previousActiveDeployment.containerId) {
                        await this.removeContainerIfExists(ssh, deploymentId, previousActiveDeployment.containerId, `Removed superseded container ${previousActiveDeployment.containerId.slice(0, 12)}`, false);
                    }
                    await prisma.deployment.update({
                        where: { id: previousActiveDeployment.id },
                        data: { status: 'STOPPED' },
                    }).catch(() => undefined);
                }
            }

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
                await LoggingService.log(deploymentId, `Deployment live at https://${effectiveDomain}`, 'system');
            } else {
                await LoggingService.log(deploymentId, `Sandbox live at https://${effectiveDomain}; auto cleanup scheduled in 30 minutes`, 'system');
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
            if (domainName) {
                await prisma.domain.updateMany({ where: { deploymentId }, data: { status: 'DELETED' } });
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null, domain: null, hostType: 'ip' } });
            await LoggingService.log(deploymentId, `Deployment failed during ${stage}: ${message}`, 'error', 'error');
            throw err;
        } finally {
            ssh.disconnect();
        }
    }

    private static async ensureTraefikGateway(ssh: SSHService, deploymentId: string, vps: any) {
        await LoggingService.log(deploymentId, 'Verifying Traefik Ingress Gateway and deployforge-net network...', 'system');
        const acmeEmail = `admin@${vps.ipAddress}.sslip.io`;

        // 1. Ensure external network
        await ssh.execute('docker network inspect deployforge-net >/dev/null 2>&1 || docker network create --driver bridge --subnet 172.28.0.0/16 deployforge-net');

        // 2. Ensure ACME directory & permissions
        await ssh.execute('mkdir -p /etc/deployforge/traefik/acme && touch /etc/deployforge/traefik/acme/acme.json && chmod 600 /etc/deployforge/traefik/acme/acme.json');

        // 3. Ensure Traefik container is running
        const traefikRunning = await ssh.execute("docker inspect -f '{{.State.Running}}' deployforge-traefik 2>/dev/null");
        if (traefikRunning.stdout.trim() !== 'true') {
            await LoggingService.log(deploymentId, 'Starting deployforge-traefik container...', 'system');
            await ssh.execute('docker rm -f deployforge-traefik 2>/dev/null || true');
            const runTraefikCmd = `docker run -d \\
                --name deployforge-traefik \\
                --restart always \\
                --network deployforge-net \\
                -p 80:80 \\
                -p 443:443 \\
                -v /var/run/docker.sock:/var/run/docker.sock:ro \\
                -v /etc/deployforge/traefik/acme/acme.json:/acme.json \\
                traefik:v3.1 \\
                --global.sendAnonymousUsage=false \\
                --api.dashboard=false \\
                --providers.docker=true \\
                --providers.docker.exposedbydefault=false \\
                --providers.docker.network=deployforge-net \\
                --entrypoints.web.address=:80 \\
                --entrypoints.web.http.redirections.entrypoint.to=websecure \\
                --entrypoints.web.http.redirections.entrypoint.scheme=https \\
                --entrypoints.websecure.address=:443 \\
                --certificatesresolvers.letsencrypt.acme.httpchallenge=true \\
                --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web \\
                --certificatesresolvers.letsencrypt.acme.email=${shellQuote(acmeEmail)} \\
                --certificatesresolvers.letsencrypt.acme.storage=/acme.json`;

            await runCommand(ssh, deploymentId, 'system', runTraefikCmd, 'deploying', 'TRAEFIK_START_FAILED');
        }
    }

    private static async verifyDeploymentAndRole(userId: string, deploymentId: string, allowedRoles: ('OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER')[]): Promise<any> {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId },
            include: {
                vps: true,
                domains: true,
                project: {
                    include: {
                        members: {
                            where: { userId }
                        }
                    }
                },
                history: { orderBy: { createdAt: 'desc' } }
            }
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');

        const isDirectOwner = deployment.userId === userId || deployment.project.userId === userId;
        if (isDirectOwner) return deployment;

        const member = deployment.project.members[0];
        if (!member || !allowedRoles.includes(member.role as any)) {
            throw new DeploymentError('forbidden', 'Access denied: insufficient project role permissions', 'FORBIDDEN');
        }

        return deployment;
    }

    static async stopDeployment(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        if (deployment.mode === 'sandbox') {
            return this.deleteDeployment(userId, deploymentId);
        }
        this.assertLifecycleTransition(deployment.status as any, 'STOPPED');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });
            if (deployment.containerId) {
                await this.stopContainerIfExists(ssh, deploymentId, deployment.containerId);
            }
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'STOPPED' } });
            await this.logLifecycle(deploymentId, userId, 'deployment_stopped', 'success');
        } finally {
            ssh.disconnect();
        }
    }

    static async pauseDeployment(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        this.assertLifecycleTransition(deployment.status as any, 'PAUSED');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });
            if (!deployment.containerId) throw new DeploymentError('deploying', 'Deployment has no running container', 'NO_RUNNING_CONTAINER');
            if (!(await this.containerExists(ssh, deployment.containerId))) {
                await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                throw new DeploymentError('container_sync', 'Container reference is missing on the server.', 'CONTAINER_NOT_FOUND');
            }
            await runCommand(ssh, deploymentId, 'system', `docker pause ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_PAUSE_FAILED');
            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'PAUSED' } });
            await this.logLifecycle(deploymentId, userId, 'deployment_paused', 'success');
        } finally {
            ssh.disconnect();
        }
    }

    static async deleteDeployment(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        if (deployment.mode !== 'sandbox') {
            const isDirectOwner = deployment.userId === userId || deployment.project.userId === userId;
            const member = deployment.project.members[0];
            const role = member?.role;
            if (!isDirectOwner && role !== 'OWNER' && role !== 'ADMIN') {
                throw new DeploymentError('forbidden', 'Access denied: only owner and admin can delete deployments', 'FORBIDDEN');
            }
        }

        if (deployment.status === 'DELETED') return { success: true, deleted: true };
        if (deployment.status === 'DELETING') return { success: true, deleting: true };
        this.assertLifecycleTransition(deployment.status as any, 'DELETING');

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
            await this.cleanupRemoteWorkspace(ssh, deployment);
            await this.cleanupDeploymentWorkspace(deploymentId, deployment.uploadPath);

            await this.logLifecycle(deploymentId, userId, 'deployment_deleted', 'success');
            await prisma.$transaction([
                prisma.deploymentJob.deleteMany({ where: { deploymentId } }),
                prisma.deploymentLog.deleteMany({ where: { deploymentId } }),
                prisma.deploymentSandbox.deleteMany({ where: { deploymentId } }),
                prisma.deploymentHistory.deleteMany({ where: { deploymentId } }),
                prisma.domain.deleteMany({ where: { deploymentId } }),
                prisma.deployment.delete({ where: { id: deploymentId } }),
            ]);
            return { success: true, deleted: true };
        } catch (err: any) {
            const previousStatus = deployment.status as string;
            await prisma.deployment.update({
                where: { id: deploymentId },
                data: { status: previousStatus === 'DELETING' ? 'FAILED' : (deployment.status as any) },
            }).catch(() => undefined);
            await LoggingService.log(deploymentId, `Delete failed: ${err.message}`, 'error', 'error').catch(() => undefined);
            if (err instanceof DeploymentError) throw err;
            throw new DeploymentError('delete', err.message || 'Delete cleanup failed', 'DELETE_CLEANUP_FAILED');
        } finally {
            ssh.disconnect();
        }
    }

    static async resumeDeployment(userId: string, deploymentId: string) {
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        this.assertLifecycleTransition(deployment.status as any, 'RUNNING');

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: deployment.vps.ipAddress,
                port: deployment.vps.port,
                username: deployment.vps.username,
                ...this.getVpsAuth(deployment.vps),
            });

            await this.ensureTraefikGateway(ssh, deploymentId, deployment.vps);

            const safeProjectName = sanitizeName(deployment.project.name);
            const shortDeployId = deploymentId.slice(0, 8);
            const effectiveDomain = deployment.domain || `${safeProjectName}-${shortDeployId}.${deployment.vps.ipAddress}.sslip.io`;
            const routerId = `df-${deployment.projectId}`;

            if (this.isStaticDeployment(deployment)) {
                const staticDir = this.staticArtifactDir(deployment, deployment.lastStableVersion || deployment.history[0]?.version);
                const exists = await ssh.execute(`test -f ${shellQuote(`${staticDir}/index.html`)}`).catch(() => null);
                if (exists?.code !== 0) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED' } });
                    throw new DeploymentError('static_hosting', 'Static artifact snapshot is missing on the server.', 'STATIC_ARTIFACT_NOT_FOUND');
                }
                const staticContainerName = `df-static-${safeProjectName}-${shortDeployId}`;
                const containerId = await this.deployStaticContainer(
                    ssh,
                    deploymentId,
                    staticDir,
                    staticContainerName,
                    effectiveDomain,
                    routerId,
                    false
                );
                await ValidationService.healthCheckStatic(ssh, deploymentId, containerId);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { containerId, port: null } });
            } else if (deployment.containerId && await this.containerExists(ssh, deployment.containerId)) {
                if (deployment.status === 'PAUSED') {
                    await runCommand(ssh, deploymentId, 'system', `docker unpause ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
                } else {
                    await runCommand(ssh, deploymentId, 'system', `docker start ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
                }
                await this.verifyContainerRunningOnly(ssh, deploymentId, deployment.containerId);
            } else if (deployment.history[0]?.imageTag) {
                const dockerName = `df-${safeProjectName}-${shortDeployId}`;
                const appPort = ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '') ? 80 : 3000;
                const resumeDir = `/tmp/deployforge-resume-${deploymentId}`;
                await runCommand(ssh, deploymentId, 'system', `rm -rf ${shellQuote(resumeDir)} && mkdir -p ${shellQuote(resumeDir)}`);
                const hasEnv = await EnvironmentService.injectEnvironment(ssh, deployment.vps.username, deploymentId, resumeDir, deployment.env);
                const containerId = await this.deployContainer(
                    ssh,
                    deployment.vps.username,
                    deploymentId,
                    resumeDir,
                    dockerName,
                    deployment.history[0].imageTag!,
                    appPort,
                    effectiveDomain,
                    routerId,
                    hasEnv
                );
                await prisma.deployment.update({ where: { id: deploymentId }, data: { containerId, port: null } });
                await runCommand(ssh, deploymentId, 'system', `rm -rf ${shellQuote(resumeDir)}`).catch(() => undefined);
            } else {
                await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                throw new DeploymentError('container_sync', 'Container reference is missing and no successful image snapshot is available.', 'CONTAINER_NOT_FOUND');
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
        const deployment = await this.verifyDeploymentAndRole(userId, deploymentId, ['OWNER', 'ADMIN', 'DEVELOPER']);
        if (!deployment.containerId) {
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
            await LoggingService.log(deploymentId, 'Restarting deployment container...', 'system');
            
            if (deployment.containerId.startsWith('compose:')) {
                const projectName = deployment.containerId.replace('compose:', '');
                await runCommand(ssh, deploymentId, 'system', `docker ps --filter "label=com.docker.compose.project=${projectName}" -q | xargs -r docker restart`, 'deploying', 'DOCKER_RESTART_FAILED');
            } else {
                const inspect = await ssh.execute(`docker inspect ${shellQuote(deployment.containerId!)} >/dev/null 2>&1`);
                if (inspect.code !== 0) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                    throw new DeploymentError('container_sync', 'Container reference is missing on the server.', 'CONTAINER_NOT_FOUND');
                }
                await runCommand(ssh, deploymentId, 'system', `docker restart ${shellQuote(deployment.containerId!)}`, 'deploying', 'DOCKER_RESTART_FAILED');
            }

            await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'RUNNING' } });
            await LoggingService.log(deploymentId, 'Deployment container restarted successfully', 'system');
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
            where: {
                id: deploymentId,
                OR: [
                    { userId },
                    {
                        project: {
                            OR: [
                                { userId },
                                { members: { some: { userId } } }
                            ]
                        }
                    }
                ]
            },
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

    static envPreview(encryptedEnv?: string | null) {
        return EnvironmentService.envPreview(encryptedEnv);
    }

    private static async deployStaticContainer(
        ssh: SSHService,
        deploymentId: string,
        staticDir: string,
        dockerName: string,
        effectiveDomain: string,
        routerId: string,
        isSandbox = false
    ): Promise<string> {
        await this.removeContainerIfExists(ssh, deploymentId, dockerName, 'Removed previous static container', false);
        const restartPolicy = isSandbox ? 'no' : 'unless-stopped';
        const createCommand = `docker create \\
            --name ${shellQuote(dockerName)} \\
            --restart ${restartPolicy} \\
            --network deployforge-net \\
            --label "traefik.enable=true" \\
            --label "traefik.http.routers.${routerId}.rule=Host(\`${effectiveDomain}\`)" \\
            --label "traefik.http.routers.${routerId}.entrypoints=websecure" \\
            --label "traefik.http.routers.${routerId}.tls=true" \\
            --label "traefik.http.routers.${routerId}.tls.certresolver=letsencrypt" \\
            --label "traefik.http.services.${routerId}.loadbalancer.server.port=80" \\
            -v ${shellQuote(staticDir)}:/usr/share/nginx/html:ro \\
            nginx:1.27-alpine`;

        const { stdout } = await runCommand(ssh, deploymentId, 'system', createCommand, 'container_create', 'DOCKER_CREATE_FAILED');
        const createdId = stdout.trim();
        if (!/^[a-f0-9]{12,64}$/i.test(createdId)) {
            throw new DeploymentError('container_create', 'Docker did not return a valid container ID for static host', 'INVALID_CONTAINER_ID');
        }

        try {
            await runCommand(ssh, deploymentId, 'system', `docker start ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_START_FAILED');
            const { stdout: fullId } = await runCommand(ssh, deploymentId, 'system', `docker inspect --format '{{.Id}}' ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_NOT_CREATED');
            return fullId.trim();
        } catch (err) {
            await this.captureContainerLogs(ssh, deploymentId, createdId);
            await this.removeContainerQuietly(ssh, deploymentId, createdId);
            throw err;
        }
    }

    private static async deployContainer(
        ssh: SSHService,
        username: string,
        deploymentId: string,
        workDir: string,
        dockerName: string,
        imageTag: string,
        appPort: number,
        effectiveDomain: string,
        routerId: string,
        hasEnv: boolean,
        isSandbox = false
    ) {
        await this.removeContainerIfExists(ssh, deploymentId, dockerName, 'Removed previous container with matching Docker name', false);
        const envFlag = hasEnv ? ` --env-file ${shellQuote(EnvironmentService.getEnvPath(username, deploymentId))}` : '';
        const restartPolicy = isSandbox ? 'no' : 'unless-stopped';
        const createCommand = `docker create \\
            --name ${shellQuote(dockerName)} \\
            --restart ${restartPolicy} \\
            --network deployforge-net \\
            --label "traefik.enable=true" \\
            --label "traefik.http.routers.${routerId}.rule=Host(\`${effectiveDomain}\`)" \\
            --label "traefik.http.routers.${routerId}.entrypoints=websecure" \\
            --label "traefik.http.routers.${routerId}.tls=true" \\
            --label "traefik.http.routers.${routerId}.tls.certresolver=letsencrypt" \\
            --label "traefik.http.services.${routerId}.loadbalancer.server.port=${appPort}" \\
            --read-only \\
            --tmpfs /tmp:rw,noexec,nosuid,size=128m \\
            --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m \\
            --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=64m \\
            --tmpfs /var/run:rw,noexec,nosuid,size=16m \\
            --security-opt no-new-privileges \\
            --cap-drop ALL${envFlag} \\
            ${shellQuote(imageTag)}`;

        const { stdout } = await runCommand(ssh, deploymentId, 'system', createCommand, 'container_create', 'DOCKER_CREATE_FAILED');
        const createdId = stdout.trim();
        if (!/^[a-f0-9]{12,64}$/i.test(createdId)) {
            throw new DeploymentError('container_create', 'Docker did not return a valid container ID', 'INVALID_CONTAINER_ID');
        }

        try {
            const { stdout: createdState } = await runCommand(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Status}}' ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_NOT_CREATED');
            if (createdState.trim() !== 'created') {
                throw new DeploymentError('container_create', 'Container was not created cleanly before start', 'CONTAINER_START_FAILED');
            }

            await runCommand(ssh, deploymentId, 'system', `docker start ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_START_FAILED');
            const { stdout: fullId } = await runCommand(ssh, deploymentId, 'system', `docker inspect --format '{{.Id}}' ${shellQuote(createdId)}`, 'container_create', 'CONTAINER_NOT_CREATED');
            const containerId = fullId.trim();
            if (!/^[a-f0-9]{64}$/i.test(containerId)) {
                throw new DeploymentError('container_create', 'Docker inspect returned an invalid container ID', 'INVALID_CONTAINER_ID');
            }
            await this.verifyContainerRuntime(ssh, deploymentId, containerId);
            return containerId;
        } catch (err) {
            await this.captureContainerLogs(ssh, deploymentId, createdId);
            await this.removeContainerQuietly(ssh, deploymentId, createdId);
            throw err;
        }
    }

    private static async deployCompose(
        ssh: SSHService,
        deploymentId: string,
        workDir: string,
        composeFile: string,
        projectName: string,
        effectiveDomain: string,
        routerId: string
    ) {
        const overrideFile = 'docker-compose.deployforge.yml';
        const overridePath = `${workDir}/${overrideFile}`;
        const genScript = `
import sys

compose_path = sys.argv[1]
router_id = sys.argv[2]
effective_domain = sys.argv[3]
override_path = sys.argv[4]

services = []
current_service = None
service_ports = {}
in_services = False
services_indent = -1
in_ports = False
ports_indent = -1

with open(compose_path, 'r') as f:
    lines = f.readlines()

for line in lines:
    stripped = line.strip()
    if not stripped or stripped.startswith('#'):
        continue
    indent = len(line) - len(line.lstrip())
    
    if in_services and indent <= services_indent:
        in_services = False
        current_service = None
        
    if stripped == 'services:':
        in_services = True
        services_indent = indent
        continue
        
    if in_services:
        if in_ports and indent <= ports_indent:
            in_ports = False
            
        if in_ports:
            if stripped.startswith('-'):
                pval = stripped.lstrip('-').strip().strip('"').strip("'")
                parts = pval.split(':')
                target_port = parts[-1].split('/')[0]
                target_port = ''.join(c for c in target_port if c.isdigit())
                if target_port and current_service:
                    service_ports.setdefault(current_service, []).append(int(target_port))
            continue
            
        if stripped == 'ports:':
            in_ports = True
            ports_indent = indent
            continue
            
        if indent == services_indent + 2 or (services_indent == -1 and indent == 2):
            if stripped.endswith(':'):
                current_service = stripped[:-1].strip()
                if current_service not in services:
                    services.append(current_service)

target_svc = None
for s in services:
    if any(k in s.lower() for k in ['client', 'frontend', 'web', 'app']):
        target_svc = s
        break

if not target_svc:
    for s in services:
        if not any(k in s.lower() for k in ['db', 'mongo', 'postgres', 'redis', 'mysql', 'broker', 'queue', 'mariadb', 'elasticsearch', 'memcached']):
            target_svc = s
            break

if not target_svc and services:
    target_svc = services[0]

port = 80
if target_svc and service_ports.get(target_svc):
    port = service_ports[target_svc][0]
elif target_svc:
    port = 3000

if not target_svc:
    target_svc = "app"

override_content = f"""networks:
  deployforge-net:
    external: true

services:
  {target_svc}:
    networks:
      - default
      - deployforge-net
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.{router_id}.rule=Host(\`{effective_domain}\`)"
      - "traefik.http.routers.{router_id}.entrypoints=websecure"
      - "traefik.http.routers.{router_id}.tls=true"
      - "traefik.http.routers.{router_id}.tls.certresolver=letsencrypt"
      - "traefik.http.services.{router_id}.loadbalancer.server.port={port}"
"""

with open(override_path, 'w') as f:
    f.write(override_content)
`;

        const genScriptPath = `/tmp/gen_compose_override_${deploymentId}.py`;
        await ssh.execute(`cat > ${shellQuote(genScriptPath)} <<'EOF'\n${genScript}\nEOF`);
        await runCommand(ssh, deploymentId, 'system', `python3 ${shellQuote(genScriptPath)} ${shellQuote(`${workDir}/${composeFile}`)} ${shellQuote(routerId)} ${shellQuote(effectiveDomain)} ${shellQuote(overridePath)}`);
        await ssh.execute(`rm -f ${shellQuote(genScriptPath)}`).catch(() => undefined);

        await runCommand(ssh, deploymentId, 'system', `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(`${workDir}/${composeFile}`)} -f ${shellQuote(overridePath)} down >/dev/null 2>&1 || true`);
        await LoggingService.log(deploymentId, 'Starting Docker Compose stack on deployforge-net...', 'system');
        const startCommand = `cd ${shellQuote(workDir)} && docker compose -p ${shellQuote(projectName)} -f ${shellQuote(composeFile)} -f ${shellQuote(overrideFile)} up -d`;

        let retries = 5;
        while (retries > 0) {
            try {
                await runCommand(ssh, deploymentId, 'system', startCommand, 'container_create', 'DOCKER_COMPOSE_UP_FAILED');
                break;
            } catch (error: any) {
                const errorMsg = error?.message || '';
                if (/Conflict\..*container.*already in use/i.test(errorMsg)) {
                    const conflictMatch = errorMsg.match(/already in use by container "([a-f0-9]+)"/i)
                        || errorMsg.match(/The container name "\/?([^"]+)" is already in use/i);

                    if (conflictMatch) {
                        const offendingIdOrName = conflictMatch[1];
                        await LoggingService.log(deploymentId, `Detected container name conflict for: "${offendingIdOrName}". Automatically removing conflicting container...`, 'system', 'warn');
                        await ssh.execute(`docker rm -f ${shellQuote(offendingIdOrName)}`).catch(() => undefined);
                        retries--;
                        continue;
                    }
                }
                throw error;
            }
        }

        const { stdout: psOut } = await runCommand(ssh, deploymentId, 'system', `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(`${workDir}/${composeFile}`)} -f ${shellQuote(overridePath)} ps -q`, 'container_create', 'DOCKER_COMPOSE_PS_FAILED');
        const containerIds = psOut.trim().split('\n').map(id => id.trim()).filter(Boolean);
        if (containerIds.length === 0) {
            throw new DeploymentError('container_create', 'Docker Compose did not start any containers', 'DOCKER_COMPOSE_NO_CONTAINERS');
        }

        await LoggingService.log(deploymentId, `Docker Compose started ${containerIds.length} containers attached to deployforge-net`, 'system');
        return `compose:${projectName}`;
    }

    private static async verifyContainerRuntime(ssh: SSHService, deploymentId: string, containerId: string) {
        if (!/^[a-f0-9]{64}$/i.test(containerId)) {
            throw new DeploymentError('container_create', 'Invalid Docker container ID', 'INVALID_CONTAINER_ID');
        }

        const { stdout: state } = await runCommand(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.State.Status}}' ${shellQuote(containerId)}`, 'container_create', 'CONTAINER_START_FAILED');
        const [running, restarting, status] = state.trim().split(/\s+/);
        if (running !== 'true' || restarting === 'true' || status === 'restarting') {
            throw new DeploymentError('container_create', 'Container was created but did not reach a stable running state', 'CONTAINER_START_FAILED');
        }

        await runCommand(ssh, deploymentId, 'system', `docker top ${shellQuote(containerId)} >/dev/null`, 'container_create', 'CONTAINER_START_FAILED');
    }

    private static async captureContainerLogs(ssh: SSHService, deploymentId: string, containerId: string) {
        if (!containerId) return;
        if (containerId.startsWith('compose:')) {
            const projectName = containerId.replace('compose:', '');
            const result = await ssh.execute(`docker ps -a --filter "label=com.docker.compose.project=${projectName}" --format "{{.ID}} ({{.Names}})"`).catch(() => null);
            if (result && result.code === 0) {
                const lines = result.stdout.trim().split('\n').filter(Boolean);
                for (const line of lines) {
                    const parts = line.split(' ');
                    const cId = parts[0];
                    const cName = parts.slice(1).join(' ');
                    const logsRes = await ssh.execute(`docker logs --tail 60 ${shellQuote(cId)} 2>&1 || true`).catch(() => null);
                    if (logsRes && logsRes.stdout.trim()) {
                        await LoggingService.log(deploymentId, `Logs for container ${cName}:\n${logsRes.stdout.trim()}`, 'system');
                    }
                }
            }
            return;
        }
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
        if (containerId.startsWith('compose:')) {
            const projectName = containerId.replace('compose:', '');
            await LoggingService.log(deploymentId, `Stopping Docker Compose stack ${projectName}...`, 'system');
            await runCommand(ssh, deploymentId, 'system', `docker ps --filter "label=com.docker.compose.project=${projectName}" -q | xargs -r docker stop`, 'deploying', 'CONTAINER_STOP_FAILED');
            return;
        }
        if (!(await this.containerExists(ssh, containerId))) {
            await LoggingService.log(deploymentId, 'Container already absent; marked deployment stopped', 'system');
            return;
        }
        await runCommand(ssh, deploymentId, 'system', `docker stop ${shellQuote(containerId)}`, 'deploying', 'CONTAINER_STOP_FAILED');
    }

    private static async removeContainerIfExists(ssh: SSHService, deploymentId: string, containerIdOrName: string, message: string, warn = false) {
        if (containerIdOrName.startsWith('compose:')) {
            const projectName = containerIdOrName.replace('compose:', '');
            if (!(await this.containerExists(ssh, containerIdOrName))) return false;
            await runCommand(ssh, deploymentId, 'system', `docker ps -a --filter "label=com.docker.compose.project=${projectName}" -q | xargs -r docker rm -f`, 'delete', 'CONTAINER_DELETE_FAILED');
            await LoggingService.log(deploymentId, message, 'system', warn ? 'warn' : 'info').catch(() => undefined);
            return true;
        }
        if (!(await this.containerExists(ssh, containerIdOrName))) return false;
        await runCommand(ssh, deploymentId, 'system', `docker rm -f ${shellQuote(containerIdOrName)} >/dev/null`, 'delete', 'CONTAINER_DELETE_FAILED');
        await LoggingService.log(deploymentId, message, 'system', warn ? 'warn' : 'info').catch(() => undefined);
        return true;
    }

    private static async containerExists(ssh: SSHService, containerIdOrName: string) {
        if (!containerIdOrName) return false;
        if (containerIdOrName.startsWith('compose:')) {
            const projectName = containerIdOrName.replace('compose:', '');
            const result = await ssh.execute(`docker ps --filter "label=com.docker.compose.project=${projectName}" -q`);
            return result.code === 0 && result.stdout.trim().length > 0;
        }
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
        const projectId = deployment.projectId || deployment.project?.id;
        const baseDir = projectId
            ? `/home/${shellPath(deployment.vps.username)}/deployforge/projects/${projectId}`
            : `/home/${shellPath(deployment.vps.username)}/deployforge/${sanitizeName(deployment.project?.name || deployment.name || 'project')}`;
        const releasePattern = `${baseDir}/releases/*-${deployment.id.slice(0, 8)}`;
        const staticPattern = `${baseDir}/static/*-${deployment.id.slice(0, 8)}`;
        const command = `rm -rf ${releasePattern} ${staticPattern}; if [ -L ${shellQuote(`${baseDir}/current`)} ] && readlink ${shellQuote(`${baseDir}/current`)} | grep -q ${shellQuote(deployment.id.slice(0, 8))}; then rm -f ${shellQuote(`${baseDir}/current`)}; fi; if [ -L ${shellQuote(`${baseDir}/static/current`)} ] && readlink ${shellQuote(`${baseDir}/static/current`)} | grep -q ${shellQuote(deployment.id.slice(0, 8))}; then rm -f ${shellQuote(`${baseDir}/static/current`)}; fi; rm -f ${shellQuote(EnvironmentService.getEnvPath(deployment.vps.username, deployment.id))}`;
        await ssh.execute(command).catch(() => undefined);
    }

    private static isStaticDeployment(deployment: { type?: string | null; framework?: string | null }) {
        return deployment.type === 'STATIC' || ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '');
    }

    private static staticArtifactDir(deployment: { vps: { username: string }; projectId?: string; project?: { id?: string; name?: string | null } | null; name?: string | null; id: string }, version?: string | null) {
        const projectId = deployment.projectId || deployment.project?.id;
        const baseDir = projectId
            ? `/home/${shellPath(deployment.vps.username)}/deployforge/projects/${projectId}`
            : `/home/${shellPath(deployment.vps.username)}/deployforge/${sanitizeName(deployment.project?.name || deployment.name || 'project')}`;
        const snapshot = sanitizeName(version || deployment.id.slice(0, 8));
        return `${baseDir}/static/${snapshot}`;
    }

    private static async verifyContainerRunningOnly(ssh: SSHService, deploymentId: string, containerId: string) {
        if (containerId.startsWith('compose:')) {
            const projectName = containerId.replace('compose:', '');
            const { stdout: runningCount } = await runCommand(ssh, deploymentId, 'system', `docker ps --filter "label=com.docker.compose.project=${projectName}" --filter "status=running" -q | wc -l`, 'deploying', 'CONTAINER_START_FAILED');
            if (parseInt(runningCount.trim() || '0', 10) === 0) {
                throw new DeploymentError('deploying', 'No running containers found for the Docker Compose stack', 'CONTAINER_START_FAILED');
            }
            return;
        }
        const { stdout: state } = await runCommand(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.State.Status}}' ${shellQuote(containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
        const [running, restarting, status] = state.trim().split(/\s+/);
        if (running !== 'true' || restarting === 'true' || status === 'restarting') {
            throw new DeploymentError('deploying', 'Container did not reach a stable running state', 'CONTAINER_START_FAILED');
        }
    }

    private static assertLifecycleTransition(current: string, next: DeploymentStatus) {
        const normalizedCurrent = current.toUpperCase();
        const allowed: Record<string, DeploymentStatus[]> = {
            PENDING:    ['CLONING', 'UPLOADING', 'BUILDING', 'DELETING', 'FAILED'],
            CLONING:    ['BUILDING', 'DELETING', 'FAILED'],
            UPLOADING:  ['EXTRACTING', 'BUILDING', 'DELETING', 'FAILED'],
            EXTRACTING: ['BUILDING', 'DELETING', 'FAILED'],
            BUILDING:   ['DEPLOYING', 'DELETING', 'FAILED'],
            DEPLOYING:  ['RUNNING', 'DELETING', 'FAILED'],
            RUNNING:    ['STOPPED', 'PAUSED', 'DELETING', 'FAILED'],
            PAUSED:     ['RUNNING', 'DELETING'],
            STOPPED:    ['RUNNING', 'DELETING'],
            FAILED:     ['RUNNING', 'DELETING'],
            ROLLED_BACK: ['STOPPED', 'PAUSED', 'DELETING', 'FAILED'],
            DELETING:   ['DELETED'],
            DELETED:    [],
        };
        if (!allowed[normalizedCurrent]?.includes(next)) {
            throw new DeploymentError('state', `Invalid deployment state transition: ${current} -> ${next}`, 'INVALID_STATE_TRANSITION');
        }
    }

    private static async logLifecycle(deploymentId: string, userId: string, action: string, result: 'success' | 'failed') {
        await LoggingService.log(deploymentId, `${action} userId=${userId} deploymentId=${deploymentId} result=${result} timestamp=${new Date().toISOString()}`, 'system', result === 'success' ? 'info' : 'error').catch(() => undefined);
    }

    private static async setStatus(deploymentId: string, status: DeploymentStatus) {
        await prisma.deployment.update({ where: { id: deploymentId }, data: { status } });
    }

    private static getVpsAuth(vps: any) {
        return vps.authType === 'key'
            ? { privateKey: EnvironmentService.decrypt(vps.encryptedPrivateKey!) }
            : { password: EnvironmentService.decrypt(vps.encryptedPassword!) };
    }

    private static async prepareUploadWorkspace(deploymentId: string, incomingPath: string, originalFileName: string) {
        const archiveName = path.basename(originalFileName);
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

    private static assertSourceMatches(sourceType: 'github' | 'upload', source: DeploymentSource) {
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
                    sslStatus: 'ISSUED',
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
                sslStatus: 'ISSUED',
            },
        });
        await prisma.deployment.update({ where: { id: deploymentId }, data: { domain: domainName, hostType: 'domain' } });
    }
}
