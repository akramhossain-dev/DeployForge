import { FastifyInstance } from 'fastify';
import { DomainService } from '../services/domain.service';
import { z } from 'zod';
import prisma from '@deployforge/database';

const attachDomainSchema = z.object({
    deploymentId: z.string().uuid(),
    domainName: z.string(),
});

export default async function domainRoutes(fastify: FastifyInstance) {
    // 1. Attach Domain
    fastify.post('/attach', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { deploymentId, domainName } = attachDomainSchema.parse(request.body);
        const domain = await DomainService.attachDomain(request.user.id, deploymentId, domainName);
        return { success: true, data: domain };
    });

    // 2. Issue SSL
    fastify.post('/ssl/issue/:domainId', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { domainId } = request.params as { domainId: string };
        await DomainService.issueSSL(request.user.id, domainId);
        return { success: true, message: 'SSL issuance triggered' };
    });

    // 3. List Domains
    fastify.get('/list', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const domains = await prisma.domain.findMany({
            where: { deployment: { userId: request.user.id } },
            include: { deployment: true },
        });
        return { success: true, data: domains };
    });

    // 4. Verify DNS Status
    fastify.get('/verify-dns/:domainName', { preHandler: [(fastify as any).authGuard] }, async (request, reply) => {
        const { domainName } = request.params as { domainName: string };
        const { vpsIp } = request.query as { vpsIp: string };
        const isValid = await DomainService.verifyDNS(domainName, vpsIp);
        return { success: true, isValid };
    });
}
