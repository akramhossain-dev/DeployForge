# 🚀 DeployForge Setup & Installation Guide

This guide provides comprehensive instructions for installing, configuring, and running DeployForge in both local development and production environments.

---

## 1. Prerequisites

Before installing DeployForge, ensure your host machine and target target VPS systems meet these requirements:

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
DeployForge uses `pnpm` workspaces to manage dependencies across packages and apps. Install dependencies from the root directory:
```bash
pnpm install
```

### 2.3 Configure Environment Variables
Create a `.env` file in the monorepo root directory:
```env
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

# Database & Cache Connection Strings
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/deployforge?schema=public"
REDIS_URL="redis://localhost:6379"

# Cryptographic Keys (Must use random, cryptographically secure values)
# ENCRYPTION_KEY must be a 64-character hex string (32 bytes)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
JWT_SECRET=your_super_secret_jwt_sign_key_minimum_32_chars
ADMIN_SECRET=your_super_secret_admin_panel_creation_key
ADMIN_JWT_SECRET=your_super_secret_admin_jwt_sign_key_minimum_32_chars

# Super Admin Account (created/synced on startup)
SUPER_ADMIN_EMAIL=superadmin@deployforge.local
SUPER_ADMIN_PASSWORD=supersecretpassword123

# GitHub OAuth Integration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/github/callback
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret_key

# Google OAuth Integration (Optional)
GOOGLE_OAUTH_ENABLED=false
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# SMTP Mail Server Configuration
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM=no-reply@deployforge.com
```

### 2.4 Initialize Database & Schema
Prisma handles the schema synchronizations. Build the client and push the schema directly to your local database:
```bash
# Push schema changes to PostgreSQL
pnpm db:push

# Generate Prisma client bindings
pnpm db:generate
```

### 2.5 Run the Development Servers
Start the Next.js frontend app and the Fastify backend concurrently using the Turbo development script:
```bash
pnpm dev
```
Once compilation completes:
* **Frontend Web App:** `http://localhost:3000` (defaults to `3002` if port `3000` is occupied)
* **Backend REST API:** `http://localhost:3001`

---

## 3. Production Deployment

### 3.1 Deploying via Docker Compose (Recommended)
DeployForge includes structured multi-stage Dockerfiles and a Compose manifest configured with security hardening.

#### 1. Setup Environment
Create a production `.env` file on your host machine:
```env
NODE_ENV=production
PORT=3001
APP_URL=https://deployforge.com
API_URL=https://api.deployforge.com

DATABASE_URL="postgresql://postgres:secure_db_password@postgres:5432/deployforge?schema=public"
REDIS_URL="redis://:secure_redis_password@redis:6379"

# Generate 32-byte hex for ENCRYPTION_KEY using: openssl rand -hex 32
ENCRYPTION_KEY=your_production_64_character_hex_key
JWT_SECRET=your_long_production_jwt_secret
ADMIN_SECRET=your_long_production_admin_secret
ADMIN_JWT_SECRET=your_long_production_admin_jwt_secret
REDIS_PASSWORD=secure_redis_password
POSTGRES_PASSWORD=secure_db_password

# Super Admin Account (created/synced on startup)
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=your_secure_super_admin_password
...
```

#### 2. Run the Stack
Start all components in daemon mode using Docker Compose:
```bash
docker compose -f docker/docker-compose.yml up -d
```
The Compose stack orchestrates:
- **`postgres`:** Database storage with healthy checks and persistent volumes.
- **`redis`:** Message broker with password authentication.
- **`api`:** Fastify orchestrator running as an unprivileged user in read-only mode.
- **`web`:** Next.js server configured with production caching and optimized bundle execution.

### 3.2 Manual Production Process Setup (PM2)
If running outside Docker:

#### 1. Build and Compile Workspace
Compile Next.js production bundles and transpile Fastify TypeScript source files to JavaScript:
```bash
pnpm build
```

#### 2. Run Services via PM2
Create process configurations and launch:
```bash
# Start backend orchestrator
pm2 start apps/api/dist/server.js --name "deployforge-api"

# Start Next.js frontend web app
pm2 start pnpm --name "deployforge-web" -- start --port 3000
```

#### 3. Setup Reverse Proxy
Deploy Nginx on the host machine to terminate SSL (TLS) and proxy requests to the respective ports:
- Forward frontend requests to `http://127.0.0.1:3000`.
- Forward API requests to `http://127.0.0.1:3001`.
