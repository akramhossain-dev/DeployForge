import crypto from 'crypto';
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { config } from '../config/env';
import { apiError, cookie, parseCookies, timingSafeEqualString } from '../utils/http';

declare module 'fastify' {
    interface FastifyInstance {
        issueCsrfToken: (reply: FastifyReply) => string;
    }
}

const csrfCookieName = 'csrfToken';
const csrfHeaderName = 'x-csrf-token';
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const skipCsrfPaths = new Set([
    '/api/auth/csrf',
    '/api/webhooks/github',
]);

function signToken(nonce: string) {
    return crypto.createHmac('sha256', config.auth.jwtSecret).update(nonce).digest('hex');
}

function createCsrfToken() {
    const nonce = crypto.randomBytes(32).toString('hex');
    return `${nonce}.${signToken(nonce)}`;
}

function isValidCsrfToken(token: string) {
    const [nonce, signature, extra] = token.split('.');
    if (extra || !nonce || !signature || !/^[0-9a-f]{64}$/i.test(nonce) || !/^[0-9a-f]{64}$/i.test(signature)) {
        return false;
    }

    return timingSafeEqualString(signature, signToken(nonce));
}

function pathWithoutQuery(url: string) {
    return url.split('?')[0];
}

const csrfPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
    fastify.decorate('issueCsrfToken', (reply: FastifyReply) => {
        const token = createCsrfToken();
        reply.header('Set-Cookie', cookie(csrfCookieName, token, 60 * 60 * 8));
        return token;
    });

    fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!unsafeMethods.has(request.method)) return;
        if (skipCsrfPaths.has(pathWithoutQuery(request.url))) return;

        const headerValue = request.headers[csrfHeaderName];
        const csrfHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
        const csrfCookie = parseCookies(request.headers.cookie)[csrfCookieName];

        if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie || !isValidCsrfToken(csrfHeader)) {
            request.log.warn({ path: request.url, ip: request.ip }, 'CSRF validation failed');
            return apiError(reply, 403, 'CSRF_TOKEN_INVALID', 'Invalid or missing CSRF token');
        }
    });

    done();
};

export default fp(csrfPlugin);
