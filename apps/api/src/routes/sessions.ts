import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AccountService } from '../services/account.service';
import { apiError, apiMessage, apiSuccess } from '../utils/http';

const sessionParamsSchema = z.object({
    id: z.string().uuid({ message: 'Invalid session ID format' }),
});

export default async function sessionsRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', (fastify as any).authGuard);

    fastify.get('/', {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request) => {
        const sessions = await AccountService.getSessions(request.user.id);
        const mapped = sessions.map(s => ({
            ...s,
            isCurrent: s.id === request.user.sessionId
        }));
        return apiSuccess(mapped);
    });

    fastify.delete('/logout-others', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        const currentSessionId = request.user.sessionId;
        if (!currentSessionId) {
            return apiError(reply, 400, 'BAD_REQUEST', 'Current session ID could not be identified');
        }
        await AccountService.revokeOtherSessions(request.user.id, currentSessionId, request.ip, request.headers['user-agent']);
        return apiMessage('Other sessions revoked successfully');
    });

    fastify.delete('/logout-all', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request) => {
        await AccountService.revokeAllSessions(request.user.id, request.ip, request.headers['user-agent']);
        return apiMessage('All sessions revoked successfully');
    });

    fastify.delete('/:id', {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } }, 
    }, async (request, reply) => {
        const { id } = sessionParamsSchema.parse(request.params);
        
        if (id === request.user.sessionId) {
            return apiError(reply, 400, 'BAD_REQUEST', 'To close the current session, please log out or use Logout All Sessions');
        }

        await AccountService.revokeSession(request.user.id, id, request.ip, request.headers['user-agent']);
        return apiMessage('Session revoked successfully');
    });
}
