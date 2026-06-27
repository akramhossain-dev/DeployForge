import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { config, validateOAuthConfig } from './config/env';
import { redactionPaths } from './utils/logger';
import { AppMetricsService } from './services/app-metrics.service';
import { randomUUID } from 'crypto';
import { EncryptionService } from '@deployforge/security';

const developmentOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/;
const productionOrigins = new Set([config.app.appUrl, config.app.apiUrl]);
const probePaths = new Set(['/health', '/live', '/liveness', '/ready', '/readiness', '/metrics']);

const app = Fastify({
    bodyLimit: 1024 * 1024, 
    trustProxy: true,
    genReqId: (req) => {
        return (req.headers['x-request-id'] as string) || randomUUID();
    },
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

import prisma from '@deployforge/database';
import { deploymentEventEmitter, DEPLOYMENT_EVENTS } from './utils/deployment-events';

export async function buildApp() {
    validateOAuthConfig(app.log);

    const encryptionService = new EncryptionService(config.encryption.key);
    const ENV_MODELS = new Set(['Deployment', 'DeploymentHistory']);
    const WRITE_ACTIONS = new Set(['create', 'update', 'upsert', 'createMany', 'updateMany']);

    prisma.$use(async (params, next) => {
        if (params.model && ENV_MODELS.has(params.model) && WRITE_ACTIONS.has(params.action)) {
            const data = params.args?.data;
            if (data && typeof data.env === 'string' && data.env) {
                const parts = data.env.split(':');
                const isAlreadyEncrypted = parts.length === 3 && parts.every((p: string) => /^[a-f0-9]+$/i.test(p));
                if (!isAlreadyEncrypted) {
                    const encrypted = encryptionService.encrypt(data.env);
                    params.args.data.env = `${encrypted.iv}:${encrypted.tag}:${encrypted.content}`;
                }
            }
        }

        const result = await next(params);

        if (params.model && ENV_MODELS.has(params.model) && result) {
            const decrypt = (record: any) => {
                if (record && typeof record.env === 'string' && record.env) {
                    try {
                        const parts = record.env.split(':');
                        if (parts.length === 3 && parts.every((p: string) => /^[a-f0-9]+$/i.test(p))) {
                            const [iv, tag, content] = parts;
                            record.env = encryptionService.decrypt({ iv, tag, content });
                        }
                    } catch { /* already plaintext (legacy) or decrypt failed */ }
                }
            };
            Array.isArray(result) ? result.forEach(decrypt) : decrypt(result);
        }

        if (params.model === 'DeploymentLog' && params.action === 'create') {
            if (result) deploymentEventEmitter.emit(DEPLOYMENT_EVENTS.LOG_ADDED, result.deploymentId, result);
        } else if (params.model === 'Deployment' && (params.action === 'update' || params.action === 'upsert' || params.action === 'create')) {
            if (result) deploymentEventEmitter.emit(DEPLOYMENT_EVENTS.STATUS_UPDATED, result.id, result);
        }

        return result;
    });

    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
        (request as any).rawBody = body;
        try {
            done(null, body ? JSON.parse(body as string) : {});
        } catch (error: any) {
            done(error, undefined);
        }
    });

    app.addHook('onRequest', async (_request, reply) => {
        reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)');
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

        AppMetricsService.recordRequest(
            request.method,
            request.routerPath || request.url,
            reply.statusCode,
            reply.elapsedTime
        );
    });

    app.addHook('onSend', async (request, reply, payload) => {
        reply.header('X-Request-Id', request.id);
        return payload;
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
            fileSize: 250 * 1024 * 1024, 
            files: 1,
            fields: 20,
        },
    });

    await app.register(import('@fastify/websocket'));

    await app.register(import('./plugins/auth'));
    await app.register(import('./plugins/csrf'));

    app.setErrorHandler((error, request, reply) => {
        const isValidationError = error instanceof ZodError;
        let statusCode = isValidationError ? 400 : error.statusCode || 500;
        let message = error.message || 'Request failed';
        let code = (error as any).errorCode || (error as any).code || 'INTERNAL_ERROR';

        const isPrismaError = (error as any).code?.startsWith('P') || error.constructor?.name?.includes('Prisma');
        if (isPrismaError) {
            const prismaCode = (error as any).code;
            if (prismaCode === 'P2002') {
                statusCode = 409;
                code = 'CONFLICT';
                const target = (error as any).meta?.target;
                if (Array.isArray(target) && target.includes('email') || typeof target === 'string' && target.includes('email')) {
                    message = 'User already exists';
                } else {
                    message = 'Record already exists';
                }
            } else if (prismaCode === 'P2025') {
                statusCode = 404;
                code = 'NOT_FOUND';
                message = 'Account not found';
            } else {
                statusCode = 400;
                code = 'BAD_REQUEST';
                message = 'Database operation failed';
            }
        }

        if (!isValidationError && !isPrismaError) {
            const lowerMessage = message.toLowerCase();
            if (message === 'User already exists') {
                statusCode = 409;
                code = 'CONFLICT';
            } else if (message === 'User not found' || message === 'Account not found') {
                statusCode = 404;
                code = 'NOT_FOUND';
                message = 'Account not found';
            } else if (message === 'User email is already verified' || message === 'Email already verified') {
                statusCode = 409;
                code = 'CONFLICT';
                message = 'Email already verified';
            } else if (message === 'Invalid or expired verification token') {
                statusCode = 400;
                code = 'BAD_REQUEST';
            } else if (message === 'Session not found') {
                statusCode = 404;
                code = 'NOT_FOUND';
                message = 'Session expired';
            } else if (message === 'Unauthorized' || message === 'Missing token' || message === 'Invalid token' || lowerMessage.includes('invalid refresh token')) {
                statusCode = 401;
                code = 'UNAUTHORIZED';
                message = 'Unauthorized';
            } else if (message === 'Forbidden') {
                statusCode = 403;
                code = 'FORBIDDEN';
            } else if (lowerMessage.includes('rate limit') || statusCode === 429) {
                statusCode = 429;
                code = 'RATE_LIMITED';
                message = 'Too many requests. Please try again later.';
            } else if (message === 'VPS not found' || message === 'Deployment not found' || message === 'Domain not found') {
                statusCode = 404;
                code = 'NOT_FOUND';
            } else if (message.includes('Deployment limit reached')) {
                statusCode = 400;
                code = 'BAD_REQUEST';
            } else if (message === 'Incorrect credentials' || message === 'Invalid email or password') {
                statusCode = 401;
                code = 'UNAUTHORIZED';
                message = 'Incorrect credentials';
            } else if (message === 'Invalid email') {
                statusCode = 400;
                code = 'BAD_REQUEST';
                message = 'Invalid email';
            } else if (message === 'Invalid password') {
                statusCode = 400;
                code = 'BAD_REQUEST';
                message = 'Invalid password';
            }
        }

        const finalStatusCode = statusCode >= 400 && statusCode < 600 ? statusCode : 500;

        if (isValidationError) {
            code = 'VALIDATION_ERROR';
            const firstError = (error as ZodError).errors[0];
            if (firstError) {
                message = firstError.message;
                if (firstError.code === 'invalid_type' && firstError.received === 'undefined') {
                    message = `Missing required field: ${firstError.path.join('.')}`;
                }
            } else {
                message = 'Validation failed';
            }
        } else {
            const exposesSensitiveInternals = /prisma|sql|database|jwt|secret|environment|env|stack/i.test(message);
            if ((finalStatusCode >= 500 || exposesSensitiveInternals) && !isPrismaError) {
                message = 'Internal Server Error';
                code = 'INTERNAL_ERROR';
            }
        }

        if (code === 'INTERNAL_ERROR') {
            if (finalStatusCode === 400) code = 'BAD_REQUEST';
            else if (finalStatusCode === 401) code = 'UNAUTHORIZED';
            else if (finalStatusCode === 403) code = 'FORBIDDEN';
            else if (finalStatusCode === 404) code = 'NOT_FOUND';
            else if (finalStatusCode === 409) code = 'CONFLICT';
            else if (finalStatusCode === 429) code = 'RATE_LIMITED';
        }

        if (finalStatusCode === 400) {
            request.log.warn({ ip: request.ip, path: request.url, err: error }, 'Bad Request / Validation Failure');
        } else if (finalStatusCode === 401 || finalStatusCode === 403) {
            request.log.warn({ ip: request.ip, path: request.url }, 'Suspicious unauthorized request');
        } else if (finalStatusCode === 429) {
            request.log.warn({ ip: request.ip, path: request.url }, 'Rate limit violation');
        } else if (finalStatusCode >= 500) {
            request.log.error(error);
        }

        reply.status(finalStatusCode).send({
            success: false,
            error: {
                code,
                message
            }
        });
    });

    await app.register(import('./routes/auth'), { prefix: '/auth' });
    await app.register(import('./routes/profile'), { prefix: '/profile' });
    await app.register(import('./routes/sessions'), { prefix: '/sessions' });
    await app.register(import('./routes/public'), { prefix: '/public' });
    await app.register(import('./routes/contact'), { prefix: '/contact' });
    await app.register(import('./routes/admin'), { prefix: '/admin' });
    await app.register(import('./routes/github'), { prefix: '/auth/github' });
    await app.register(import('./routes/google'), { prefix: '/auth/google' });
    await app.register(import('./routes/webhooks'), { prefix: '/api/webhooks' });
    await app.register(import('./routes/vps'), { prefix: '/vps' });
    await app.register(import('./routes/deploy'), { prefix: '/deploy' });
    await app.register(import('./routes/deployments'), { prefix: '/deployments' });
    await app.register(import('./routes/ws'), { prefix: '/ws' });
    await app.register(import('./routes/sandbox'), { prefix: '/sandbox' });
    await app.register(import('./routes/domain'), { prefix: '/domain' });
    await app.register(import('./routes/monitoring'), { prefix: '/monitor' });
    await app.register(import('./routes/terminal'), { prefix: '/terminal' });
    await app.register(import('./routes/file-manager'), { prefix: '/file-manager' });
    await app.register(import('./routes/notifications'), { prefix: '/notifications' });
    await app.register(import('./routes/alert-settings'), { prefix: '/alert-settings' });
    await app.register(import('./routes/health'));

    return app;
}
