import { FastifyInstance } from 'fastify';
import { TerminalService } from '../services/terminal.service';
import { TokenService } from '@deployforge/security';
import { config } from '../config/env';
import prisma from '@deployforge/database';

const tokenService = new TokenService(config.auth.jwtSecret);

export default async function terminalRoutes(fastify: FastifyInstance) {
    fastify.get('/:vpsId', { websocket: true }, async (connection, request) => {
        const { vpsId } = request.params as { vpsId: string };
        const { token } = request.query as { token?: string };

        let userId: string | undefined;
        if (token) {
            try {
                const payload = tokenService.verifyToken(token);
                const user = await prisma.user.findUnique({
                    where: { id: payload.userId },
                    select: { id: true },
                });
                userId = user?.id;
            } catch (err) {
                userId = undefined;
            }
        }

        if (!userId) {
            connection.socket.send(JSON.stringify({ event: 'terminal:error', message: 'Unauthorized' }));
            connection.socket.close();
            return;
        }

        await TerminalService.createSession(userId, vpsId, connection);
    });
}
