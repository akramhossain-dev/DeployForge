# 🚀 DeployForge Setup & Installation Guide

This guide describes how to install, configure, and run **DeployForge** for both local development and production environments.

---

## 📋 System Requirements

*   **Node.js:** v18.0.0 or higher
*   **Package Manager:** pnpm v8.15.4 (or compatible v8/v9 version)
*   **Database:** PostgreSQL v14 or higher
*   **Cache & Queue:** Redis v6 or higher
*   **Operating System:** Linux / macOS (Ubuntu 22.04 LTS recommended for production targets)
*   **Remote Host Dependencies:** Target servers must have SSH access and Docker Engine pre-installed (or let DeployForge discover and install it).

---

## 🛠️ Local Development Quickstart

### 1. Clone the Repository & Install Dependencies
```bash
git clone https://github.com/your-username/DeployForge.git
cd DeployForge
pnpm install
```

### 2. Configure Local Environment Variables
Create a `.env` file in the root directory of the project:
```env
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

# Database and Cache
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/deployforge?schema=public
REDIS_URL=redis://localhost:6379

# Cryptographic Keys (ENCRYPTION_KEY must be a 64-character hex string)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
JWT_SECRET=super_secret_jwt_sign_key_minimum_32_characters
ADMIN_SECRET=super_secret_admin_panel_signing_key_minimum_24_characters
ADMIN_JWT_SECRET=super_secret_admin_jwt_sign_key_minimum_32_characters

# GitHub Integrations
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/github/callback
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret_key

# Google Integrations (Optional)
GOOGLE_OAUTH_ENABLED=false

# SMTP Configuration
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=dummy
SMTP_PASS=dummy
```

### 3. Initialize the Database
Generate the Prisma client client bindings and sync the database schema:
```bash
# Push the schema changes directly to your local database
pnpm db:push

# Generate the Prisma client bindings
pnpm db:generate
```

### 4. Launch Development Servers
Run the Next.js frontend and Fastify API server concurrently:
```bash
pnpm dev
```
*   **Frontend Web App:** `http://localhost:3000`
*   **Fastify API Backend:** `http://localhost:3001`

---

## 🌐 Production Server Deployment

To host DeployForge in a self-hosted production capacity, use the following steps:

### 1. Prepare Target VPS Nodes
Ensure ports `80` (HTTP) and `443` (HTTPS) are open on your firewalls. Your DeployForge instance must be reachable on the internet to receive GitHub webhooks.

### 2. Setup Database & Redis
Ensure your production PostgreSQL and Redis instances are running securely. We recommend running database instances outside the application host or utilizing standard managed cloud options.

### 3. Environment Adjustments
*   Set `NODE_ENV=production`.
*   Generate unique, random cryptographically secure keys (e.g. 64-char hex string for `ENCRYPTION_KEY` and long strings for `JWT_SECRET`).
*   Update `APP_URL` and `API_URL` to point to your public domain names (e.g., `https://deployforge.com` and `https://api.deployforge.com`).
*   Update your GitHub OAuth callback endpoints in the Developer Portal to match your production API domain.

### 4. Build and Compile
Build the workspaces to build production bundles for Next.js and compile Fastify TypeScript files:
```bash
pnpm build
```

### 5. Running Processes
Use a process manager like **PM2** to run the services in the background:
```bash
# Start backend API
pm2 start apps/api/dist/server.js --name "deployforge-api"

# Start the frontend Next.js server
pm2 start pnpm --name "deployforge-web" -- start --port 3000
```
Use an Nginx reverse proxy on the DeployForge host machine to map public ports `80`/`443` to the backend and frontend listening ports (`3001` and `3000` respectively).
