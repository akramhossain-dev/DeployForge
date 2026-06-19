import crypto from 'crypto';
import { FastifyReply } from 'fastify';
import { config } from '../config/env';

export type ApiErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'CSRF_TOKEN_INVALID'
    | 'VALIDATION_ERROR'
    | 'INTERNAL_ERROR';

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (!cookieHeader) return cookies;

    for (const cookie of cookieHeader.split(';')) {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) continue;
        const name = cookie.slice(0, separatorIndex).trim();
        const value = cookie.slice(separatorIndex + 1).trim();
        if (name) cookies[name] = decodeURIComponent(value);
    }

    return cookies;
}

export function cookie(name: string, value: string, maxAge: number, options: { httpOnly?: boolean } = {}) {
    const isProd = config.app.env === 'production';
    const sameSite = isProd ? 'None' : 'Lax';
    const encodedValue = encodeURIComponent(value);
    return `${name}=${encodedValue}; Path=/; ${options.httpOnly ? 'HttpOnly; ' : ''}${isProd ? 'Secure; ' : ''}SameSite=${sameSite}; Max-Age=${maxAge}`;
}

export function apiError(reply: FastifyReply, statusCode: number, code: ApiErrorCode, message: string) {
    return reply.status(statusCode).send({
        success: false,
        error: {
            code,
            message,
        },
    });
}

export function sha256(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqualString(a: string, b: string) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}
