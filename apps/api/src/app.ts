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
    await app.register(helmet);
    await app.register(cors, {
        origin: config.NODE_ENV === 'development' ? true : /localhost/,
    });
    await app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });

    // Custom Plugins
    await app.register(import('./plugins/auth'));

    // Health Route
    app.get('/health', async () => {
        return { status: 'OK', timestamp: new Date().toISOString() };
    });

    // Routes
    await app.register(import('./routes/auth'), { prefix: '/auth' });
    await app.register(import('./routes/github'), { prefix: '/github' });
    await app.register(import('./routes/webhooks'), { prefix: '/webhooks' });
    await app.register(import('./routes/vps'), { prefix: '/vps' });
    await app.register(import('./routes/deploy'), { prefix: '/deploy' });
    await app.register(import('./routes/sandbox'), { prefix: '/sandbox' });
    await app.register(import('./routes/domain'), { prefix: '/domain' });

    // Global Error Handler
    app.setErrorHandler((error, request, reply) => {
        app.log.error(error);
        reply.status(error.statusCode || 500).send({
            error: error.name,
            message: error.message,
            statusCode: error.statusCode || 500,
        });
    });

    return app;
}
