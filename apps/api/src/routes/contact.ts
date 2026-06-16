import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';

const contactSchema = z.object({
    name: z.string().min(2).max(80),
    email: z.string().email().max(160),
    subject: z.string().min(4).max(140),
    message: z.string().min(20).max(4000),
});

function sanitizeText(value: string, options: { collapseWhitespace?: boolean } = {}) {
    const withoutControlChars = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    const withoutAngleBrackets = withoutControlChars.replace(/[<>]/g, '');
    const trimmed = withoutAngleBrackets.trim();
    return options.collapseWhitespace ? trimmed.replace(/\s+/g, ' ') : trimmed;
}

export default async function contactRoutes(fastify: FastifyInstance) {
    fastify.post('/', {
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '10 minutes',
            },
        },
    }, async (request, reply) => {
        const body = request.body as any;
        const parsed = contactSchema.parse({
            name: sanitizeText(String(body?.name || ''), { collapseWhitespace: true }),
            email: sanitizeText(String(body?.email || ''), { collapseWhitespace: true }).toLowerCase(),
            subject: sanitizeText(String(body?.subject || ''), { collapseWhitespace: true }),
            message: sanitizeText(String(body?.message || '')),
        });

        const message = await prisma.contactMessage.create({
            data: {
                ...parsed,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            },
        });

        request.log.info({ contactMessageId: message.id, email: parsed.email }, 'Contact form submitted');

        return reply.send({
            success: true,
            data: {
                message: 'Thanks for reaching out. The DeployForge team will review your message.',
            }
        });
    });
}
