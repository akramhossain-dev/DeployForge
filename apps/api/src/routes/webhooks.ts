import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import prisma from '@deployforge/database';
import { DeploymentService } from '../services/deployment.service';

export default async function webhookRoutes(fastify: FastifyInstance) {
    fastify.post('/github', {
        config: {
            rateLimit: { max: 120, timeWindow: '1 minute' },
        },
    }, async (request, reply) => {
        const signature = request.headers['x-hub-signature-256'] as string;
        const body = (request as any).rawBody || JSON.stringify(request.body || {});

        if (!GitHubService.verifySignature(body, signature)) {
            fastify.log.warn('Invalid webhook signature');
            return reply.status(401).send({ success: false, stage: 'webhook', message: 'Invalid signature', errorCode: 'INVALID_WEBHOOK_SIGNATURE' });
        }

        const event = request.headers['x-github-event'] as string;
        const payload = request.body as any;
        const repoId = payload?.repository?.id?.toString?.() || 'unknown';
        const webhookEvent = await prisma.webhookEvent.create({
            data: {
                repoId,
                event,
                payload: body,
            },
        });

        try {
            if (event === 'ping') {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { received: true };
            }

            if (event === 'pull_request') {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { received: true, ignored: 'pull_request deploys are not enabled' };
            }

            if (event !== 'push') {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { received: true, ignored: `unsupported event ${event}` };
            }

            const branch = payload.ref?.replace('refs/heads/', '');
            if (!branch || !['main', 'master', payload.repository?.default_branch].includes(branch)) {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { received: true, ignored: `branch ${branch || 'unknown'} is not configured for auto deploy` };
            }

            // Find if we have a project for this repository and branch
            const project = await prisma.project.findFirst({
                where: {
                    repositoryUrl: { contains: payload.repository.html_url },
                    branch: branch,
                },
            });

            if (project) {
                const previousDeployment = await prisma.deployment.findFirst({
                    where: { projectId: project.id, userId: project.userId },
                    orderBy: { createdAt: 'desc' },
                    select: { vpsId: true },
                });

                if (!previousDeployment) {
                    fastify.log.warn({ projectId: project.id, repoId, branch }, 'Webhook received for project without a deployment target');
                    await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                    return { received: true };
                }

                const deployment = await DeploymentService.deployProject(project.userId, {
                    type: 'github_repo',
                    projectId: project.id,
                    vpsId: previousDeployment.vpsId,
                    branch,
                    commitHash: payload.after,
                    commitMessage: payload.head_commit?.message,
                    skipWebhookRegistration: true,
                });

                fastify.log.info({ deploymentId: deployment.id, projectId: project.id, branch }, 'Deployment queued from GitHub webhook');
            }

            await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
        } catch (err: any) {
            await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: { status: 'FAILED', error: err.message || 'Webhook processing failed' },
            });
            throw err;
        }

        return { received: true };
    });
}
