import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config, validateOAuthConfig } from './config/env';
import { redactionPaths } from './utils/logger';

const developmentOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const productionOrigins = new Set([config.app.appUrl, config.app.apiUrl]);
const probePaths = new Set(['/health', '/live', '/liveness', '/ready', '/readiness']);

const app = Fastify({
    bodyLimit: 1024 * 1024, // API-5: Global body limit of 1MB for JSON/Form requests
    trustProxy: true,
    logger: {
        level: config.app.logLevel,
        redact: {
            paths: redactionPaths,
            censor: '[REDACTED]',
        },
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
        const path = url.split('?')[0];

        reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)');

        if (!probePaths.has(path) && !url.startsWith('/api/') && !url.startsWith('/api?')) {
            request.raw.url = `/api${url}`;
        }
    });

    app.addHook('onResponse', async (request, reply) => {
        request.log.info({
            audit: false,
            event: 'request_completed',
            method: request.method,
            path: request.url,
            statusCode: reply.statusCode,
            responseTimeMs: Math.round(reply.elapsedTime),
            ip: request.ip,
        }, 'HTTP request completed');
    });

    app.addHook('preValidation', async (request, reply) => {
        const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor']);
        const checkPayload = (value: unknown, depth = 0): boolean => {
            if (!value || typeof value !== 'object') return true;
            if (depth > 20) return false;
            for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
                if (unsafeKeys.has(key)) return false;
                if (!checkPayload(child, depth + 1)) return false;
            }
            return true;
        };

        if (!checkPayload(request.body) || !checkPayload(request.query) || !checkPayload(request.params)) {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'BAD_REQUEST',
                    message: 'Malformed request payload',
                },
            });
        }
    });

    // Security Plugins
    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'none'"],
                baseUri: ["'none'"],
                connectSrc: ["'self'"],
                frameAncestors: ["'none'"],
                formAction: ["'none'"],
                imgSrc: ["'self'", 'data:'],
                scriptSrc: ["'none'"],
                styleSrc: ["'none'"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: config.app.env === 'production' ? [] : null,
            },
        },
        strictTransportSecurity: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
        },
        xFrameOptions: { action: 'deny' },
        xContentTypeOptions: true,
        referrerPolicy: { policy: 'no-referrer' },
        xPoweredBy: false,
        xDnsPrefetchControl: { allow: false },
        xDownloadOptions: true,
        xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
        xXssProtection: false,
    } as any);
    await app.register(cors, {
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            const allowed = config.app.env === 'development'
                ? developmentOriginPattern.test(origin)
                : productionOrigins.has(origin);

            callback(null, allowed);
        },
        credentials: true,
    });
    
    await app.register(rateLimit, {
        max: config.security.rateLimitMax,
        timeWindow: config.security.rateLimitWindow,
        errorResponseBuilder: (request, context) => ({
            statusCode: 429,
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
    await app.register(import('./plugins/csrf'));

    // Global Error Handler conforming to API Standardization format
    app.setErrorHandler((error, request, reply) => {
        const isValidationError = error instanceof ZodError;
        const rawStatusCode = isValidationError ? 400 : error.statusCode || 500;
        const statusCode = rawStatusCode >= 400 && rawStatusCode < 600 ? rawStatusCode : 500;

        let code = (error as any).errorCode || 'INTERNAL_ERROR';
        if (isValidationError) code = 'VALIDATION_ERROR';
        else if (statusCode === 400) code = 'BAD_REQUEST';
        else if (statusCode === 401) code = 'UNAUTHORIZED';
        else if (statusCode === 403) code = 'FORBIDDEN';
        else if (statusCode === 404) code = 'NOT_FOUND';
        else if (statusCode === 409) code = 'CONFLICT';
        else if (statusCode === 429) code = 'RATE_LIMITED';

        const exposesSensitiveInternals = /prisma|sql|database|jwt|secret|environment|env|stack/i.test(error.message || '');
        const message = isValidationError
            ? error.errors[0]?.message || 'Invalid request payload'
            : statusCode >= 500 || exposesSensitiveInternals
                ? 'Internal Server Error'
                : error.message || 'Request failed';

        // Log suspicious requests, malformed payloads and validation failures
        if (statusCode === 400) {
            app.log.warn({ ip: request.ip, path: request.url, err: error }, 'Bad Request / Validation Failure');
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
                message
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
    await app.register(import('./routes/health'));

    return app;
}
