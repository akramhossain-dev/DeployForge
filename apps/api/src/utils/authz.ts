import prisma from '@deployforge/database';
import { AccountService } from '../services/account.service';
import { FastifyRequest } from 'fastify';

export async function verifyDeploymentOwnership(userId: string, deploymentId: string, request?: FastifyRequest, allowedRoles?: string[]) {
    const deployment = await prisma.deployment.findFirst({
        where: {
            id: deploymentId,
            OR: [
                { userId: userId },
                {
                    project: {
                        OR: [
                            { userId: userId },
                            { members: { some: { userId: userId, ...(allowedRoles ? { role: { in: allowedRoles as any } } : {}) } } }
                        ]
                    }
                }
            ]
        },
        include: {
            project: {
                include: {
                    members: {
                        where: { userId }
                    }
                }
            }
        }
    });

    if (!deployment) {
        const exists = await prisma.deployment.findUnique({
            where: { id: deploymentId }
        });

        if (exists) {
            await AccountService.logAudit(
                userId,
                'UNAUTHORIZED_DEPLOYMENT_ACCESS',
                `User ${userId} attempted to access deployment ${deploymentId} owned by ${exists.userId}`,
                request?.ip,
                request?.headers['user-agent'] as string,
                {
                    targetResource: 'deployment',
                    resourceId: deploymentId,
                    route: request?.url,
                    timestamp: new Date().toISOString()
                }
            );
            const err = new Error('Forbidden') as any;
            err.statusCode = 403;
            err.expose = true;
            throw err;
        }

        const err = new Error('Deployment not found') as any;
        err.statusCode = 404;
        err.expose = true;
        throw err;
    }

    return deployment;
}

export async function verifyVpsOwnership(userId: string, vpsId: string, request?: FastifyRequest) {
    const vps = await prisma.vPS.findFirst({
        where: {
            id: vpsId,
            OR: [
                { userId: userId },
                {
                    deployments: {
                        some: {
                            project: {
                                OR: [
                                    { userId: userId },
                                    { members: { some: { userId: userId } } }
                                ]
                            }
                        }
                    }
                }
            ]
        }
    });

    if (!vps) {
        const exists = await prisma.vPS.findUnique({
            where: { id: vpsId }
        });

        if (exists) {
            await AccountService.logAudit(
                userId,
                'UNAUTHORIZED_VPS_ACCESS',
                `User ${userId} attempted to access VPS ${vpsId} owned by ${exists.userId}`,
                request?.ip,
                request?.headers['user-agent'] as string,
                {
                    targetResource: 'vps',
                    resourceId: vpsId,
                    route: request?.url,
                    timestamp: new Date().toISOString()
                }
            );
            const err = new Error('Forbidden') as any;
            err.statusCode = 403;
            err.expose = true;
            throw err;
        }

        const err = new Error('VPS not found') as any;
        err.statusCode = 404;
        err.expose = true;
        throw err;
    }

    return vps;
}

export async function verifyDomainOwnership(userId: string, domainId: string, request?: FastifyRequest) {
    const domain = await prisma.domain.findFirst({
        where: {
            id: domainId,
            deployment: {
                OR: [
                    { userId: userId },
                    {
                        project: {
                            OR: [
                                { userId: userId },
                                { members: { some: { userId: userId } } }
                            ]
                        }
                    }
                ]
            }
        },
        include: {
            deployment: true
        }
    });

    if (!domain) {
        const exists = await prisma.domain.findUnique({
            where: { id: domainId },
            include: { deployment: true }
        });

        if (exists) {
            await AccountService.logAudit(
                userId,
                'UNAUTHORIZED_SSL_REQUEST',
                `User ${userId} attempted to access Domain/SSL ${domainId} owned by ${exists.deployment.userId}`,
                request?.ip,
                request?.headers['user-agent'] as string,
                {
                    targetResource: 'domain',
                    resourceId: domainId,
                    route: request?.url,
                    timestamp: new Date().toISOString()
                }
            );
            const err = new Error('Forbidden') as any;
            err.statusCode = 403;
            err.expose = true;
            throw err;
        }

        const err = new Error('Domain not found') as any;
        err.statusCode = 404;
        err.expose = true;
        throw err;
    }

    await verifyDeploymentOwnership(userId, domain.deploymentId, request);

    return domain;
}

export async function verifySandboxOwnership(userId: string, deploymentId: string, request?: FastifyRequest) {
    const sandbox = await prisma.deploymentSandbox.findFirst({
        where: {
            deploymentId: deploymentId,
            deployment: {
                OR: [
                    { userId: userId },
                    {
                        project: {
                            OR: [
                                { userId: userId },
                                { members: { some: { userId: userId } } }
                            ]
                        }
                    }
                ]
            }
        },
        include: {
            deployment: true
        }
    });

    if (!sandbox) {
        const exists = await prisma.deploymentSandbox.findUnique({
            where: { deploymentId },
            include: { deployment: true }
        });

        if (exists) {
            await AccountService.logAudit(
                userId,
                'UNAUTHORIZED_SANDBOX_ACCESS',
                `User ${userId} attempted to access Sandbox Result for deployment ${deploymentId} owned by ${exists.deployment.userId}`,
                request?.ip,
                request?.headers['user-agent'] as string,
                {
                    targetResource: 'sandbox',
                    resourceId: exists.id,
                    route: request?.url,
                    timestamp: new Date().toISOString()
                }
            );
            const err = new Error('Forbidden') as any;
            err.statusCode = 403;
            err.expose = true;
            throw err;
        }

        await verifyDeploymentOwnership(userId, deploymentId, request);

        const err = new Error('Sandbox result not found') as any;
        err.statusCode = 404;
        err.expose = true;
        throw err;
    }

    return sandbox;
}
