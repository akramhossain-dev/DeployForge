import pino from 'pino';
import { config } from '../config/env';

const redactionPaths = [
    'req.headers.authorization',
    'req.headers.cookie',
    'headers.authorization',
    'headers.cookie',
    '*.accessToken',
    '*.refreshToken',
    '*.adminAccessToken',
    '*.csrfToken',
    '*.password',
    '*.passwordHash',
    '*.password_hash',
    '*.passwordConfirmation',
    '*.token',
    '*.secret',
    '*.privateKey',
    '*.apiKey',
    '*.DATABASE_URL',
    '*.REDIS_URL',
    '*.JWT_SECRET',
    '*.ADMIN_SECRET',
    '*.ADMIN_JWT_SECRET',
    '*.ENCRYPTION_KEY',
    '*.MASTER_KEY',
    '*.GITHUB_CLIENT_SECRET',
    '*.GITHUB_WEBHOOK_SECRET',
    '*.GOOGLE_CLIENT_SECRET',
    '*.SMTP_PASS',
    '*.otp',
    '*.code',
    '*.resetToken',
    '*.verificationToken',
];

export const logger = pino({
    level: config.app.logLevel,
    redact: {
        paths: redactionPaths,
        censor: '[REDACTED]',
    },
    transport: config.app.env === 'development'
        ? { target: 'pino-pretty' }
        : undefined,
});

export { redactionPaths };
