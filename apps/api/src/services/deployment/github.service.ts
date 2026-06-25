import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { GitHubService } from '../github.service';
import { LoggingService } from '../logging.service';
import { logger } from '../../utils/logger';
import { DeploymentError } from './error';
import { GitHubDeploymentSource } from './types';
import { runCommand } from './runner';
import { shellQuote, extractRepoFullName } from './utils';
import crypto from 'node:crypto';

const GIT_TIMEOUT_MS = 2 * 60 * 1000;

export class GitHubDeploymentService {
    static async ensureRepositoryWebhook(userId: string, repositoryUrl: string, deploymentId?: string) {
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
            logger.warn({ message }, 'Deployment webhook registration skipped');
        }
    }

    static async prepareGithubSource(ssh: SSHService, deploymentId: string, source: GitHubDeploymentSource, repositoryUrl: string, workDir: string) {
        if (!source.accessToken) throw new DeploymentError('cloning', 'Missing GitHub access token', 'MISSING_GITHUB_TOKEN');
        
        const repoUrl = repositoryUrl.replace(/^https:\/\/(?:[^@]+@)?/, 'https://x-access-token@');
        await LoggingService.log(deploymentId, `Preparing repository source for branch ${source.branch}...`, 'build');

        const quotedWorkDir = shellQuote(workDir);
        const quotedBranch = shellQuote(source.branch);
        const quotedRepoUrl = shellQuote(repoUrl);

        const askpassId = crypto.randomUUID();
        const askpassPath = `/tmp/git-askpass-${askpassId}.sh`;
        const writeAskpassCmd = `cat > ${shellQuote(askpassPath)} <<'EOF'\n#!/bin/sh\necho ${shellQuote(source.accessToken)}\nEOF\nchmod 700 ${shellQuote(askpassPath)}`;

        try {
            await runCommand(ssh, deploymentId, 'system', writeAskpassCmd, 'cloning', 'GIT_ASKPASS_PREPARATION_FAILED');

            const gitEnv =
                `export GIT_TERMINAL_PROMPT=0 && ` +
                `export GIT_ASKPASS=${shellQuote(askpassPath)} && ` +
                `export GIT_HTTP_LOW_SPEED_LIMIT=1024 && ` +
                `export GIT_HTTP_LOW_SPEED_TIME=30 && `;

            const command = gitEnv +
                `if [ -d ${quotedWorkDir}/.git ] && cd ${quotedWorkDir} && ` +
                `git remote set-url origin ${quotedRepoUrl} && ` +
                `git fetch --depth 1 origin ${quotedBranch} && ` +
                `git checkout -B ${quotedBranch} origin/${quotedBranch} && ` +
                `git reset --hard origin/${quotedBranch} && ` +
                `git clean -fdx -e node_modules -e .next/cache; then ` +
                `echo "Incremental fetch successful. Reused cached repository."; ` +
                `else ` +
                `echo "Cache miss or update failed. Performing clean clone..."; ` +
                `rm -rf ${quotedWorkDir} && ` +
                `git clone --depth 1 -b ${quotedBranch} ${quotedRepoUrl} ${quotedWorkDir}; ` +
                `fi`;

            await runCommand(ssh, deploymentId, 'build', command, 'cloning', 'GIT_CLONE_FAILED', GIT_TIMEOUT_MS);
        } finally {
            await ssh.execute(`rm -f ${shellQuote(askpassPath)}`).catch((err) => {
                logger.warn({ err, askpassPath }, 'Failed to clean up temporary git-askpass script');
            });
        }
    }
}
