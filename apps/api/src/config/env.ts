import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

const url = (name: string) => z.string({ required_error: `${name} is required` }).trim().min(1, `${name} is required`).url(`${name} must be a valid URL`);
const placeholderPattern = /^(replace_with_|your_|changeme|change_me|secret|password|admin|test)/i;
const secret = (name: string, min = 32) => z.string({ required_error: `${name} is required` })
    .trim()
    .min(min, `${name} must be at least ${min} characters`)
    .refine((value) => !placeholderPattern.test(value), `${name} must not use a placeholder value`);
const required = (name: string) => z.string({ required_error: `${name} is required` }).trim().min(1, `${name} is required`);
const optional = () => z.string().trim().optional().default('');
const envBoolean = (defaultValue: boolean) => z.preprocess((value) => {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    }
    return value;
}, z.boolean()).default(defaultValue);

const rawEnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    APP_URL: url('APP_URL').default('http://localhost:3000'),
    API_URL: url('API_URL').default('http://localhost:3001'),

    NEXT_PUBLIC_API_URL: url('NEXT_PUBLIC_API_URL').optional(),

    DATABASE_URL: required('DATABASE_URL').refine((value) => {
        try {
            return ['postgresql:', 'postgres:'].includes(new URL(value).protocol);
        } catch {
            return false;
        }
    }, 'DATABASE_URL must be a valid PostgreSQL connection URL'),
    REDIS_ENABLED: envBoolean(true),
    REDIS_URL: url('REDIS_URL').refine((value) => ['redis:', 'rediss:'].includes(new URL(value).protocol), 'REDIS_URL must use redis:// or rediss://').optional(),

    JWT_SECRET: secret('JWT_SECRET'),
    ADMIN_SECRET: secret('ADMIN_SECRET', 24),
    ADMIN_JWT_SECRET: secret('ADMIN_JWT_SECRET'),

    ENCRYPTION_KEY: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'ENCRYPTION_KEY must be a 64-character hex string'),
    MASTER_KEY: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'MASTER_KEY must be a 64-character hex string').optional(),

    GITHUB_CLIENT_ID: required('GITHUB_CLIENT_ID'),
    GITHUB_CLIENT_SECRET: secret('GITHUB_CLIENT_SECRET', 1),
    GITHUB_CALLBACK_URL: url('GITHUB_CALLBACK_URL').optional(),
    GITHUB_REDIRECT_URI: url('GITHUB_REDIRECT_URI').optional(),
    GITHUB_WEBHOOK_SECRET: secret('GITHUB_WEBHOOK_SECRET'),

    GOOGLE_OAUTH_ENABLED: envBoolean(true),
    GOOGLE_CLIENT_ID: optional(),
    GOOGLE_CLIENT_SECRET: optional(),
    GOOGLE_CALLBACK_URL: url('GOOGLE_CALLBACK_URL').optional(),
    GOOGLE_REDIRECT_URI: url('GOOGLE_REDIRECT_URI').optional(),

    SMTP_HOST: required('SMTP_HOST'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: envBoolean(false),
    SMTP_USER: required('SMTP_USER'),
    SMTP_PASS: secret('SMTP_PASS', 1),
    // SMTP_FROM is optional. Falls back to SMTP_USER if not set.
    // Accepts plain email ("you@gmail.com") or display-name format ("App Name <you@gmail.com>").
    SMTP_FROM: z.string().trim().optional().default(''),

    EMAIL_SERVICE: optional(),
    EMAIL_USER: optional(),
    EMAIL_PASSWORD: optional(),

    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().trim().min(1).default('1 minute'),
    ADMIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    ADMIN_LOCKOUT_TIME: z.coerce.number().int().positive().default(900),
    SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email address'),
    SUPER_ADMIN_PASSWORD: z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters'),
    // Optional bearer token required to access /metrics. If unset, /metrics is open (dev-only).
    METRICS_TOKEN: optional(),
});

function formatEnvErrors(error: z.ZodError) {
    return error.issues.map((issue) => {
        const name = issue.path.join('.') || 'ENV';
        return `${name}: ${issue.message}`;
    });
}

const parsed = rawEnvSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const message of formatEnvErrors(parsed.error)) {
        console.error(`- ${message}`);
    }
    process.exit(1);
}

const env = parsed.data;
const githubCallbackUrl = env.GITHUB_CALLBACK_URL || env.GITHUB_REDIRECT_URI;
const googleCallbackUrl = env.GOOGLE_CALLBACK_URL || env.GOOGLE_REDIRECT_URI;
const localHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const isLocalUrl = (value: string) => localHostnames.has(new URL(value).hostname);

const finalChecks: string[] = [];
if (!githubCallbackUrl) finalChecks.push('GITHUB_CALLBACK_URL is required');
if (env.REDIS_ENABLED && !env.REDIS_URL) finalChecks.push('REDIS_URL is required when REDIS_ENABLED=true');
if (env.GOOGLE_OAUTH_ENABLED && !env.GOOGLE_CLIENT_ID) finalChecks.push('GOOGLE_CLIENT_ID is required when GOOGLE_OAUTH_ENABLED=true');
if (env.GOOGLE_OAUTH_ENABLED && !env.GOOGLE_CLIENT_SECRET) finalChecks.push('GOOGLE_CLIENT_SECRET is required when GOOGLE_OAUTH_ENABLED=true');
if (env.GOOGLE_OAUTH_ENABLED && !googleCallbackUrl) finalChecks.push('GOOGLE_CALLBACK_URL is required when GOOGLE_OAUTH_ENABLED=true');
if (env.GOOGLE_OAUTH_ENABLED && !env.GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')) {
    finalChecks.push('GOOGLE_CLIENT_ID must be a Google OAuth client ID ending in .apps.googleusercontent.com');
}
if (env.NODE_ENV === 'production') {
    if (isLocalUrl(env.APP_URL)) finalChecks.push('APP_URL must not point to localhost in production');
    if (isLocalUrl(env.API_URL)) finalChecks.push('API_URL must not point to localhost in production');
    if (!env.APP_URL.startsWith('https://')) finalChecks.push('APP_URL must use HTTPS in production');
    if (!env.API_URL.startsWith('https://')) finalChecks.push('API_URL must use HTTPS in production');
}

if (finalChecks.length > 0) {
    console.error('Invalid environment configuration:');
    for (const message of finalChecks) {
        console.error(`- ${message}`);
    }
    process.exit(1);
}

export const appConfig = {
    env: env.NODE_ENV,
    port: env.PORT,
    appUrl: env.APP_URL,
    apiUrl: env.API_URL,
    logLevel: env.LOG_LEVEL,
} as const;

export const frontendConfig = {
    apiUrl: env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
} as const;

export const databaseConfig = {
    url: env.DATABASE_URL,
} as const;

export const redisConfig = {
    enabled: env.REDIS_ENABLED,
    url: env.REDIS_URL || '',
} as const;

export const authConfig = {
    jwtSecret: env.JWT_SECRET,
    adminSecret: env.ADMIN_SECRET,
    adminJwtSecret: env.ADMIN_JWT_SECRET,
} as const;

export const encryptionConfig = {
    key: env.ENCRYPTION_KEY,
    masterKey: env.MASTER_KEY || env.ENCRYPTION_KEY,
} as const;

export const oauthConfig = {
    github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        callbackUrl: githubCallbackUrl!,
        webhookSecret: env.GITHUB_WEBHOOK_SECRET,
    },
    google: {
        enabled: env.GOOGLE_OAUTH_ENABLED,
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackUrl: googleCallbackUrl || '',
    },
} as const;

export const emailConfig = {
    smtp: {
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
    fromEmail: env.SMTP_FROM || env.SMTP_USER,
} as const;

export const securityConfig = {
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindow: env.RATE_LIMIT_WINDOW,
    adminMaxAttempts: env.ADMIN_MAX_ATTEMPTS,
    adminLockoutTime: env.ADMIN_LOCKOUT_TIME,
    // Set METRICS_TOKEN in production to require Bearer auth on /metrics
    metricsToken: env.METRICS_TOKEN || '',
} as const;

export const config = {
    app: appConfig,
    frontend: frontendConfig,
    database: databaseConfig,
    redis: redisConfig,
    auth: authConfig,
    encryption: encryptionConfig,
    oauth: oauthConfig,
    email: emailConfig,
    security: securityConfig,

    NODE_ENV: appConfig.env,
    PORT: appConfig.port,
    APP_URL: appConfig.appUrl,
    API_URL: appConfig.apiUrl,
    DATABASE_URL: databaseConfig.url,
    REDIS_URL: redisConfig.url,
    REDIS_ENABLED: redisConfig.enabled,
    JWT_SECRET: authConfig.jwtSecret,
    ADMIN_SECRET: authConfig.adminSecret,
    ADMIN_JWT_SECRET: authConfig.adminJwtSecret,
    ENCRYPTION_KEY: encryptionConfig.key,
    GITHUB_CLIENT_ID: oauthConfig.github.clientId,
    GITHUB_CLIENT_SECRET: oauthConfig.github.clientSecret,
    GITHUB_CALLBACK_URL: oauthConfig.github.callbackUrl,
    GITHUB_REDIRECT_URI: oauthConfig.github.callbackUrl,
    GITHUB_WEBHOOK_SECRET: oauthConfig.github.webhookSecret,
    GOOGLE_OAUTH_ENABLED: oauthConfig.google.enabled,
    GOOGLE_CLIENT_ID: oauthConfig.google.clientId,
    GOOGLE_CLIENT_SECRET: oauthConfig.google.clientSecret,
    GOOGLE_CALLBACK_URL: oauthConfig.google.callbackUrl,
    GOOGLE_REDIRECT_URI: oauthConfig.google.callbackUrl,
    SMTP_HOST: emailConfig.smtp.host,
    SMTP_PORT: emailConfig.smtp.port,
    SMTP_SECURE: emailConfig.smtp.secure,
    SMTP_USER: emailConfig.smtp.user,
    SMTP_PASS: emailConfig.smtp.pass,
    SMTP_FROM: emailConfig.fromEmail,
    RATE_LIMIT_MAX: securityConfig.rateLimitMax,
    RATE_LIMIT_WINDOW: securityConfig.rateLimitWindow,
    ADMIN_MAX_ATTEMPTS: securityConfig.adminMaxAttempts,
    ADMIN_LOCKOUT_TIME: securityConfig.adminLockoutTime,
    superAdmin: {
        email: env.SUPER_ADMIN_EMAIL,
        password: env.SUPER_ADMIN_PASSWORD,
    },
} as const;

export function validateOAuthConfig(logger: Pick<Console, 'info' | 'warn'> = console) {
    logger.info('[oauth] GitHub OAuth configuration loaded', {
        clientIdConfigured: Boolean(oauthConfig.github.clientId),
        clientSecretConfigured: Boolean(oauthConfig.github.clientSecret),
        callbackUrlConfigured: Boolean(oauthConfig.github.callbackUrl),
    });

    if (!oauthConfig.google.enabled) {
        logger.warn('[oauth] Google OAuth disabled by GOOGLE_OAUTH_ENABLED=false');
        return;
    }

    logger.info('[oauth] Google OAuth configuration loaded', {
        clientIdConfigured: Boolean(oauthConfig.google.clientId),
        clientSecretConfigured: Boolean(oauthConfig.google.clientSecret),
        callbackUrlConfigured: Boolean(oauthConfig.google.callbackUrl),
    });
}
