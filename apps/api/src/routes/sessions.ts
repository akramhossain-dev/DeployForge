import { FastifyInstance } from 'fastify';
import { AccountService } from '../services/account.service';

export default async function sessionsRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', async (request) => {
        const sessions = await AccountService.getSessions(request.user.id);
        return { success: true, data: sessions };
    });

    fastify.delete('/:id', async (request) => {
        const { id } = request.params as { id: string };
        await AccountService.revokeSession(request.user.id, id, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Session revoked successfully' };
    });

    fastify.delete('/', async (request) => {
        const { revokeAll, currentToken } = request.query as { revokeAll?: string; currentToken?: string };
        
        if (revokeAll === 'true') {
            await AccountService.revokeAllSessions(request.user.id, request.ip, request.headers['user-agent']);
            return { success: true, message: 'All sessions revoked successfully' };
        }

        // Otherwise revoke other sessions
        // We can extract current token from Authorization header
        const authHeader = request.headers.authorization;
        const token = authHeader ? authHeader.split(' ')[1] : '';

        if (!token) {
            throw new Error('Authorization token is required to revoke other sessions');
        }

        await AccountService.revokeOtherSessions(request.user.id, token, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Other sessions revoked successfully' };
    });
}
