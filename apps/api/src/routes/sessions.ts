import { FastifyInstance } from 'fastify';
import { AccountService } from '../services/account.service';

export default async function sessionsRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    // GET /api/sessions
    fastify.get('/', async (request) => {
        const sessions = await AccountService.getSessions(request.user.id);
        // Map active sessions, flagging the current one
        const mapped = sessions.map(s => ({
            ...s,
            isCurrent: s.id === request.user.sessionId
        }));
        return { success: true, data: mapped };
    });

    // DELETE /api/sessions/logout-others
    fastify.delete('/logout-others', async (request, reply) => {
        const currentSessionId = request.user.sessionId;
        if (!currentSessionId) {
            return reply.status(400).send({ success: false, message: 'Current session ID could not be identified' });
        }
        await AccountService.revokeOtherSessions(request.user.id, currentSessionId, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Other sessions revoked successfully' };
    });

    // DELETE /api/sessions/logout-all
    fastify.delete('/logout-all', async (request) => {
        await AccountService.revokeAllSessions(request.user.id, request.ip, request.headers['user-agent']);
        return { success: true, message: 'All sessions revoked successfully' };
    });

    // DELETE /api/sessions/:id
    fastify.delete('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        
        // Prevent revoking the current session via this route by accident
        if (id === request.user.sessionId) {
            return reply.status(400).send({ 
                success: false, 
                message: 'To close the current session, please log out or use Logout All Sessions' 
            });
        }

        await AccountService.revokeSession(request.user.id, id, request.ip, request.headers['user-agent']);
        return { success: true, message: 'Session revoked successfully' };
    });
}
