# 🛠️ DEVELOPMENT.md

Follow these instructions to set up DeployForge for local development.

---

## 1. Prerequisites
Ensure you have the following installed on your system:
*   **Node.js:** v18 or later
*   **pnpm:** v8.15.4 (or matching package manager)
*   **Docker:** For running database/cache services or testing deployments locally
*   **PostgreSQL & Redis:** Local instances or Docker services

---

## 2. Setting Up the Project

### 2.1 Clone and Install
1.  Clone the repository.
2.  Install dependencies using pnpm:
    ```bash
    pnpm install
    ```

### 2.2 Configure Environment Variables
Copy the template `.env` file from the root directory or create one with the following parameters:
```env
NODE_ENV=development
PORT=3001
APP_URL=http://localhost:3000
API_URL=http://localhost:3001

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/deployforge?schema=public
REDIS_URL=redis://localhost:6379

JWT_SECRET=super_secret_jwt_sign_key_minimum_32_characters
ADMIN_SECRET=super_secret_admin_panel_signing_key
ADMIN_JWT_SECRET=super_secret_admin_jwt_sign_key

ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # 64-char hex

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=http://localhost:3001/api/github/callback
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret_key

GOOGLE_OAUTH_ENABLED=false

SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=dummy
SMTP_PASS=dummy
```

---

## 3. Database Operations

### 3.1 Schema Push
To sync the local database with the Prisma schema, run:
```bash
pnpm db:push
```

### 3.2 Prisma Client Generation
To regenerate the client bindings after making changes to `prisma/schema.prisma`:
```bash
pnpm db:generate
```

### 3.3 Studio View
Open the database manager GUI:
```bash
pnpm db:studio
```

---

## 4. Running the Applications

### 4.1 Running in Development Mode
Start the local Fastify backend and Next.js frontend concurrently using Turborepo:
```bash
pnpm dev
```
*   **API Service:** running on `http://localhost:3001`
*   **Web Dashboard:** running on `http://localhost:3000`

### 4.2 Building for Production
To build all applications and packages:
```bash
pnpm build
```

### 4.3 Linting and Testing
To run code formatting checks and tests:
```bash
pnpm lint
pnpm test
```
