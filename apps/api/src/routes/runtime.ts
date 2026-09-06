/**
 * /runtime — Runtime management routes
 *
 * POST /runtime/:vpsId/prepare   — Manual full prepare without a deployment
 * GET  /runtime/:vpsId/preflight — Preflight checklist for a given VPS
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '@deployforge/database';
import { buildStoredAuth } from '../services/vps.service';
import { RuntimeManagerService } from '../services/runtime-manager';
import { SSHService } from '@deployforge/vps';

export default async function runtimeRoutes(fastify: FastifyInstance) {

    // ── POST /runtime/:vpsId/prepare ─────────────────────────────────────────
    // Manual environment preparation (no active deployment required).
    // Returns full PrepareResult including scan, diff, plan, logs, verification.
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

    // ── GET /runtime/:vpsId/preflight ────────────────────────────────────────
    // Generate a preflight checklist for the given VPS (and optionally a specific deployment).
    // Used by the frontend PreflightPanel before showing the Deploy button.
    fastify.get('/:vpsId/preflight', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        const { vpsId } = z.object({ vpsId: z.string().uuid() }).parse(request.params);
        const { deploymentId } = (request.query as any) || {};

        const vps = await prisma.vPS.findFirst({ where: { id: vpsId, userId: request.user!.id } });
        if (!vps) {
            return reply.status(404).send({ success: false, error: { code: 'VPS_NOT_FOUND', message: 'VPS not found' } });
        }

        // Project requirements can be passed or detected dynamically; default to empty scan
        let projectFiles: string[] = [];
        let fileContents: Record<string, string> = {};

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

    // ── GET /runtime/runtimes ────────────────────────────────────────────────
    // Returns the list of runtimes that can be installed via the API (allow-list).
    fastify.get('/runtimes', {
        preHandler: [(fastify as any).authGuard],
    }, async (_request, _reply) => {
        const { RuntimeInstaller } = await import('../services/runtime-manager/runtime-installer');
        return { success: true, data: RuntimeInstaller.getAllowedRuntimes() };
    });
}
