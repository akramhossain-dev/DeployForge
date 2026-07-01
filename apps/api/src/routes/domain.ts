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

const DOMAIN_LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const domainNameValidator = z
    .string()
    .min(1, 'Domain name is required')
    .max(253, 'Domain name is too long')
    .toLowerCase()
    .trim()
    .refine((v) => !v.startsWith('http'), { message: 'Domain must not include a protocol (http/https)' })
    .refine((v) => !v.includes('/') && !v.includes(' ') && !v.includes('_'), { message: 'Domain contains invalid characters' })
    .refine((v) => v.includes('.') && !v.includes('..'), { message: 'Domain must be a valid FQDN' })
    .refine(
        (v) => {
            const labels = v.split('.');
            const tld = labels[labels.length - 1];
            return labels.length >= 2
                && labels.every((l) => DOMAIN_LABEL_RE.test(l))
                && /^[a-z]{2,63}$/.test(tld);
        },
        { message: 'Domain format is invalid' }
    );

const verifyDnsParamsSchema = z.object({
    domainName: domainNameValidator,
});

const verifyDnsQuerySchema = z.object({
    vpsIp: z.string().ip({ message: 'A valid VPS IP address is required' }),
});

export default async function domainRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    // Attach / Add a domain
    fastify.post('/attach', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { deploymentId, domainName } = attachDomainSchema.parse(request.body);
            const domain = await DomainService.attachDomain(request.user.id, deploymentId, domainName);
            return { success: true, data: sanitizeDomain(domain) };
        } catch (err: any) {
            const nginxErrors = new Set(['NGINX_NOT_INSTALLED', 'NGINX_PERMISSION_DENIED', 'NGINX_CONFIG_TEST_FAILED', 'NGINX_CONFIG_ERROR']);
            const status =
                err.errorCode === 'DEPLOYMENT_NOT_FOUND' ? 404
                : err.errorCode === 'DOMAIN_ALREADY_EXISTS' ? 409
                : err.errorCode === 'UNAUTHORIZED' ? 403
                : nginxErrors.has(err.errorCode) ? 422
                : 400;
            return reply.status(status).send({
                success: false,
                error: {
                    code: err.errorCode || 'DOMAIN_BIND_FAILED',
                    message: err.message || 'Domain binding failed',
                    stage: err.stage || 'domain_bind',
                },
            });
        }
    });


    // Remove a domain
    fastify.delete('/remove/:domainId', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { domainId } = z.object({ domainId: z.string().uuid() }).parse(request.params);
            await verifyDomainOwnership(request.user.id, domainId, request);
            const result = await DomainService.removeDomain(request.user.id, domainId);
            return {
                success: true,
                data: { message: 'Domain removed successfully' },
                ...(result.warning ? { warning: result.warning } : {}),
            };
        } catch (err: any) {
            const status = err.statusCode || 400;
            return reply.status(status).send({
                success: false,
                error: { code: err.errorCode || 'DOMAIN_REMOVE_FAILED', message: err.message || 'Domain removal failed' },
            });
        }
    });

    // Issue SSL certificate
    fastify.post('/ssl/issue/:domainId', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { domainId } = sslIssueParamsSchema.parse(request.params);
            await verifyDomainOwnership(request.user.id, domainId, request);
            await DomainService.issueSSL(request.user.id, domainId);
            return { success: true, data: { message: 'SSL certificate issued successfully' } };
        } catch (err: any) {
            const status = err.statusCode || 400;
            return reply.status(status).send({
                success: false,
                error: {
                    code: err.errorCode || 'SSL_ISSUE_FAILED',
                    message: err.message || 'SSL issuance failed',
                },
            });
        }
    });

    // Toggle Auto-HTTPS (HTTP -> HTTPS redirect)
    fastify.post('/auto-https/:domainId', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { domainId } = z.object({ domainId: z.string().uuid() }).parse(request.params);
            const { enabled } = z.object({ enabled: z.boolean() }).parse(request.body);
            await verifyDomainOwnership(request.user.id, domainId, request);
            const domain = await DomainService.setAutoHttps(request.user.id, domainId, enabled);
            return { success: true, data: sanitizeDomain(domain) };
        } catch (err: any) {
            const status = err.statusCode || 400;
            return reply.status(status).send({
                success: false,
                error: { code: err.errorCode || 'AUTO_HTTPS_FAILED', message: err.message || 'Auto-HTTPS toggle failed' },
            });
        }
    });

    // List all domains for current user
    fastify.get('/list', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, _reply) => {
        const domains = await prisma.domain.findMany({
            where: {
                deployment: {
                    OR: [
                        { userId: request.user.id },
                        {
                            project: {
                                OR: [
                                    { userId: request.user.id },
                                    { members: { some: { userId: request.user.id } } }
                                ]
                            }
                        }
                    ]
                }
            },
            include: { deployment: { select: { id: true, name: true, port: true, vpsId: true } } },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: domains.map(sanitizeDomain).filter(Boolean) };
    });

    // List subdomains for a specific deployment
    fastify.get('/subdomains/:deploymentId', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, _reply) => {
        const { deploymentId } = z.object({ deploymentId: z.string().uuid() }).parse(request.params);
        // MEDIUM FIX #13: Exclude DELETED records — they were previously returned and
        // required the frontend to filter, leaking soft-deleted data unnecessarily.
        const domains = await prisma.domain.findMany({
            where: {
                deploymentId,
                deployment: {
                    OR: [
                        { userId: request.user.id },
                        {
                            project: {
                                OR: [
                                    { userId: request.user.id },
                                    { members: { some: { userId: request.user.id } } }
                                ]
                            }
                        }
                    ]
                },
                status: { not: 'DELETED' },
            },
            orderBy: { createdAt: 'desc' },
        });
        const subdomains = domains
            .map(sanitizeDomain)
            .filter(Boolean)
            .map((d: any) => ({
                ...d,
                isSubdomain: d.domainName.split('.').length > 2,
                subdomain: d.domainName.split('.').length > 2 ? d.domainName.split('.')[0] : null,
                rootDomain: d.domainName.split('.').slice(-2).join('.'),
            }));
        return { success: true, data: subdomains };
    });

    // Detailed DNS verification
    fastify.get('/verify-dns/:domainName', {
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { domainName } = verifyDnsParamsSchema.parse(request.params);
            const { vpsIp } = verifyDnsQuerySchema.parse(request.query);
            const result = await DomainService.verifyDNSDetailed(domainName, vpsIp);
            return { success: true, data: result };
        } catch (err: any) {
            return reply.status(400).send({
                success: false,
                error: { code: err.errorCode || 'DNS_CHECK_FAILED', message: err.message || 'DNS verification failed' },
            });
        }
    });
}
