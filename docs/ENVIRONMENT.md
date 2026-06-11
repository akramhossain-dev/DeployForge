# Environment Configuration

DeployForge uses environment variables for runtime configuration and secrets. Backend variables are loaded and validated by `apps/api/src/config/env.ts`; frontend public variables are centralized in `apps/web/lib/config/env.ts`.

Never commit real `.env` files. Use `.env.example` for local development shape and `.env.production.example` for production shape.

## Files

- `.env`: local secrets and machine-specific configuration. Ignored by git.
- `.env.example`: complete local development template with placeholders only.
- `.env.production.example`: production template with placeholders only.

## Development Setup

1. Copy `.env.example` to `.env`.
2. Replace every placeholder secret with a real value.
3. Generate `ENCRYPTION_KEY` and `MASTER_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. Set OAuth callback URLs in provider dashboards:
   - GitHub: `http://localhost:3001/auth/github/callback`
   - Google: `http://localhost:3001/auth/google/callback`

## Production Setup

Use a platform secret manager whenever possible. Do not bake secrets into Docker images, frontend bundles, or source control.

Set production callback URLs to public API URLs, for example:

- GitHub: `https://api.example.com/auth/github/callback`
- Google: `https://api.example.com/auth/google/callback`

## Variables

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | Yes | Backend | Runtime mode: `development`, `production`, or `test`. |
| `PORT` | Yes | Backend | API server port. |
| `APP_URL` | Yes | Backend | Public frontend URL used for OAuth redirects. |
| `API_URL` | Yes | Backend | Public API URL used for webhooks and server-generated URLs. |
| `LOG_LEVEL` | No | Backend | Runtime log level. |
| `NEXT_PUBLIC_API_URL` | Yes | Frontend | Public API URL embedded into the frontend bundle. |
| `DATABASE_URL` | Yes | Backend/Prisma | PostgreSQL connection string. |
| `POSTGRES_USER` | Docker | Docker | Local Postgres username for Docker Compose. |
| `POSTGRES_PASSWORD` | Docker | Docker | Local Postgres password for Docker Compose. |
| `POSTGRES_DB` | Docker | Docker | Local Postgres database name for Docker Compose. |
| `JWT_SECRET` | Yes | Backend | User JWT signing secret. |
| `ADMIN_SECRET` | Yes | Backend | Bootstrap secret for privileged admin creation. |
| `ADMIN_JWT_SECRET` | Yes | Backend | Admin JWT signing secret. |
| `GITHUB_CLIENT_ID` | Yes | Backend | GitHub OAuth app client ID. |
| `GITHUB_CLIENT_SECRET` | Yes | Backend | GitHub OAuth app client secret. |
| `GITHUB_CALLBACK_URL` | Yes | Backend | GitHub OAuth callback URL. |
| `GITHUB_WEBHOOK_SECRET` | Yes | Backend | Secret used to verify GitHub webhook signatures. |
| `GOOGLE_OAUTH_ENABLED` | Yes | Backend | Enables or disables Google OAuth initialization. |
| `GOOGLE_CLIENT_ID` | Yes when enabled | Backend | Google OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | Yes when enabled | Backend | Google OAuth client secret. |
| `GOOGLE_CALLBACK_URL` | Yes when enabled | Backend | Google OAuth callback URL. |
| `SMTP_HOST` | Yes | Backend | SMTP server host. |
| `SMTP_PORT` | Yes | Backend | SMTP server port. |
| `SMTP_SECURE` | Yes | Backend | Whether SMTP uses TLS from connection start. |
| `SMTP_USER` | Yes | Backend | SMTP username. |
| `SMTP_PASS` | Yes | Backend | SMTP password or app password. |
| `REDIS_URL` | Yes | Backend | Redis connection URL for queues/cache. |
| `ENCRYPTION_KEY` | Yes | Backend | 64-character hex key for AES-256 encryption. |
| `MASTER_KEY` | No | Backend | Alias for key rotation planning; must match `ENCRYPTION_KEY` while configured. |
| `RATE_LIMIT_MAX` | No | Backend | Maximum requests per rate-limit window. |
| `RATE_LIMIT_WINDOW` | No | Backend | Rate-limit window, for example `1 minute`. |

## Validation

The API fails fast when required variables are missing, empty, malformed, or unsafe. Validation checks include:

- Required variables are present.
- URLs are valid.
- Ports are between `1` and `65535`.
- JWT/admin secrets have minimum lengths.
- `ENCRYPTION_KEY` is exactly 64 hex characters.
- Google OAuth is complete when `GOOGLE_OAUTH_ENABLED=true`.
- OAuth secrets are never returned to frontend API responses.

## Security Recommendations

- Keep all secrets backend-only. Only variables prefixed with `NEXT_PUBLIC_` are allowed in frontend bundles.
- Do not log secret values. It is acceptable to log whether a secret is configured.
- Rotate `JWT_SECRET`, `ADMIN_JWT_SECRET`, OAuth secrets, SMTP passwords, and webhook secrets if they are ever exposed.
- Use separate OAuth apps for development and production.
- Use separate databases and Redis instances for development, staging, and production.
- Prefer managed secret stores in production.

## Legacy Names

The backend still accepts `GITHUB_REDIRECT_URI` and `GOOGLE_REDIRECT_URI` as compatibility fallbacks, but new configuration should use `GITHUB_CALLBACK_URL` and `GOOGLE_CALLBACK_URL`.
