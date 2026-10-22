
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { buildStoredAuth } from '../services/vps.service';
import { RuntimeManagerService } from '../services/runtime-manager';
import { SSHService } from '@deployforge/vps';

export default async function runtimeRoutes(fastify: FastifyInstance) {

    fastify.post('/:vpsId/prepare', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    }, async (request, reply) => {
        const { vpsId } = z.object({ vpsId: z.string().uuid() }).parse(request.params);
        const { projectFiles = [], fileContents = {} } = (request.body as any) || {};

        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId: request.user!.id } });
        if (!vps) {
            return reply.status(404).send({ success: false, error: { code: 'VPS_NOT_FOUND', message: 'VPS not found' } });
        }

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...buildStoredAuth(vps),
            });

            const result = await RuntimeManagerService.analyzeAndPrepare(ssh, projectFiles, fileContents);
            return { success: true, data: result };
        } finally {
            ssh.disconnect();
        }
    });

    fastify.get('/:vpsId/preflight', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { vpsId } = z.object({ vpsId: z.string().uuid() }).parse(request.params);
        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId: request.user!.id } });
        if (!vps) {
            return reply.status(404).send({ success: false, error: { code: 'VPS_NOT_FOUND', message: 'VPS not found' } });
        }

        const projectFiles: string[] = [];
        const fileContents: Record<string, string> = {};

        const ssh = new SSHService();
        try {
            await ssh.connect({
                host: vps.ipAddress,
                port: vps.port,
                username: vps.username,
                ...buildStoredAuth(vps),
            });

            const scan = await RuntimeManagerService.scanEnvironment(ssh);
            const requirements = (await import('../services/runtime-manager/requirements-detector')).RequirementsDetector.detect(projectFiles, fileContents);
            const preflight = await RuntimeManagerService.generatePreflight(ssh, requirements, scan);

            return { success: true, data: { preflight, scan } };
        } finally {
            ssh.disconnect();
        }
    });

    fastify.get('/runtimes', {
        preHandler: [(fastify as any).authGuard],
    }, async (_request, _reply) => {
        const { RuntimeInstaller } = await import('../services/runtime-manager/runtime-installer');
        return { success: true, data: RuntimeInstaller.getAllowedRuntimes() };
    });
}
