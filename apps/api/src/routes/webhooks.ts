import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import prisma from '@deployforge/database';
import { DeploymentService } from '../services/deployment.service';

export default async function webhookRoutes(fastify: FastifyInstance) {
    fastify.post('/github', async (request, reply) => {
        const signature = request.headers['x-hub-signature-256'] as string;
        const body = JSON.stringify(request.body);

        if (!GitHubService.verifySignature(body, signature)) {
            fastify.log.warn('Invalid webhook signature');
            return reply.status(401).send({ message: 'Invalid signature' });
        }

        const event = request.headers['x-github-event'] as string;
        const payload = request.body as any;

        if (event === 'push') {
            const repoId = payload.repository.id.toString();
            const branch = payload.ref.replace('refs/heads/', '');

            // Log the event
            await prisma.webhookEvent.create({
                data: {
                    repoId,
                    event,
                    payload: body,
                },
            });

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
                    return { received: true };
                }

                const deployment = await DeploymentService.deployFromGithub(project.userId, project.id, previousDeployment.vpsId, branch);
                await prisma.deployment.update({
                    where: { id: deployment.id },
                    data: {
                        commitHash: payload.after,
                        commitMessage: payload.head_commit?.message,
                    },
                });

                fastify.log.info({ deploymentId: deployment.id, projectId: project.id, branch }, 'Deployment queued from GitHub webhook');
            }
        }

        return { received: true };
    });
}
