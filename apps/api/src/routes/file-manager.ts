import { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { FileManagerService, FileManagerError } from '../services/file-manager.service';

const vpsParam = z.object({ vpsId: z.string().uuid() });
const pathQuery = z.object({ path: z.string().min(0).max(4096).default('~') });
const searchQuery = z.object({
    path: z.string().max(4096).default('~'),
    query: z.string().max(256).optional(),
    extension: z.string().max(20).optional(),
});
const createBody = z.object({
    path: z.string().min(1).max(4096),
    type: z.enum(['file', 'directory']),
});
const renameBody = z.object({ oldPath: z.string().min(1).max(4096), newPath: z.string().min(1).max(4096) });
const copyBody = z.object({ srcPath: z.string().min(1).max(4096), dstPath: z.string().min(1).max(4096) });
const saveBody = z.object({ path: z.string().min(1).max(4096), content: z.string().max(20 * 1024 * 1024) });
const deleteBody = z.object({ paths: z.array(z.string().min(1).max(4096)).min(1).max(100) });
const compressBody = z.object({
    parentDir: z.string().min(1).max(4096),
    paths: z.array(z.string().min(1).max(4096)).min(1).max(100),
    archiveName: z.string().min(1).max(256),
});
const decompressBody = z.object({
    zipFilePath: z.string().min(1).max(4096),
    destDir: z.string().min(1).max(4096).optional(),
});

function fmError(reply: FastifyReply, error: unknown) {
    if (error instanceof FileManagerError) {
        return reply.status(error.statusCode).send({ success: false, error: { code: error.errorCode, message: error.message } });
    }
    if (error instanceof z.ZodError) {
        return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid request' } });
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return reply.status(500).send({ success: false, error: { code: 'FILE_MANAGER_ERROR', message: msg } });
}

const readLimit = { max: 60, timeWindow: '1 minute' };
const writeLimit = { max: 30, timeWindow: '1 minute' };
const uploadLimit = { max: 20, timeWindow: '1 minute' };
const dlLimit = { max: 15, timeWindow: '1 minute' };

export default async function fileManagerRoutes(fastify: FastifyInstance) {

    // ── Info ─────────────────────────────────────────────────────────────────
    fastify.get('/:vpsId/info', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: readLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const info = await FileManagerService.getVpsInfo(request.user!.id, vpsId);
            return { success: true, data: info };
        } catch (e) { return fmError(reply, e); }
    });

    // ── List directory ────────────────────────────────────────────────────────
    fastify.get('/:vpsId/list', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: readLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath } = pathQuery.parse(request.query);
            const listing = await FileManagerService.listDirectory(request.user!.id, vpsId, clientPath);
            return { success: true, data: listing };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Read file ─────────────────────────────────────────────────────────────
    fastify.get('/:vpsId/read', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: readLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath } = pathQuery.parse(request.query);
            const file = await FileManagerService.readFile(request.user!.id, vpsId, clientPath);
            return { success: true, data: file };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Properties ────────────────────────────────────────────────────────────
    fastify.get('/:vpsId/properties', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: readLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath } = pathQuery.parse(request.query);
            const props = await FileManagerService.getProperties(request.user!.id, vpsId, clientPath);
            return { success: true, data: props };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Search ────────────────────────────────────────────────────────────────
    fastify.get('/:vpsId/search', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: rootPath, query, extension } = searchQuery.parse(request.query);
            const results = await FileManagerService.search(request.user!.id, vpsId, rootPath, query || '', extension);
            return { success: true, data: results };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Download file ─────────────────────────────────────────────────────────
    fastify.get('/:vpsId/download', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: dlLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath } = pathQuery.parse(request.query);
            const file = await FileManagerService.downloadFile(request.user!.id, vpsId, clientPath);
            return { success: true, data: file };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Download ZIP ──────────────────────────────────────────────────────────
    fastify.get('/:vpsId/download-zip', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: dlLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath } = pathQuery.parse(request.query);
            const archive = await FileManagerService.downloadZip(request.user!.id, vpsId, clientPath);
            return { success: true, data: archive };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Create file or folder ─────────────────────────────────────────────────
    fastify.post('/:vpsId/create', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath, type } = createBody.parse(request.body);
            if (type === 'directory') {
                await FileManagerService.createDirectory(request.user!.id, vpsId, clientPath);
            } else {
                await FileManagerService.createFile(request.user!.id, vpsId, clientPath);
            }
            return { success: true, data: { message: `${type === 'directory' ? 'Folder' : 'File'} created` } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Save file content ─────────────────────────────────────────────────────
    fastify.put('/:vpsId/save', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit, bodyLimit: 20 * 1024 * 1024 }, // 20MB — matches preview limit
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { path: clientPath, content } = saveBody.parse(request.body);
            await FileManagerService.writeFile(request.user!.id, vpsId, clientPath, content);
            return { success: true, data: { message: 'File saved' } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Rename / move ─────────────────────────────────────────────────────────
    fastify.put('/:vpsId/rename', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { oldPath, newPath } = renameBody.parse(request.body);
            await FileManagerService.rename(request.user!.id, vpsId, oldPath, newPath);
            return { success: true, data: { message: 'Renamed successfully' } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Copy ──────────────────────────────────────────────────────────────────
    fastify.put('/:vpsId/copy', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { srcPath, dstPath } = copyBody.parse(request.body);
            await FileManagerService.copy(request.user!.id, vpsId, srcPath, dstPath);
            return { success: true, data: { message: 'Copied successfully' } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Delete (bulk) ─────────────────────────────────────────────────────────
    fastify.delete('/:vpsId/delete', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { paths } = deleteBody.parse(request.body);
            const errors: string[] = [];
            for (const p of paths) {
                try { await FileManagerService.delete(request.user!.id, vpsId, p); }
                catch (e: any) { errors.push(`${p}: ${e.message}`); }
            }
            if (errors.length > 0 && errors.length === paths.length) {
                return reply.status(400).send({ success: false, error: { code: 'DELETE_FAILED', message: errors.join('; ') } });
            }
            return { success: true, data: { message: 'Deleted', errors } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Upload ────────────────────────────────────────────────────────────────
    fastify.post('/:vpsId/upload', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: uploadLimit, bodyLimit: 50 * 1024 * 1024 },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const uploadDir = (request.query as any)?.path || '~';
            const data = await request.file();
            if (!data) return reply.status(400).send({ success: false, error: { code: 'NO_FILE', message: 'No file provided' } });

            const chunks: Buffer[] = [];
            for await (const chunk of data.file) chunks.push(chunk);
            const buffer = Buffer.concat(chunks);

            if (buffer.length > 50 * 1024 * 1024) {
                return reply.status(413).send({ success: false, error: { code: 'FILE_TOO_LARGE', message: 'Max file size is 50MB' } });
            }

            await FileManagerService.uploadFile(request.user!.id, vpsId, uploadDir, data.filename, buffer.toString('base64'));
            return { success: true, data: { message: 'Uploaded', filename: data.filename } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Compress ──────────────────────────────────────────────────────────────
    fastify.post('/:vpsId/compress', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { parentDir, paths, archiveName } = compressBody.parse(request.body);
            await FileManagerService.compress(request.user!.id, vpsId, parentDir, paths, archiveName);
            return { success: true, data: { message: 'Files compressed successfully' } };
        } catch (e) { return fmError(reply, e); }
    });

    // ── Decompress ────────────────────────────────────────────────────────────
    fastify.post('/:vpsId/decompress', {
        preHandler: [(fastify as any).authGuard],
        config: { rateLimit: writeLimit },
    }, async (request, reply) => {
        try {
            const { vpsId } = vpsParam.parse(request.params);
            const { zipFilePath, destDir } = decompressBody.parse(request.body);
            await FileManagerService.decompress(request.user!.id, vpsId, zipFilePath, destDir);
            return { success: true, data: { message: 'Archive decompressed successfully' } };
        } catch (e) { return fmError(reply, e); }
    });
}
