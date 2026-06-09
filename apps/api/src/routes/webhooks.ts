import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import prisma from '@deployforge/database';
import { deploymentQueue } from '../utils/queue';

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
                // Add to deployment queue (placeholder for Phase 4)
                await deploymentQueue.add('deploy', {
                    projectId: project.id,
                    commitHash: payload.after,
                    commitMessage: payload.head_commit?.message,
                });

                fastify.log.info(`Deployment queued for project ${project.id} from push to branch ${branch}`);
            }
        }

        return { received: true };
    });
}
