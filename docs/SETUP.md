# DeployForge Setup and Production Guide

## Prerequisites

### Local development

- Node.js 24
- pnpm 12.15.0 through Corepack
- PostgreSQL 16
- Redis 7
- Git and Docker with the Compose plugin

### Production control plane

- Linux VPS with Docker Engine, Docker Compose, Git, and SSH.
- Domain with `A`/`AAAA` records pointing to the VPS.
- Public TCP ports 80 and 443.
- Restricted deployment user with Docker access.
- Offsite storage for database backups and encryption-key recovery material.

### Target deployment VPS

Target nodes require SSH access and sufficient privileges for the selected bootstrap/deployment workflow. DeployForge prepares and operates Docker-based application infrastructure without installing a proprietary agent.

## Local development

```bash
git clone https://github.com/akramhossain-dev/DeployForge.git
cd DeployForge
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

Complete `.env`, then initialize the development database and generated Prisma client:

```bash
pnpm db:push
pnpm db:generate
pnpm dev
```

Default endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Liveness: `http://localhost:3001/live`
- Readiness: `http://localhost:3001/ready`

Before submitting changes:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Development workflow and pull-request standards are documented in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Production environment

Create the deployment checkout and restricted environment file:

```bash
sudo mkdir -p /opt/deployforge
sudo chown "$USER:$USER" /opt/deployforge
git clone https://github.com/akramhossain-dev/DeployForge.git /opt/deployforge
cd /opt/deployforge
cp .env.production.example .env
chmod 600 .env
```

Required groups of values:

- Public HTTPS URLs: `APP_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, `DOMAIN`.
- Data services: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`.
- Authentication: `JWT_SECRET`, `ADMIN_SECRET`, `ADMIN_JWT_SECRET`.
- Encryption: `ENCRYPTION_KEY` and optional separate `MASTER_KEY`, each 64 hexadecimal characters.
- GitHub: client ID, client secret, callback URL, and webhook secret.
- Google: disable with `GOOGLE_OAUTH_ENABLED=false` or provide a valid client ID, secret, and callback URL.
- Mail: SMTP host, port, user, password, and sender.
- Initial administrator: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`.
- Operations: `METRICS_TOKEN`, `CERTBOT_EMAIL`, rate limits, lockout settings, and log level.

Generate independent secrets rather than reusing one value:

```bash
openssl rand -hex 32
openssl rand -base64 48 | tr -d '\n'
```

Production validation rejects localhost or non-HTTPS `APP_URL`/`API_URL`. `JWT_SECRET` and `ADMIN_JWT_SECRET` must be separate. Loss of `ENCRYPTION_KEY` makes encrypted application data unrecoverable.

Validate interpolation before starting services:

```bash
docker compose config --quiet
docker compose build migrate api worker web
```

## First production deployment

Start data services and apply committed Prisma migrations:

```bash
docker compose pull postgres redis
docker compose up -d --wait postgres redis
docker compose run --rm migrate
```

Start the application services:

```bash
docker compose up -d --no-deps --wait api worker web
docker compose ps
```

Do not use `pnpm db:push` for production schema changes. The `migrate` service runs the production migration sequence and must succeed before application restart.

## Nginx and TLS

The `production` profile publishes Nginx on ports 80 and 443. When no certificate exists, the Nginx entrypoint uses its HTTP bootstrap configuration for the ACME challenge.

```bash
docker compose --profile production up -d nginx
docker compose --profile production run --rm certbot
docker compose --profile production restart nginx
```

Verify the public service:

```bash
curl --fail --show-error https://yourdomain.com/live
curl --fail --show-error https://yourdomain.com/ready
docker compose --profile production ps
```

Renew certificates and validate Nginx before reload:

```bash
docker compose --profile production run --rm certbot renew
docker compose --profile production exec nginx nginx -t
docker compose --profile production exec nginx nginx -s reload
```

Automate renewal with a monitored systemd timer or cron job.

## Tagged production releases

The CD workflow runs for tags matching `v*.*.*`. It requires the tag SHA to be contained in `main` and to have a successful completed CI push run.

Configure a GitHub environment named `production` with:

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST` | Production VPS hostname/IP. |
| `DEPLOY_USER` | SSH deployment user. |
| `DEPLOY_SSH_KEY` | Restricted deployment private key. |
| `DEPLOY_PATH` | Absolute checkout path, for example `/opt/deployforge`. |
| `DEPLOY_PORT` | Optional SSH port. |
| `DEPLOY_HOST_FINGERPRINT` | Recommended SSH host-key pin. |
| `SLACK_WEBHOOK_URL` | Optional failure notification. |

Publish a release only after `main` CI succeeds:

```bash
git switch main
git pull --ff-only origin main
git tag -a v1.0.0 -m "DeployForge v1.0.0"
git push origin v1.0.0
```

CD validates the exact SHA, validates Compose, builds images, waits for PostgreSQL/Redis, runs migrations, restarts API/worker/web, verifies service state, and prunes unused images. Production deployments are serialized and are not cancelled by newer releases.

Do not move or reuse a released tag. Fix forward and create a new version. Redeploying an older application commit requires a new tag, successful CI for that commit, and confirmation that its code remains compatible with the current database schema.

## Operations

### Status and logs

```bash
docker compose --profile production ps
docker compose logs --tail=200 api worker web nginx
docker compose logs --follow --tail=100 api worker
```

### PostgreSQL backup

```bash
install -d -m 700 backups
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "backups/postgres-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
chmod 600 backups/postgres-*.sql.gz
gzip --test backups/postgres-*.sql.gz
```

Copy encrypted backups off the VPS. Docker volumes are persistent storage, not an offsite backup.

### Database restore

Restore is destructive. Stop writers, take a fresh backup, and verify the target archive first:

```bash
docker compose stop api worker web
gunzip -c backups/postgres-TIMESTAMP.sql.gz | docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose up -d --no-deps --wait api worker web
```

Test this procedure in a separate environment before relying on it.

## Troubleshooting

### Invalid environment configuration

Compare `.env` with `.env.production.example`, confirm secrets meet length/format rules, and run:

```bash
docker compose config --quiet
docker compose logs --tail=200 api worker
```

### API is live but not ready

```bash
docker compose ps postgres redis api
docker compose logs --tail=200 postgres redis api
```

`/ready` requires PostgreSQL and, when enabled, Redis.

### Migration failure

Do not restart a new application release. Preserve the failure output and backup, then inspect migration state:

```bash
docker compose run --rm migrate
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at desc limit 20;"'
```

### Certificate failure

Confirm DNS, inbound port 80, Nginx bootstrap state, and Certbot output. Do not repeatedly request certificates until the underlying validation failure is fixed.

### Disk pressure

Inspect usage and live resources before cleanup:

```bash
df -h
docker system df -v
docker compose ps --all
```

Never prune volumes without verifying ownership and recovery requirements.
