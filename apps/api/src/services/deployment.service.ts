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
import {
    shellQuote,
    shellPath,
    sanitizeName,
    sanitizeFileName,
    normalizedArchiveName,
    computeFileHash,
    sanitizeDomain
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
        const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!project || !vps) throw new DeploymentError('pending', 'Project or VPS not found', 'PROJECT_OR_VPS_NOT_FOUND');
        const mode = metadata.mode === 'sandbox' ? 'sandbox' : 'production';
        const domainName = mode === 'sandbox' ? undefined : await ValidationService.validateDomainSelection(userId, metadata.domainName);
        const encryptedEnv = EnvironmentService.encryptEnv(metadata.env);

        const githubAccount = await prisma.gitHubAccount.findUnique({ where: { userId } });
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
            await GitHubDeploymentService.ensureRepositoryWebhook(userId, project.repositoryUrl, deployment.id);
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
        const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId } });
        if (!project || !vps) throw new DeploymentError('uploading', 'Project or VPS not found', 'PROJECT_OR_VPS_NOT_FOUND');
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
                        await LoggingService.log(deploymentId, 'Building static artifact without Docker', 'build');
                        await BuildService.buildStaticArtifact(ssh, deploymentId, workDir, staticDir, detected, hasEnv);
                        await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(`${cacheDir}/builds/${buildCacheKey}`)} && cp -a ${shellQuote(staticDir)} ${shellQuote(`${cacheDir}/builds/${buildCacheKey}/static`)}`).catch(() => undefined);
                    }

                    await this.setStatus(deploymentId, 'DEPLOYING');
                    await runCommand(ssh, deploymentId, 'system', `mkdir -p ${shellQuote(`${baseDir}/static`)} && ln -sfn ${shellQuote(staticDir)} ${shellQuote(currentStaticLink)}`);
                    await LoggingService.log(deploymentId, isSandbox ? 'Publishing sandbox static artifact' : 'Publishing static artifact through shared static hosting', 'system');
                    routingAttempted = true;
                    staticHosting = await this.configureStaticHosting(ssh, deploymentId, domainName || vps.ipAddress, staticDir, Boolean(domainName), vps.ipAddress);
                    if (domainName && staticHosting.domainActivated) {
                        await this.persistDomainBinding(deploymentId, vps.id, domainName);
                    }

                    if (!staticHosting.domainActivated) {
                        await LoggingService.log(deploymentId, `Subpath hosting active. Rewriting assets for subpath /site/${deploymentId}...`, 'build');
                        await this.rewriteStaticAssets(ssh, deploymentId, staticDir, `/site/${deploymentId}`);
                    }
                    
                    try {
                        await ValidationService.healthCheckStatic(ssh, deploymentId, staticHosting);
                        await ValidationService.validateStaticAssets(ssh, deploymentId, staticHosting, vps, domainName);
                    } catch (err) {
                        await LoggingService.log(deploymentId, 'Static health check or asset validation failed. Retrying once...', 'system', 'warn');
                        await new Promise((resolve) => setTimeout(resolve, 5000));
                        try {
                            await ValidationService.healthCheckStatic(ssh, deploymentId, staticHosting);
                            await ValidationService.validateStaticAssets(ssh, deploymentId, staticHosting, vps, domainName);
                        } catch (retryErr) {
                            await LoggingService.log(deploymentId, 'Static health check or asset validation failed on second attempt. Rolling back...', 'system', 'error');
                            if (!isSandbox) {
                                const previousActiveDeployment = await prisma.deployment.findFirst({
                                    where: {
                                        projectId: project.id,
                                        status: 'RUNNING',
                                        id: { not: deploymentId },
                                    },
                                    include: { vps: true, project: true },
                                });
                                if (previousActiveDeployment && previousActiveDeployment.lastStableVersion) {
                                    const prevStaticDir = this.staticArtifactDir(previousActiveDeployment, previousActiveDeployment.lastStableVersion);
                                    await this.configureStaticHosting(ssh, deploymentId, domainName || vps.ipAddress, prevStaticDir, Boolean(domainName), vps.ipAddress).catch(() => undefined);
                                }
                            }
                            throw retryErr;
                        }
                    }
                } else {
                    const isCompose = detected.framework === ('DOCKER_COMPOSE' as any);
                    let port = deployment.port;
                    if (!isCompose) {
                        port = port || await this.getAvailablePort(deployment.vpsId, vps);
                        await prisma.deployment.update({ where: { id: deploymentId }, data: { port } });
                        deployment.port = port;
                    }

                    if (isCompose) {
                        const previousActiveDeployment = await prisma.deployment.findFirst({
                            where: {
                                projectId: project.id,
                                status: 'RUNNING',
                                id: { not: deploymentId },
                            },
                        });
                        if (previousActiveDeployment) {
                            await LoggingService.log(deploymentId, 'Stopping previous active deployment to free ports...', 'system');
                            if (previousActiveDeployment.containerId) {
                                await this.stopContainerIfExists(ssh, deploymentId, previousActiveDeployment.containerId);
                                await this.removeContainerIfExists(ssh, deploymentId, previousActiveDeployment.containerId, 'Removed superseded compose containers', false);
                            }
                            await this.cleanupNginx(ssh, previousActiveDeployment.id, previousActiveDeployment.domain ? [previousActiveDeployment.domain] : []).catch(() => undefined);
                            await prisma.deployment.update({
                                where: { id: previousActiveDeployment.id },
                                data: { status: 'STOPPED', containerId: null },
                            });
                        }

                        const composeFile = detected.lockfile || 'docker-compose.yml';
                        await this.verifyComposePorts(ssh, deploymentId, workDir, composeFile);
                    }
                    
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
                            createdContainerId = await this.deployCompose(ssh, deploymentId, workDir, composeFile, dockerName);
                            
                            port = await this.detectComposeRoutingPort(ssh, deploymentId, workDir, composeFile);
                            await prisma.deployment.update({ where: { id: deploymentId }, data: { port } });
                            deployment.port = port;
                            await LoggingService.log(deploymentId, `Detected active service host port: ${port}`, 'system');
                        } else {
                            await LoggingService.log(deploymentId, isSandbox ? 'Creating sandbox container' : 'Creating deployment container', 'system');
                            await this.assertRemotePortAvailable(ssh, deploymentId, port!);
                            createdContainerId = await this.deployContainer(ssh, vps.username, deploymentId, workDir, dockerName, imageTag, port!, detected.appPort, hasEnv, isSandbox);
                            await LoggingService.log(deploymentId, `Container started: ${createdContainerId.slice(0, 12)}`, 'system');
                        }

                        if (!isSandbox) {
                            routingAttempted = true;
                            await this.configureNginx(ssh, deploymentId, domainName || vps.ipAddress, port!, Boolean(domainName));
                            if (domainName) {
                                await this.persistDomainBinding(deploymentId, vps.id, domainName);
                            }
                        } else {
                            await LoggingService.log(deploymentId, `Sandbox direct port mode active at http://${vps.ipAddress}:${port}`, 'system', 'warn');
                        }

                        try {
                            await ValidationService.healthCheck(ssh, deploymentId, port!);
                        } catch (err) {
                            await LoggingService.log(deploymentId, 'Health check failed. Retrying once...', 'system', 'warn');
                            await new Promise((resolve) => setTimeout(resolve, 5000));
                            await ValidationService.healthCheck(ssh, deploymentId, port!);
                        }
                    } catch (err: any) {
                        if (isSandbox) {
                            await LoggingService.log(deploymentId, `Sandbox Node deployment failed: ${err.message}. Falling back to static server.`, 'system', 'warn');
                            if (createdContainerId) {
                                await this.removeContainerQuietly(ssh, deploymentId, createdContainerId);
                                createdContainerId = '';
                            }
                            
                            detected.deploymentType = 'STATIC';
                            detected.framework = 'STATIC';
                            detected.buildCommand = '';
                            detected.startCommand = 'nginx static mount';
                            detected.appPort = 80;

                            await BuildService.buildStaticArtifact(ssh, deploymentId, workDir, staticDir, detected, hasEnv);
                            routingAttempted = true;
                            staticHosting = await this.configureStaticHosting(ssh, deploymentId, domainName || vps.ipAddress, staticDir, Boolean(domainName), vps.ipAddress);
                            
                            try {
                                await ValidationService.healthCheckStatic(ssh, deploymentId, staticHosting);
                            } catch (staticErr) {
                                await LoggingService.log(deploymentId, 'Fallback static health check failed. Retrying once...', 'system', 'warn');
                                await new Promise((resolve) => setTimeout(resolve, 5000));
                                await ValidationService.healthCheckStatic(ssh, deploymentId, staticHosting);
                            }
                        } else {
                            if (routingAttempted) {
                                const previousActiveDeployment = await prisma.deployment.findFirst({
                                    where: {
                                        projectId: project.id,
                                        status: 'RUNNING',
                                        id: { not: deploymentId },
                                    },
                                });
                                if (previousActiveDeployment && previousActiveDeployment.port) {
                                    await this.configureNginx(ssh, deploymentId, domainName || vps.ipAddress, previousActiveDeployment.port, Boolean(domainName)).catch(() => undefined);
                                }
                            }
                            throw err;
                        }
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
                    port: staticHosting ? staticHosting.port : deployment.port,
                    domain: staticHosting?.domainActivated ? domainName || null : detected.deploymentType === 'STATIC' ? null : deployment.domain,
                    hostType: staticHosting ? staticHosting.hostType : deployment.hostType,
                    commitHash: source.type === 'github_repo' ? source.commitHash : deployment.commitHash,
                    commitMessage: source.type === 'github_repo' ? source.commitMessage : deployment.commitMessage,
                    lastStableVersion: detected.deploymentType === 'STATIC' ? releaseId : isSandbox ? imageTag : source.type === 'github_repo' ? source.commitHash || source.branch : releaseId,
                },
            });

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
                    await this.cleanupNginx(ssh, previousActiveDeployment.id, previousActiveDeployment.domain ? [previousActiveDeployment.domain] : []).catch(() => undefined);
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

    static async stopDeployment(userId: string, deploymentId: string) {
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, project: true },
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
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
        this.assertLifecycleTransition(deployment.status as any, 'PAUSED');

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
                await runCommand(ssh, deploymentId, 'system', `docker pause ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_PAUSE_FAILED');
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
            await this.cleanupNginx(ssh, deploymentId, deployment.domains.map((domain: any) => domain.domainName));
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
        const deployment = await prisma.deployment.findFirst({
            where: { id: deploymentId, userId },
            include: { vps: true, domains: true, project: true, history: { orderBy: { createdAt: 'desc' }, take: 1 } },
        });
        if (!deployment) throw new DeploymentError('deploying', 'Deployment not found', 'DEPLOYMENT_NOT_FOUND');
        this.assertLifecycleTransition(deployment.status as any, 'RUNNING');

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
                await ValidationService.healthCheckStatic(ssh, deploymentId, staticHosting);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { port: staticHosting.port, domain: staticHosting.domainActivated ? deployment.domain : null, hostType: staticHosting.hostType } });
            } else if (deployment.containerId && await this.containerExists(ssh, deployment.containerId)) {
                if (deployment.status === 'PAUSED') {
                    await runCommand(ssh, deploymentId, 'system', `docker unpause ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
                } else {
                    await runCommand(ssh, deploymentId, 'system', `docker start ${shellQuote(deployment.containerId)}`, 'deploying', 'CONTAINER_START_FAILED');
                }
                await this.verifyContainerRunningOnly(ssh, deploymentId, deployment.containerId);
            } else if (deployment.history[0]?.imageTag) {
                const port = await this.getAvailablePort(deployment.vpsId, deployment.vps);
                const safeProjectName = sanitizeName(deployment.project.name);
                const dockerName = `df-${safeProjectName}-${deploymentId.slice(0, 8)}`;
                const appPort = ['STATIC', 'VITE_REACT', 'ASTRO'].includes(deployment.framework || '') ? 80 : 3000;
                const resumeDir = `/tmp/deployforge-resume-${deploymentId}`;
                await runCommand(ssh, deploymentId, 'system', `rm -rf ${shellQuote(resumeDir)} && mkdir -p ${shellQuote(resumeDir)}`);
                const hasEnv = await EnvironmentService.injectEnvironment(ssh, deployment.vps.username, deploymentId, resumeDir, deployment.env);
                const containerId = await this.deployContainer(ssh, deployment.vps.username, deploymentId, resumeDir, dockerName, deployment.history[0].imageTag!, port, appPort, hasEnv);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { containerId, port } });
                deployment.containerId = containerId;
                deployment.port = port;
                await runCommand(ssh, deploymentId, 'system', `rm -rf ${shellQuote(resumeDir)}`).catch(() => undefined);
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
                await ValidationService.healthCheckStatic(ssh, deploymentId, staticHosting);
                await prisma.deployment.update({ where: { id: deploymentId }, data: { port: staticHosting.port, domain: staticHosting.domainActivated ? deployment.domain : null, hostType: staticHosting.hostType } });
            } else {
                await LoggingService.log(deploymentId, 'Restarting deployment container', 'system');
                const inspect = await ssh.execute(`docker inspect ${shellQuote(deployment.containerId!)} >/dev/null 2>&1`);
                if (inspect.code !== 0) {
                    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', containerId: null } });
                    throw new DeploymentError('container_sync', 'Container reference is missing on the server.', 'CONTAINER_NOT_FOUND');
                }
                await runCommand(ssh, deploymentId, 'system', `docker restart ${shellQuote(deployment.containerId!)}`, 'deploying', 'DOCKER_RESTART_FAILED');
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

    static envPreview(encryptedEnv?: string | null) {
        return EnvironmentService.envPreview(encryptedEnv);
    }

    private static async configureNginx(ssh: SSHService, deploymentId: string, host: string, port: number, isDomain: boolean) {
        const configPath = `/etc/nginx/conf.d/deployforge-${deploymentId}.conf`;
        const nginxConfig = `server {\n    listen 80;\n    server_name ${host};\n\n    location / {\n        proxy_pass http://127.0.0.1:${port};\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_cache_bypass $http_upgrade;\n    }\n}`;
        const command = `if ! command -v nginx >/dev/null 2>&1; then echo DIRECT_PORT_MODE; exit 0; fi; if [ ! -w /etc/nginx/conf.d ]; then echo NGINX_CONF_UNWRITABLE; exit 0; fi; printf '%s\\n' ${shellQuote(nginxConfig)} > ${shellQuote(configPath)} && nginx -t && nginx -s reload`;
        const result = await ssh.execute(command);
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        
        if (result.code !== 0 && result.code !== null) {
            await LoggingService.log(deploymentId, `Reverse proxy configuration failed - falling back to direct port mode at http://${host}:${port}. Error: ${output}`, 'system', 'warn');
            return;
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
        const command = `mkdir -p ${shellQuote(siteDir)} && ln -sfn ${shellQuote(staticDir)} ${shellQuote(siteLink)} && if command -v python3 >/dev/null 2>&1; then server_kind=python; elif command -v npx >/dev/null 2>&1; then server_kind=npx; else echo STATIC_FALLBACK_RUNTIME_MISSING; exit 46; fi; for port in $(seq 8979 8999); do if command -v ss >/dev/null 2>&1; then listening=$(ss -ltn "( sport = :$port )" | tail -n +2 | wc -l); else listening=$(netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Ec "[:.]$port$" || true); fi; if [ "$listening" = "0" ]; then if [ "$server_kind" = "python" ]; then nohup python3 -m http.server "$port" --bind 0.0.0.0 --directory ${shellQuote(root)} > ${shellQuote(logPath)} 2>&1 & else nohup npx --yes serve ${shellQuote(root)} -l "$port" > ${shellQuote(logPath)} 2>&1 & fi; echo $! > ${shellQuote(`${root}/static-server.pid`)}; sleep 2; fi; if wget -qO- --timeout=2 --tries=1 "http://127.0.0.1:$port/site/${deploymentId}/" >/dev/null 2>&1; then echo "PORT=$port"; exit 0; fi; done; echo STATIC_FALLBACK_PORT_UNAVAILABLE; exit 47`;
        const { stdout } = await runCommand(ssh, deploymentId, 'system', command, 'static_hosting', 'STATIC_FALLBACK_FAILED');
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

    private static async setStatus(deploymentId: string, status: DeploymentStatus) {
        await prisma.deployment.update({ where: { id: deploymentId }, data: { status } });
    }

    private static getVpsAuth(vps: any) {
        return vps.authType === 'key' || vps.authType === 'ssh_key'
            ? { privateKey: EnvironmentService.decrypt(vps.encryptedPrivateKey!) }
            : { password: EnvironmentService.decrypt(vps.encryptedPassword!) };
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

    private static async rewriteStaticAssets(ssh: SSHService, deploymentId: string, staticDir: string, subpath: string) {
        const rewriteScript = `
import os, re, sys

directory = ${shellQuote(staticDir)}
subpath = ${shellQuote(subpath)}
prefix = '/' + subpath.strip('/') + '/'

html_pattern = re.compile(r'\\b(href|src|srcset|action)\\s*=\\s*(["\\'])\\/(?!\\/)(.*?)\\2', re.IGNORECASE)
css_pattern = re.compile(r'url\\(\\s*(["\\']?)\\/(?!\\/)(.*?)\\1\\s*\\)', re.IGNORECASE)
js_pattern = re.compile(r'(["\\'])\\/(?!\\/)(_astro|_next|assets|static|js|css|images|fonts|favicon\\.)', re.IGNORECASE)

def replace_html(match):
    attr = match.group(1).lower()
    quote = match.group(2)
    val = match.group(3)
    if attr == 'srcset':
        val = '/' + val
        parts = []
        for p in val.split(','):
            p_clean = p.lstrip()
            if p_clean.startswith('/') and not p_clean.startswith('//'):
                subparts = p_clean.split(None, 1)
                url = subparts[0]
                desc = ' ' + subparts[1] if len(subparts) > 1 else ''
                parts.append(prefix + url.lstrip('/') + desc)
            else:
                parts.append(p)
        return f'{attr}={quote}{",".join(parts)}{quote}'
    return f'{attr}={quote}{prefix}{val}{quote}'

for root, dirs, files in os.walk(directory):
    for file in files:
        filepath = os.path.join(root, file)
        ext = os.path.splitext(file)[1].lower()
        
        if ext in ['.html', '.htm']:
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                new_content = html_pattern.sub(replace_html, content)
                new_content = css_pattern.sub(rf'url(\\\\1{prefix}\\\\2\\\\1)', new_content)
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
            except Exception as e:
                print(f"Error HTML {file}: {e}")
        elif ext == '.css':
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                new_content = css_pattern.sub(rf'url(\\\\1{prefix}\\\\2\\\\1)', content)
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
            except Exception as e:
                print(f"Error CSS {file}: {e}")
        elif ext == '.js':
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                new_content = js_pattern.sub(rf'\\\\1{prefix}\\\\2', content)
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
            except Exception as e:
                print(f"Error JS {file}: {e}")
`;
        await runCommand(ssh, deploymentId, 'build', `python3 - <<'PY'\n${rewriteScript}\nPY`, 'building', 'ASSET_REWRITE_FAILED');
    }

    private static async detectComposeRoutingPort(ssh: SSHService, deploymentId: string, workDir: string, composeFile: string): Promise<number> {
        const getRoutingPortScript = `
import sys
try:
    with open(sys.argv[1], 'r') as f:
        content = f.read()
except Exception as e:
    sys.exit(1)

services = {}
current_service = None
in_services = False
services_indent = -1
in_ports = False
ports_indent = -1

for line in content.splitlines():
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
                port_val = stripped.lstrip('-').strip().strip('"').strip("'")
                parts = port_val.split(':')
                host_port = None
                if len(parts) >= 2:
                    host_port = parts[-2].split('/')[-1]
                    host_port = ''.join(c for c in host_port if c.isdigit())
                else:
                    p_val = ''.join(c for c in parts[0] if c.isdigit())
                    if p_val:
                        host_port = p_val
                if host_port and current_service:
                    services[current_service].append(int(host_port))
            continue
            
        if stripped == 'ports:':
            in_ports = True
            ports_indent = indent
            continue
            
        if indent == services_indent + 2 or (services_indent == -1 and indent == 2):
            if stripped.endswith(':'):
                current_service = stripped[:-1].strip()
                services[current_service] = []

target_port = None
for sname in services:
    if any(k in sname.lower() for k in ['client', 'frontend', 'web', 'app']):
        if services[sname]:
            target_port = services[sname][0]
            break

if not target_port:
    for sname in services:
        if services[sname]:
            if not any(k in sname.lower() for k in ['db', 'mongo', 'postgres', 'redis', 'mysql', 'broker', 'queue', 'mariadb', 'elasticsearch', 'memcached', 'influx', 'prometheus', 'grafana']):
                target_port = services[sname][0]
                break

if not target_port:
    for sname in services:
        if services[sname]:
            target_port = services[sname][0]
            break

if target_port:
    print(target_port)
else:
    print("80")
`;
        const remoteScriptPath = `/tmp/get_routing_port_${deploymentId}.py`;
        await ssh.execute(`cat > ${shellQuote(remoteScriptPath)} <<'EOF'\n${getRoutingPortScript}\nEOF`).catch(() => undefined);
        const { stdout, code } = await ssh.execute(`python3 ${shellQuote(remoteScriptPath)} ${shellQuote(`${workDir}/${composeFile}`)}`).catch(() => ({ stdout: '', code: 1 }));
        await ssh.execute(`rm -f ${shellQuote(remoteScriptPath)}`).catch(() => undefined);

        if (code === 0 && stdout.trim()) {
            const parsed = parseInt(stdout.trim(), 10);
            if (parsed && !isNaN(parsed)) {
                return parsed;
            }
        }
        return 80;
    }

    private static async verifyComposePorts(ssh: SSHService, deploymentId: string, workDir: string, composeFile: string) {
        const getPortsScript = `
import sys, re
try:
    with open(sys.argv[1], 'r') as f:
        content = f.read()
except Exception as e:
    sys.exit(1)

ports = []
in_ports = False
ports_indent = -1

for line in content.splitlines():
    stripped = line.strip()
    if not stripped or stripped.startswith('#'):
        continue
    indent = len(line) - len(line.lstrip())
    if in_ports:
        if indent <= ports_indent:
            in_ports = False
        elif stripped.startswith('-'):
            port_val = stripped.lstrip('-').strip().strip('"').strip("'")
            parts = port_val.split(':')
            if len(parts) >= 2:
                host_port = parts[-2].split('/')[-1]
                host_port = ''.join(c for c in host_port if c.isdigit())
                if host_port:
                    ports.append(int(host_port))
            else:
                port_val = ''.join(c for c in parts[0] if c.isdigit())
                if port_val:
                    ports.append(int(port_val))
            continue
    if stripped == 'ports:':
        in_ports = True
        ports_indent = indent

print(' '.join(map(str, sorted(list(set(ports))))))
`;
        const remoteScriptPath = `/tmp/get_compose_ports_${deploymentId}.py`;
        await ssh.execute(`cat > ${shellQuote(remoteScriptPath)} <<'EOF'\n${getPortsScript}\nEOF`);
        const { stdout: portsOut, code } = await ssh.execute(`python3 ${shellQuote(remoteScriptPath)} ${shellQuote(`${workDir}/${composeFile}`)}`);
        await ssh.execute(`rm -f ${shellQuote(remoteScriptPath)}`).catch(() => undefined);

        if (code !== 0) {
            await LoggingService.log(deploymentId, 'Failed to parse docker-compose.yml ports', 'system', 'warn');
            return;
        }

        const ports = portsOut.trim().split(/\s+/).map(p => parseInt(p, 10)).filter(p => !isNaN(p));
        await LoggingService.log(deploymentId, `Detected ports from compose file: ${ports.join(', ')}`, 'system');

        for (const port of ports) {
            const checkCmd = `if command -v ss >/dev/null 2>&1; then ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .; else netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '[:.]${port}$'; fi`;
            const checkRes = await ssh.execute(checkCmd);
            if (checkRes.code === 0) {
                throw new DeploymentError('port_alloc', `Port ${port} is already in use on the target server. Please free this port before deploying.`, 'PORT_IN_USE');
            }
        }
        await LoggingService.log(deploymentId, 'All docker-compose ports are verified free', 'system');
    }

    private static async deployCompose(ssh: SSHService, deploymentId: string, workDir: string, composeFile: string, projectName: string) {
        await runCommand(ssh, deploymentId, 'system', `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(`${workDir}/${composeFile}`)} down -v >/dev/null 2>&1 || true`);
        await LoggingService.log(deploymentId, 'Starting Docker Compose stack...', 'system');
        const startCommand = `cd ${shellQuote(workDir)} && docker compose -p ${shellQuote(projectName)} -f ${shellQuote(composeFile)} up -d`;

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

        const { stdout: psOut } = await runCommand(ssh, deploymentId, 'system', `docker compose -p ${shellQuote(projectName)} -f ${shellQuote(`${workDir}/${composeFile}`)} ps -q`, 'container_create', 'DOCKER_COMPOSE_PS_FAILED');
        const containerIds = psOut.trim().split('\n').map(id => id.trim()).filter(Boolean);
        if (containerIds.length === 0) {
            throw new DeploymentError('container_create', 'Docker Compose did not start any containers', 'DOCKER_COMPOSE_NO_CONTAINERS');
        }

        await LoggingService.log(deploymentId, `Docker Compose started ${containerIds.length} containers`, 'system');
        return `compose:${projectName}`;
    }

    private static async deployContainer(ssh: SSHService, username: string, deploymentId: string, workDir: string, dockerName: string, imageTag: string, hostPort: number, appPort: number, hasEnv: boolean, isSandbox = false) {
        await this.removeContainerIfExists(ssh, deploymentId, dockerName, 'Removed previous container with matching Docker name', false);
        const envFlag = hasEnv ? ` --env-file ${shellQuote(EnvironmentService.getEnvPath(username, deploymentId))}` : '';
        const restartPolicy = isSandbox ? 'no' : 'unless-stopped';
        const createCommand = `docker create --name ${shellQuote(dockerName)} --restart ${restartPolicy} --read-only --tmpfs /tmp:rw,noexec,nosuid,size=128m --tmpfs /app/.next/cache:rw,noexec,nosuid,size=128m --tmpfs /var/cache/nginx:rw,noexec,nosuid,size=64m --tmpfs /var/run:rw,noexec,nosuid,size=16m --security-opt no-new-privileges --cap-drop ALL -p ${hostPort}:${appPort}${envFlag} ${shellQuote(imageTag)}`;
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

        const { stdout: state } = await runCommand(ssh, deploymentId, 'system', `docker inspect --format '{{.State.Running}} {{.State.Restarting}} {{.State.Status}}' ${shellQuote(containerId)}`, 'container_create', 'CONTAINER_START_FAILED');
        const [running, restarting, status] = state.trim().split(/\s+/);
        if (running !== 'true' || restarting === 'true' || status === 'restarting') {
            throw new DeploymentError('container_create', 'Container was created but did not reach a stable running state', 'CONTAINER_START_FAILED');
        }

        await runCommand(ssh, deploymentId, 'system', `docker top ${shellQuote(containerId)} >/dev/null`, 'container_create', 'CONTAINER_START_FAILED');
        const portCommand = `docker port ${shellQuote(containerId)} ${appPort}/tcp | grep -Eq '(^|:)${hostPort}$'`;
        await runCommand(ssh, deploymentId, 'system', portCommand, 'container_create', 'CONTAINER_PORT_NOT_EXPOSED');
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
        const safeProjectName = sanitizeName(deployment.project?.name || deployment.name || 'project');
        const baseDir = `/home/${shellPath(deployment.vps.username)}/deployforge/${safeProjectName}`;
        const releasePattern = `${baseDir}/releases/*-${deployment.id.slice(0, 8)}`;
        const staticPattern = `${baseDir}/static/*-${deployment.id.slice(0, 8)}`;
        const command = `rm -rf ${releasePattern} ${staticPattern}; if [ -L ${shellQuote(`${baseDir}/current`)} ] && readlink ${shellQuote(`${baseDir}/current`)} | grep -q ${shellQuote(deployment.id.slice(0, 8))}; then rm -f ${shellQuote(`${baseDir}/current`)}; fi; if [ -L ${shellQuote(`${baseDir}/static/current`)} ] && readlink ${shellQuote(`${baseDir}/static/current`)} | grep -q ${shellQuote(deployment.id.slice(0, 8))}; then rm -f ${shellQuote(`${baseDir}/static/current`)}; fi; rm -f ${shellQuote(EnvironmentService.getEnvPath(deployment.vps.username, deployment.id))}`;
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

    private static async assertRemotePortAvailable(ssh: SSHService, deploymentId: string, port: number) {
        const result = await ssh.execute(`if command -v ss >/dev/null 2>&1; then ss -ltn "( sport = :${port} )" | tail -n +2 | grep -q .; else netstat -ltn 2>/dev/null | awk '{print $4}' | grep -Eq '[:.]${port}$'; fi`);
        if (result.code === 0) throw new DeploymentError('port_alloc', `Port ${port} is already in use on the target server`, 'PORT_IN_USE');
        await LoggingService.log(deploymentId, `Reserved host port ${port}`, 'system');
    }
}
