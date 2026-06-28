# 🚀 DeployForge Setup & Installation Guide

This guide provides comprehensive instructions for installing, configuring, and running DeployForge in both local development and production environments.

---

## 1. Prerequisites

Before installing DeployForge, ensure your host machine and target VPS systems meet these requirements:

### 1.1 Development Host Requirements
* **Node.js:** v18.0.0 or higher (v20+ recommended)
* **Package Manager:** `pnpm` v8.x or v9.x
* **Database:** PostgreSQL v14 or higher (local or managed)
* **Cache & Queues:** Redis v6 or higher

### 1.2 Target VPS Requirements (Data Plane)
* **Operating System:** Ubuntu 22.04 LTS or 24.04 LTS (recommended)
* **SSH Access:** SSH server enabled (Key-based or password authentication)
* **Dependencies:** Docker Engine must be installed on the target VPS. If not present, DeployForge can automatically detect and perform setup during target server onboarding.
* **Firewall Ports:** Ports `22` (SSH), `80` (HTTP), and `443` (HTTPS) must be open.

---

## 2. Local Development Setup

### 2.1 Clone the Repository
```bash
git clone https://github.com/akramhossain-dev/DeployForge.git
cd DeployForge
```

### 2.2 Install Workspace Dependencies
DeployForge uses `pnpm` workspaces to manage dependencies across packages and apps. Install all dependencies from the root directory:
```bash
pnpm install
```

### 2.3 Configure Environment Variables
Copy `.env.example` and fill in values:
```bash
cp .env.example .env
```

Edit `.env` with your local configuration:
```env
# Application
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
LOG_LEVEL=info

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001

# Database
POSTGRES_USER=postgres_user
POSTGRES_PASSWORD=postgres_password
POSTGRES_DB=deployforge_database
DATABASE_URL="postgresql://postgres_user:postgres_password@localhost:5432/deployforge_database?schema=public"

# Redis
REDIS_ENABLED=true
REDIS_URL="redis://localhost:6379"

# Cryptographic Keys — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  # 64 hex chars
JWT_SECRET=your_super_secret_jwt_sign_key_minimum_32_chars
ADMIN_SECRET=your_super_secret_admin_panel_creation_key
ADMIN_JWT_SECRET=your_super_secret_admin_jwt_sign_key_minimum_32_chars

# Super Admin Account (created/synced automatically on every startup)
SUPER_ADMIN_EMAIL=superadmin@deployforge.local
SUPER_ADMIN_PASSWORD=supersecretpassword123

# GitHub OAuth — create app at https://github.com/settings/developers
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/auth/github/callback   # ← Note: /auth/github/callback
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret_key

# Google OAuth (Optional — set GOOGLE_OAUTH_ENABLED=false to skip)
GOOGLE_OAUTH_ENABLED=false
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback   # ← Note: /auth/google/callback

# SMTP Mail Server
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM=no-reply@deployforge.com

# Security & Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW="1 minute"
ADMIN_MAX_ATTEMPTS=5
ADMIN_LOCKOUT_TIME=900

# Metrics endpoint protection (leave empty in dev)
METRICS_TOKEN=
```

> **⚠️ Important OAuth Callback URLs:**
> - GitHub: `http://localhost:3001/auth/github/callback`
> - Google: `http://localhost:3001/auth/google/callback`
> 
> These must exactly match the callback URLs registered in your OAuth app settings.

### 2.4 Initialize Database & Schema
Prisma handles schema synchronization. Build the client and push the schema to your local database:
```bash
# Push schema changes to PostgreSQL
pnpm db:push

# Generate Prisma client bindings
pnpm db:generate
```

### 2.5 Run the Development Servers
Start the Next.js frontend app and the Fastify backend concurrently using Turborepo:
```bash
pnpm dev
```
Once compilation completes:
* **Frontend Web App:** `http://localhost:3000`
* **Backend REST API:** `http://localhost:3001`

The Super Admin account is created automatically on the first API startup using `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from your `.env`.

---

## 3. Production Deployment

### 3.1 Deploying via Docker Compose (Recommended)

DeployForge includes production-hardened multi-stage Dockerfiles and a Docker Compose manifest with full security configuration.

#### Step 1: Prepare Environment File
Copy the production template and fill in **all** values:
```bash
cp .env.production.example .env
```

> **🔐 Generate secure secrets:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

Key production values to set:
```env
NODE_ENV=production
PORT=3001
APP_URL=https://yourdomain.com
API_URL=https://yourdomain.com
LOG_LEVEL=warn

NEXT_PUBLIC_API_URL=https://yourdomain.com

POSTGRES_USER=deployforge
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=deployforge
DATABASE_URL=postgresql://deployforge:<password>@postgres:5432/deployforge?schema=public

REDIS_ENABLED=true
REDIS_PASSWORD=<strong-random-password>
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379

JWT_SECRET=<64-hex-chars>
ADMIN_SECRET=<48-hex-chars>
ADMIN_JWT_SECRET=<64-hex-chars>
ENCRYPTION_KEY=<64-hex-chars>

SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=<strong-password>

GITHUB_CLIENT_ID=<your-github-oauth-client-id>
GITHUB_CLIENT_SECRET=<your-github-oauth-client-secret>
GITHUB_CALLBACK_URL=https://yourdomain.com/auth/github/callback
GITHUB_WEBHOOK_SECRET=<64-hex-chars>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=<gmail-app-password>

DOMAIN=yourdomain.com
CERTBOT_EMAIL=you@yourdomain.com

# REQUIRED for production — protects /metrics endpoint
METRICS_TOKEN=<64-hex-chars>
```

#### Step 2: Run Infrastructure Services
Start the core stack (database, cache, API, web):
```bash
docker compose up -d
```

The Compose stack orchestrates:
- **`postgres`:** PostgreSQL 16 with health checks and persistent volume.
- **`redis`:** Redis 7 with password auth, AOF persistence, and health check.
- **`api`:** Fastify orchestrator in read-only mode, no new privileges, all capabilities dropped.
- **`web`:** Next.js server with telemetry disabled and production optimizations.

#### Step 3: Apply Database Migrations
On first launch (or after schema updates), run migrations:
```bash
docker compose exec api npx prisma migrate deploy --schema /app/prisma/schema.prisma
```

#### Step 4: Enable Nginx + SSL (Production Profile)
Start Nginx and issue Let's Encrypt certificates:
```bash
# Issue certificate (run once)
docker compose --profile production run --rm certbot

# Start Nginx reverse proxy
docker compose --profile production up -d nginx

# Reload Nginx after cert issuance
docker compose exec nginx nginx -s reload
```

> **Note:** Make sure your domain's DNS A record points to your server's IP before running Certbot.

#### Step 5: Verify Services
```bash
# Check all containers are healthy
docker compose ps

# View API logs
docker compose logs api --tail=50

# Test health endpoints
curl https://yourdomain.com/health
curl https://yourdomain.com/live
```

---

### 3.2 Manual Production Setup (PM2)

If running outside Docker:

#### Step 1: Build All Packages
```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
```

#### Step 2: Run Services via PM2
```bash
# Install PM2 globally
npm install -g pm2

# Start Fastify API backend
pm2 start apps/api/dist/server.js --name "deployforge-api"

# Start Next.js frontend
pm2 start pnpm --name "deployforge-web" -- start --prefix apps/web --port 3000

# Save process list and enable startup
pm2 save
pm2 startup
```

#### Step 3: Setup Nginx Reverse Proxy
Deploy Nginx on the host machine to terminate TLS and proxy to the respective services:
- Forward `yourdomain.com` requests to `http://127.0.0.1:3000`
- Forward `yourdomain.com/api` or API subdomain requests to `http://127.0.0.1:3001`

---

## 4. Available pnpm Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start all apps in development mode (Turborepo) |
| `pnpm build` | Build all packages and apps for production |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm typecheck` | Run TypeScript type checking across all packages |
| `pnpm db:push` | Push Prisma schema changes to database (dev only) |
| `pnpm db:generate` | Regenerate Prisma client bindings |
| `pnpm db:studio` | Open Prisma Studio database browser |

---

## 5. Troubleshooting

### API fails to start — "Invalid environment configuration"
The API performs strict environment validation at startup via Zod. Read the error messages carefully — they will name the exact variable that's missing or invalid.

Common issues:
- `ENCRYPTION_KEY` must be exactly 64 lowercase hex characters
- `JWT_SECRET` must be at least 32 characters and not start with `replace_with_`, `your_`, etc.
- `APP_URL` and `API_URL` must be valid `https://` URLs in production
- `GOOGLE_CLIENT_ID` must end with `.apps.googleusercontent.com` if Google OAuth is enabled

### Database connection fails
Ensure `DATABASE_URL` uses the correct hostname:
- Local dev: `localhost:5432`
- Docker Compose: `postgres:5432` (service name)

### Redis connection error
If `REDIS_ENABLED=true`, `REDIS_URL` must be provided and reachable. Use `REDIS_ENABLED=false` to run without Redis (queues and caching will be disabled).
