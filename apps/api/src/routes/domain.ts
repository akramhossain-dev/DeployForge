import { FastifyInstance } from 'fastify';
import { DomainService } from '../services/domain.service';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { verifyDomainOwnership } from '../utils/authz';
import { sanitizeDomain } from '../utils/sanitizers';

const attachDomainSchema = z.object({
    deploymentId: z.string().uuid({ message: 'Invalid deploymentId format' }),
    domainName: z.string().min(1, 'Domain name is required'),
});

const sslIssueParamsSchema = z.object({
    domainId: z.string().uuid({ message: 'Invalid domain ID format' }),
});

const verifyDnsParamsSchema = z.object({
    domainName: z.string().min(1, 'Domain name is required'),
});

const verifyDnsQuerySchema = z.object({
    vpsIp: z.string().ip({ message: 'A valid VPS IP address is required' }),
});

export default async function domainRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    // 1. Attach Domain
    fastify.post('/attach', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive: 5/min
    }, async (request, reply) => {
        try {
            const { deploymentId, domainName } = attachDomainSchema.parse(request.body);
            const domain = await DomainService.attachDomain(request.user.id, deploymentId, domainName);
            return { success: true, data: sanitizeDomain(domain) };
        } catch (err: any) {
            const status = err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404 : err.errorCode === 'DOMAIN_ALREADY_EXISTS' ? 409 : 400;
            return reply.status(status).send({
                success: false,
                error: {
                    code: err.errorCode || 'DOMAIN_BIND_FAILED',
                    message: err.message || 'Domain binding failed',
                    stage: err.stage || 'domain_bind',
                }
            });
        }
    });

    // 2. Issue SSL
    fastify.post('/ssl/issue/:domainId', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, // Sensitive: 5/min
    }, async (request, reply) => {
        const { domainId } = sslIssueParamsSchema.parse(request.params);
        await verifyDomainOwnership(request.user.id, domainId, request);
        await DomainService.issueSSL(request.user.id, domainId);
        return { success: true, data: { message: 'SSL issuance triggered' } };
    });

    // 3. List Domains
    fastify.get('/list', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const domains = await prisma.domain.findMany({
            where: { deployment: { userId: request.user.id } },
            include: { deployment: true },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: domains.map(sanitizeDomain).filter(Boolean) };
    });

    // 4. Verify DNS Status
    fastify.get('/verify-dns/:domainName', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { domainName } = verifyDnsParamsSchema.parse(request.params);
        const { vpsIp } = verifyDnsQuerySchema.parse(request.query);
        const isValid = await DomainService.verifyDNS(domainName, vpsIp);
        return { success: true, data: { isValid } };
    });
}
