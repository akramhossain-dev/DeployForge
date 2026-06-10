import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/env';

const app = Fastify({
    logger: {
        transport: config.NODE_ENV === 'development'
            ? { target: 'pino-pretty' }
            : undefined,
    },
});

export async function buildApp() {
    // Security Plugins
    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(cors, {
        origin: config.NODE_ENV === 'development' ? true : /localhost/,
    });
    await app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        errorResponseBuilder: () => ({
            success: false,
            message: 'Rate limit exceeded. Please try again later.'
        })
    });

    // Custom Plugins
    await app.register(import('./plugins/auth'));

    // Routes
    await app.register(import('./routes/auth'), { prefix: '/auth' });
    await app.register(import('./routes/public'), { prefix: '/public' });
    await app.register(import('./routes/contact'));
    await app.register(import('./routes/admin'), { prefix: '/admin' });
    await app.register(import('./routes/github'), { prefix: '/github' });
    await app.register(import('./routes/github'), { prefix: '/auth/github' });
    await app.register(import('./routes/webhooks'), { prefix: '/webhooks' });
    await app.register(import('./routes/vps'), { prefix: '/vps' });
    await app.register(import('./routes/deploy'), { prefix: '/deploy' });
    await app.register(import('./routes/sandbox'), { prefix: '/sandbox' });
    await app.register(import('./routes/domain'), { prefix: '/domain' });
    await app.register(import('./routes/monitoring'), { prefix: '/monitor' });

    // WebSockets
    await app.register(import('@fastify/websocket'));
    await app.register(import('./routes/terminal'), { prefix: '/terminal' });

    // Global Error Handler
    app.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode || 500;
        app.log.error(error);

        reply.status(statusCode).send({
            success: false,
            message: statusCode >= 500 ? 'Internal Server Error' : error.message,
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
        });
    });

    // Health Check
    app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    return app;
}
