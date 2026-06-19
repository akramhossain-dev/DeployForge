import { FastifyInstance } from 'fastify';
import { TerminalService } from '../services/terminal.service';
import { z } from 'zod';
import { socketToken, verifySocketUser } from '../utils/socket-auth';

const terminalParamsSchema = z.object({
    vpsId: z.string().uuid({ message: 'Invalid VPS ID format' }),
});

const terminalQuerySchema = z.object({
    token: z.string().min(1, 'Token is required').optional(),
    cols: z.preprocess((val) => val ? parseInt(val as string) : undefined, z.number().int().positive().optional()),
    rows: z.preprocess((val) => val ? parseInt(val as string) : undefined, z.number().int().positive().optional()),
});

export default async function terminalRoutes(fastify: FastifyInstance) {
    fastify.get('/:vpsId', { websocket: true }, async (connection, request) => {
        let vpsId: string;
        let token: string;
        let cols: number | undefined;
        let rows: number | undefined;

        try {
            const params = terminalParamsSchema.parse(request.params);
            const query = terminalQuerySchema.parse(request.query);
            vpsId = params.vpsId;
            token = socketToken(request, query.token);
            cols = query.cols;
            rows = query.rows;
            if (!token) throw new Error('Missing token');
        } catch (err: any) {
            connection.socket.send(JSON.stringify({ event: 'terminal:error', message: 'Invalid parameters or query' }));
            connection.socket.close();
            return;
        }

        let userId: string | undefined;
        try {
            userId = (await verifySocketUser(token))?.userId;
        } catch (err) {
            userId = undefined;
        }

        if (!userId) {
            connection.socket.send(JSON.stringify({ event: 'terminal:error', message: 'Unauthorized' }));
            connection.socket.close();
            return;
        }

        await TerminalService.createSession(userId, vpsId, connection, {
            cols,
            rows,
        });
    });
}
