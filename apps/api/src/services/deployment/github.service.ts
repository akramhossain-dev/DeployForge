import prisma from '@deployforge/database';
import { SSHService } from '@deployforge/vps';
import { GitHubService } from '../github.service';
import { LoggingService } from '../logging.service';
import { logger } from '../../utils/logger';
import { DeploymentError } from './error';
import { GitHubDeploymentSource } from './types';
import { runCommand } from './runner';
import { shellQuote, extractRepoFullName } from './utils';

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
        const repoUrl = repositoryUrl.replace(/^https:\/\//, `https://${encodeURIComponent(source.accessToken)}@`);
        await LoggingService.log(deploymentId, `Cloning branch ${source.branch}`, 'build');
        await runCommand(ssh, deploymentId, 'build', `rm -rf ${shellQuote(workDir)} && git clone --depth 1 -b ${shellQuote(source.branch)} ${shellQuote(repoUrl)} ${shellQuote(workDir)}`, 'cloning', 'GIT_CLONE_FAILED');
    }
}
