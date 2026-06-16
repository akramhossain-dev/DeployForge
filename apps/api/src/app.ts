import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config, validateOAuthConfig } from './config/env';

const app = Fastify({
    bodyLimit: 1024 * 1024, // API-5: Global body limit of 1MB for JSON/Form requests
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

    // API-1: URL Rewriter Hook to map legacy requests to /api/ prefixes transparently
    app.addHook('onRequest', async (request, reply) => {
        const url = request.raw.url || '';
        if (url !== '/health' && !url.startsWith('/api/') && !url.startsWith('/api?')) {
            request.raw.url = `/api${url}`;
        }
    });

    // Security Plugins
    await app.register(helmet, { contentSecurityPolicy: false });
    await app.register(cors, {
        origin: config.app.env === 'development' ? true : /localhost/,
        credentials: true,
    });
    
    await app.register(rateLimit, {
        max: config.security.rateLimitMax,
        timeWindow: config.security.rateLimitWindow,
        errorResponseBuilder: (request, context) => ({
            success: false,
            error: {
                code: 'RATE_LIMIT_EXCEEDED',
                message: 'Rate limit exceeded. Please try again later.'
            }
        })
    });

    await app.register(multipart, {
        limits: {
            fileSize: 250 * 1024 * 1024, // Multipart limits are preserved as requested
            files: 1,
            fields: 20,
        },
    });

    await app.register(import('@fastify/websocket'));

    // Custom Plugins
    await app.register(import('./plugins/auth'));

    // Global Error Handler conforming to API Standardization format
    app.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode || 500;
        const message = statusCode >= 500 && !(error as any).expose
            ? 'Internal Server Error'
            : error.message;

        let code = (error as any).errorCode || 'INTERNAL_ERROR';
        if (statusCode === 400) code = 'BAD_REQUEST';
        if (statusCode === 401) code = 'UNAUTHORIZED';
        if (statusCode === 403) code = 'FORBIDDEN';
        if (statusCode === 404) code = 'NOT_FOUND';
        if (statusCode === 409) code = 'CONFLICT';
        if (statusCode === 429) code = 'RATE_LIMITED';

        // Log suspicious requests, malformed payloads and validation failures
        if (statusCode === 400) {
            app.log.warn({ ip: request.ip, path: request.url, err: error.message }, 'Bad Request / Validation Failure');
        } else if (statusCode === 401 || statusCode === 403) {
            app.log.warn({ ip: request.ip, path: request.url }, 'Suspicious unauthorized request');
        } else if (statusCode === 429) {
            app.log.warn({ ip: request.ip, path: request.url }, 'Rate limit violation');
        } else if (statusCode >= 500) {
            app.log.error(error);
        }

        reply.status(statusCode).send({
            success: false,
            error: {
                code,
                message,
                ...(config.app.env === 'development' && { stack: error.stack })
            }
        });
    });

    // API-1: Registered all routes cleanly with standard structure and no duplicates
    await app.register(import('./routes/auth'), { prefix: '/api/auth' });
    await app.register(import('./routes/profile'), { prefix: '/api/profile' });
    await app.register(import('./routes/sessions'), { prefix: '/api/sessions' });
    await app.register(import('./routes/public'), { prefix: '/api/public' });
    await app.register(import('./routes/contact'), { prefix: '/api/contact' });
    await app.register(import('./routes/admin'), { prefix: '/api/admin' });
    await app.register(import('./routes/github'), { prefix: '/api/github' });
    await app.register(import('./routes/google'), { prefix: '/api/google' });
    await app.register(import('./routes/webhooks'), { prefix: '/api/webhooks' });
    await app.register(import('./routes/vps'), { prefix: '/api/vps' });
    await app.register(import('./routes/deploy'), { prefix: '/api/deploy' });
    await app.register(import('./routes/deployments'), { prefix: '/api/deployments' });
    await app.register(import('./routes/ws'), { prefix: '/api/ws' });
    await app.register(import('./routes/sandbox'), { prefix: '/api/sandbox' });
    await app.register(import('./routes/domain'), { prefix: '/api/domain' });
    await app.register(import('./routes/monitoring'), { prefix: '/api/monitor' });
    await app.register(import('./routes/terminal'), { prefix: '/api/terminal' });

    // Health Check
    app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    return app;
}
