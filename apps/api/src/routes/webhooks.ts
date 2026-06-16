import { FastifyInstance } from 'fastify';
import { GitHubService } from '../services/github.service';
import prisma from '@deployforge/database';
import { DeploymentService } from '../services/deployment.service';
import { z } from 'zod';
import { HardeningService } from '../services/hardening.service';

const githubPushPayloadSchema = z.object({
    ref: z.string().min(1),
    after: z.string().min(1),
    head_commit: z.object({
        message: z.string().optional(),
    }).nullable().optional(),
    repository: z.object({
        id: z.number(),
        html_url: z.string().url(),
        default_branch: z.string().optional(),
    }),
});

export default async function webhookRoutes(fastify: FastifyInstance) {
    fastify.post('/github', {
        config: {
            rateLimit: { max: 120, timeWindow: '1 minute' },
        },
    }, async (request, reply) => {
        const signature = request.headers['x-hub-signature-256'] as string;
        const deliveryId = request.headers['x-github-delivery'] as string;
        const event = request.headers['x-github-event'] as string;

        if (!deliveryId) {
            fastify.log.warn('Webhook request missing x-github-delivery header');
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Missing x-github-delivery header'
                }
            });
        }

        if (!event) {
            fastify.log.warn({ deliveryId }, 'Webhook request missing x-github-event header');
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Missing x-github-event header'
                }
            });
        }

        const body = (request as any).rawBody || JSON.stringify(request.body || {});

        // Strict 1MB size limit check
        if (body.length > 1024 * 1024) {
            fastify.log.warn({ deliveryId }, 'Webhook payload exceeds size limit');
            return reply.status(413).send({
                success: false,
                error: {
                    code: 'PAYLOAD_TOO_LARGE',
                    message: 'Webhook payload size limit exceeded'
                }
            });
        }

        // Timing-safe signature validation
        if (!signature || !GitHubService.verifySignature(body, signature)) {
            fastify.log.warn({ deliveryId }, 'Invalid webhook signature');
            return reply.status(401).send({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid webhook signature'
                }
            });
        }

        const payload = request.body as any;
        const repoId = payload?.repository?.id?.toString?.() || 'unknown';

        // Replay Protection: Unique constraint on WebhookEvent.id
        let webhookEvent;
        try {
            webhookEvent = await prisma.webhookEvent.create({
                data: {
                    id: deliveryId,
                    repoId,
                    event,
                    payload: HardeningService.limitWebhookPayload(body),
                },
            });
        } catch (dbErr: any) {
            if (dbErr.code === 'P2002') {
                fastify.log.warn({ deliveryId }, 'Duplicate webhook event received (replay attack blocked)');
                return reply.status(409).send({
                    success: false,
                    error: {
                        code: 'CONFLICT',
                        message: 'Duplicate webhook delivery'
                    }
                });
            }
            fastify.log.error({ dbErr, deliveryId }, 'Failed to record webhook event');
            throw dbErr;
        }

        try {
            if (event === 'ping') {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { success: true, data: { received: true } };
            }

            if (event === 'pull_request') {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { success: true, data: { received: true, ignored: 'pull_request deploys are not enabled' } };
            }

            if (event !== 'push') {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { success: true, data: { received: true, ignored: `unsupported event ${event}` } };
            }

            // Payload validation with Zod
            const parsed = githubPushPayloadSchema.parse(payload);

            const branch = parsed.ref.replace('refs/heads/', '');
            if (!branch || !['main', 'master', parsed.repository.default_branch].includes(branch)) {
                await prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { status: 'PROCESSED' } });
                return { success: true, data: { received: true, ignored: `branch ${branch || 'unknown'} is not configured for auto deploy` } };
            }

            const project = await prisma.project.findFirst({
                where: {
                    repositoryUrl: { contains: parsed.repository.html_url },
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
                    return { success: true, data: { received: true } };
                }

                const deployment = await DeploymentService.deployProject(project.userId, {
                    type: 'github_repo',
                    projectId: project.id,
                    vpsId: previousDeployment.vpsId,
                    branch,
                    commitHash: parsed.after,
                    commitMessage: parsed.head_commit?.message,
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
            fastify.log.error({ err, deliveryId }, 'Error processing webhook event');
            return reply.status(err instanceof z.ZodError ? 400 : 500).send({
                success: false,
                error: {
                    code: err instanceof z.ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_SERVER_ERROR',
                    message: err.message || 'Webhook processing failed'
                }
            });
        }

        return { success: true, data: { received: true } };
    });
}
