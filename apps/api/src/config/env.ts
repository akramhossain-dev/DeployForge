import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string(),
    REDIS_URL: z.string(),
    JWT_SECRET: z.string(),
    ENCRYPTION_KEY: z.string().length(64), // Hex string for 32 bytes
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    GITHUB_WEBHOOK_SECRET: z.string(),
    GITHUB_REDIRECT_URI: z.string(),
    APP_URL: z.string().default('http://localhost:3000'),
    SMTP_HOST: z.string(),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_SECURE: z.enum(['true', 'false']).transform((v) => v === 'true').default('false'),
    SMTP_USER: z.string(),
    SMTP_PASS: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const config = parsed.data;
