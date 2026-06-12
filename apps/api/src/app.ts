import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config, validateOAuthConfig } from './config/env';

const app = Fastify({
    logger: {
        level: config.app.logLevel,
        transport: config.app.env === 'development'
            ? { target: 'pino-pretty' }
            : undefined,
    },
});

export async function buildApp() {
    validateOAuthConfig(app.log);

    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
        (request as any).rawBody = body;
        try {
            done(null, body ? JSON.parse(body as string) : {});
        } catch (error: any) {
            done(error, undefined);
        }
    });

    // Security Plugins
    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(cors, {
        origin: config.app.env === 'development' ? true : /localhost/,
    });
    await app.register(rateLimit, {
        max: config.security.rateLimitMax,
        timeWindow: config.security.rateLimitWindow,
        errorResponseBuilder: () => ({
            success: false,
            message: 'Rate limit exceeded. Please try again later.'
        })
    });
    await app.register(multipart, {
        limits: {
            fileSize: 250 * 1024 * 1024,
            files: 1,
            fields: 20,
        },
    });
    await app.register(import('@fastify/websocket'));

    // Custom Plugins
    await app.register(import('./plugins/auth'));

    // Global Error Handler
    app.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode || 500;
        const message = statusCode >= 500 && !(error as any).expose
            ? 'Internal Server Error'
            : error.message;
        app.log.error(error);

        reply.status(statusCode).send({
            success: false,
            message,
            ...(config.app.env === 'development' && { stack: error.stack })
        });
    });

    // Routes
    await app.register(import('./routes/auth'), { prefix: '/auth' });
    await app.register(import('./routes/auth'), { prefix: '/api/auth' });
    await app.register(import('./routes/profile'), { prefix: '/profile' });
    await app.register(import('./routes/profile'), { prefix: '/api/profile' });
    await app.register(import('./routes/sessions'), { prefix: '/sessions' });
    await app.register(import('./routes/sessions'), { prefix: '/api/sessions' });
    await app.register(import('./routes/public'), { prefix: '/public' });
    await app.register(import('./routes/contact'));
    await app.register(import('./routes/admin'), { prefix: '/admin' });
    await app.register(import('./routes/github'), { prefix: '/github' });
    await app.register(import('./routes/github'), { prefix: '/auth/github' });
    await app.register(import('./routes/google'), { prefix: '/google' });
    await app.register(import('./routes/google'), { prefix: '/auth/google' });
    await app.register(import('./routes/webhooks'), { prefix: '/webhooks' });
    await app.register(import('./routes/vps'), { prefix: '/vps' });
    await app.register(import('./routes/deploy'), { prefix: '/deploy' });
    await app.register(import('./routes/deployments'), { prefix: '/deployments' });
    await app.register(import('./routes/ws'), { prefix: '/ws' });
    await app.register(import('./routes/sandbox'), { prefix: '/sandbox' });
    await app.register(import('./routes/domain'), { prefix: '/domain' });
    await app.register(import('./routes/monitoring'), { prefix: '/monitor' });

    await app.register(import('./routes/terminal'), { prefix: '/terminal' });

    // Health Check
    app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    return app;
}
