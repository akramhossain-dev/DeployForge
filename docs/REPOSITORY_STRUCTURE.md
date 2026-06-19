# 📂 REPOSITORY_STRUCTURE.md

DeployForge is managed as a monorepo utilizing **Turborepo** and **pnpm** workspaces. The workspace configuration divides the project into applications (`apps/*`) and active shared packages.

---

## 1. Directory Blueprint

```text
DeployForge/
├── apps/
│   ├── api/                # Fastify Backend API
│   └── web/                # Next.js Frontend Dashboard
├── packages/
│   ├── database/           # Active - Prisma database client export
│   ├── mail/               # Active - Nodemailer SMTP mail transporter
│   ├── security/           # Active - AES-256-GCM & JWT encryption utility services
│   ├── shared/             # Active - Shared typescript helpers and types
│   └── vps/                # Active - ssh2 client wrapper (SSHService)
├── prisma/                 # Database Schema & migrations (PostgreSQL)
├── docker/                 # Production & local docker templates
├── docs/                   # Documentation system (markdown)
├── scripts/                # Development setup scripts
├── package.json            # Monorepo root package configuration
├── pnpm-lock.yaml          # Monorepo root package lockfile
├── pnpm-workspace.yaml     # pnpm workspaces path mappings
└── turbo.json              # Turborepo configuration
```

---

## 2. Core Applications

### 2.1 Fastify Backend (`apps/api`)
The api contains the application services, validation rules, HTTP server setup, and workers:
*   `src/app.ts`: Registers core plugins, global error handlers, helmet, cors, rate limits, and routing prefixes.
*   `src/server.ts`: Starts the Fastify listener.
*   `src/config/env.ts`: Loads and validates environment variables utilizing Zod.
*   `src/plugins/auth.ts`: Defines `authGuard` plugin logic checking access tokens and active database session IDs.
*   `src/routes/`: Exposes routing tables for authentication, VPS targets, deploy jobs, domain mappings, monitoring data, profiles, and interactive terminals.
*   `src/services/`: Implements the central business logic:
    *   `auth.service.ts` / `account.service.ts`: Signups, Logins, password resets, active session revoking, profile edits, and security logs.
    *   `vps.service.ts` / `monitoring.service.ts`: Targets health checking, command dispatching, metrics gathering.
    *   `deployment.service.ts` / `sandbox.service.ts` / `rollback.service.ts`: Framework detection, port mapping, Docker container lifecycle orchestration, and build package validation.
*   `src/workers/`: BullMQ worker instances listening for background tasks.

### 2.2 Next.js Frontend (`apps/web`)
The web app is a Next.js 14 client application:
*   `app/(app)/`: Authenticated user dashboard views (VPS management, Deployments, Settings, Security logs, Terminal).
*   `app/(public)/`: Public routes (Landing page, Features list, Contact forms, Register/Login pages).
*   `components/`: Reusable Tailwind/shadcn components.
*   `hooks/`: React Query custom hooks querying the API.
*   `lib/`: Client configuration (HTTP client, environment variables).

---

## 3. Shared Packages (`packages/*`)

*   **`packages/database`:** Initializes and exports the shared Prisma client instance pointing to PostgreSQL.
*   **`packages/security`:** Implements `EncryptionService` (using `crypto` and AES-256-GCM for secrets encryption) and `TokenService` (using `jsonwebtoken` to sign/verify JWTs).
*   **`packages/vps`:** Implements the `SSHService` wrapper class, which connects to remote targets, streams commands stdout/stderr, and supports SFTP file transfers.
*   **`packages/mail`:** Configuration for Nodemailer transport setup.
*   **`packages/shared`:** Shared Typescript interfaces and general common constants.
