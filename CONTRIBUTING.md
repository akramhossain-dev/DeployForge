# 🤝 Contributing to DeployForge

Thank you for your interest in contributing to DeployForge! This guide outlines the workflow, coding standards, and guidelines for contributing to our self-hosted deployment platform.

---

## 1. How to Contribute

### 1.1 Development Workflow
1. **Fork the Repository:** Create a personal fork and clone it to your local machine.
2. **Create a Feature Branch:** Branch off from the `main` branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Environment Setup:** Follow the instructions in [docs/SETUP.md](docs/SETUP.md) to initialize your database, cache, and launch local development services.
4. **Develop and Implement:**
   - Write your code following the monorepo architecture.
   - Utilize existing shared workspace packages (`packages/security` for crypto/hashing, `packages/vps` for SSH) to ensure system uniformity.
5. **Code Style & Verification:** Ensure all types pass and linting produces no warnings:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
6. **Submit a Pull Request:** Open a PR targeting the `main` branch. Include a clear description of the problem, the proposed solution, and details of any tests run.

---

## 2. Coding Standards

### 2.1 TypeScript & Type Safety
* **Strict Type Safety:** Avoid `as any` type assertions or `any`-typed variables. Augment module declarations when adding custom Fastify attributes.
* **Shared Types:** Share API input/output types between `apps/web` and `apps/api` by adding them to `@deployforge/shared`.

### 2.2 Monorepo Packages
Put core business logic in the correct package:
* `packages/security` — AES-256-GCM encryption, Argon2id hashing, JWT utilities.
* `packages/vps` — SSH connection pools, remote execution, SFTP transfers.
* `packages/database` — Prisma schema, client singleton, database helpers.
* `packages/mail` — Mail transporter, templating, delivery validation.
* `packages/shared` — Interfaces, API schemas, error types, common validators.

### 2.3 Package Management
Always use `pnpm` to manage dependencies:
```bash
pnpm install
pnpm add <package-name> --filter <workspace-name>
```
Do **not** commit `package-lock.json` or `yarn.lock` files.

### 2.4 API Design Conventions
* All API responses follow the standard envelope:
  - Success: `{ success: true, data: { ... } }`
  - Error: `{ success: false, error: { code, message } }`
* Validate all request inputs with Zod schemas. Add shared schemas to `@deployforge/shared`.
* Sensitive error details must never be returned to the client in production. The global error handler in `apps/api/src/app.ts` sanitizes all 5xx responses.
* State-changing endpoints must be protected by CSRF. The `csrfGuard` plugin is applied automatically to all non-`GET` routes.

### 2.5 Security Guidelines
* All secrets written to the database must be encrypted using `EncryptionService` from `@deployforge/security`.
* SSH commands executed on target VPS nodes must use `shellQuote`/`shellPath` from `@deployforge/vps` — never interpolate user input directly into shell strings.
* Do not add new environment variables without updating both `.env.example` and `.env.production.example`, and adding validation to `apps/api/src/config/env.ts`.

---

## 3. Pull Request Guidelines

* **Lint and Type Check:** Run before submitting:
  ```bash
  pnpm lint
  pnpm typecheck
  pnpm build
  ```
* **Commit Messages:** Use conventional commit format:
  ```
  feat(api): add session revocation on password reset
  fix(web): correct useCallback dependency in vps page
  docs: update API.md with notification endpoints
  chore(deps): bump next from 14.1.0 to 14.2.0
  ```
* **Code Review:** All PRs require approval from at least one core maintainer. Do not merge incomplete features or disabled code placeholders.
* **Documentation:** If your change adds or modifies a feature, update the relevant doc in `docs/`. If it adds new API routes, update `docs/API.md`. If it adds new env vars, update both example files.

---

## 4. Project Layout Reference

```text
DeployForge/
├── apps/
│   ├── api/src/
│   │   ├── config/       # Env validation & typed config exports
│   │   ├── plugins/      # Fastify plugins (auth guard, CSRF)
│   │   ├── repositories/ # Database query helpers
│   │   ├── routes/       # Route handlers (one file per resource)
│   │   ├── services/     # Business logic services
│   │   ├── utils/        # Queue, logger, deployment events
│   │   ├── workers/      # BullMQ deployment worker
│   │   ├── app.ts        # Fastify app builder (plugins, error handler)
│   │   └── server.ts     # Entry point (startup, graceful shutdown)
│   └── web/
│       ├── app/          # Next.js App Router pages
│       │   ├── (public)/ # Landing page, auth pages, docs
│       │   ├── (app)/    # Protected dashboard (vps, deployments, domains...)
│       │   └── (admin)/  # Admin panel
│       ├── components/   # Shared UI components
│       ├── hooks/        # Custom React hooks
│       └── lib/          # API client, auth helpers, utilities
├── packages/
│   ├── database/         # Prisma client
│   ├── mail/             # Email transporter
│   ├── security/         # Crypto utilities
│   ├── shared/           # Types, schemas, errors
│   └── vps/              # SSH/SFTP library
└── prisma/
    ├── schema.prisma     # Source of truth for DB schema
    └── migrations/       # Versioned migration files
```
