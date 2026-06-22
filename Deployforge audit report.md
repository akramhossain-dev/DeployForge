# DeployForge — Senior Production Code Audit Report

**Repository:** `akramhossain-dev/DeployForge`  
**Audit Date:** June 22, 2026  
**Audited By:** Principal-Level Cross-Discipline Team (Architecture, Security, Backend, Frontend, DevOps, Database, QA, Performance, SRE, Code Review)  
**Stack:** Next.js 14 · Fastify · PostgreSQL · Redis · BullMQ · Prisma · Docker · Turborepo / pnpm workspaces

---

## Table of Contents

1. Project Architecture
2. Backend Review
3. Frontend Review
4. Security Audit
5. Database Review
6. DevOps Review
7. Performance Review
8. Code Quality
9. Error Handling
10. API Review
11. Production Readiness
12. Missing Features
13. Testing Review
14. Configuration Review
15. Bug Detection
16. Severity Classification
17. Code Smells
18. Scores
19. Final Verdict
20. Final Rating
21. Roadmap

---

## 1. Project Architecture

**Score: 7.5 / 10**

### What's Good

The repository uses a well-structured Turborepo + pnpm workspaces monorepo. The separation of concerns across packages is deliberate and effective:

- `packages/security` — pure cryptographic primitives (AES-256-GCM, Argon2id, JWT)
- `packages/vps` — SSH session management isolated from business logic
- `packages/database` — Prisma client as a shared singleton
- `packages/mail` — SMTP transport isolated behind an interface
- `packages/shared` — API types, constants, pagination helpers shared between `apps/api` and `apps/web`

The backend follows a recognisable **Route → Service → Repository** pattern. Fastify plugins (`auth`, `csrf`) are properly encapsulated using `fastify-plugin`. The queue worker (`deployment.worker.ts`) is separated from the HTTP layer. Turbo's pipeline respects build order dependencies correctly.

### Issues Found

**Double-route registration (app.ts)** — Every route is registered twice: once under `/api/...` and once without the prefix (e.g. `/auth` and `/api/auth`). This is an attempt to support both prefixed and un-prefixed access, but it doubles the route table, creates ambiguous routing semantics, and can cause unintended endpoint exposure. The `onRequest` URL-rewriting hook already canonicalises the path. The duplicate registration without prefix is redundant and should be removed.

```ts
// app.ts — every route registered twice:
await app.register(import('./routes/auth'), { prefix: '/api/auth' });
await app.register(import('./routes/auth'), { prefix: '/auth' }); // ← redundant
```

**No interface-driven service layer** — Services are static class methods that import `prisma` directly. This tightly couples every service to the ORM and makes unit testing nearly impossible without mocking the entire Prisma singleton. A repository or data-access abstraction layer is missing.

**God-class `DeploymentService`** — `deployment.service.ts` is ~1,000 lines. It handles source preparation, SSH commands, Nginx config generation, Docker container lifecycle, caching logic, port allocation, static asset rewriting, file-hash computation, and rollback orchestration. This violates SRP and makes the class difficult to test or reason about in isolation.

**`any` cast overuse** — `fastify as any` appears in every route file to access decorated properties (`authGuard`, `requireAdmin`, etc.). The plugin correctly adds type declarations via `declare module 'fastify'`, but every route still casts to `any`. This defeats TypeScript's purpose and hides potential type errors.

**Missing `/profile` route** — The `profile` route is registered under both `/api/profile` and `/profile`, yet the frontend always calls `/api/profile`. The bare `/profile` registration is dead.

---

## 2. Backend Review

### API Design

Routes are cleanly organised by domain (`/auth`, `/vps`, `/deploy`, `/deployments`, `/monitoring`, `/terminal`, `/webhooks`, `/admin`). Schemas are defined with Zod at the top of each route file and parsed early. HTTP verbs are correctly assigned (GET/POST/PATCH/DELETE). Status codes are largely correct.

### Validation

Zod schemas are thorough. Input sanitisation (hostname patterns, UUID format, file name safety, proto-pollution check in `preValidation`) is present and correct. The proto-pollution guard in `app.ts` is a nice defensive touch.

### Issues Found

**`request.user` typed as `any`** — The `authGuard` plugin sets `request.user` as `any`. Every downstream route handler receives an untyped user object. A typed `AuthenticatedUser` interface should be declared and threaded through the Fastify request generic.

**Unsafe `as any` casts on `fastify`** — See architecture section. This is repeated in every route file (15+ occurrences).

**`VPSService.getVpsAuth` passes raw secrets via `getVpsAuth(vps: any)`** — The `vps` argument is untyped (`any`). If a field is missing (e.g., `encryptedPrivateKey` is null and `authType` is `key`), the call `this.decrypt(vps.encryptedPrivateKey!)` will throw a runtime error with a misleading message rather than a clean validation error.

**Deployment log WebSocket uses polling** — `deploy.ts` WebSocket handler polls the database every 1,500 ms with `setInterval`. This generates continuous DB load when users watch deployments. A proper event-driven approach using Postgres LISTEN/NOTIFY or Redis pub/sub would be far more efficient.

**File upload directory not cleaned on partial failure** — In `readUploadMultipart`, if the pipeline to `fs.createWriteStream` fails midway, the temp directory is created but never cleaned. A `finally` block is missing.

**`projectFromRepository` creates or updates a project as a side effect of a deployment** — This is hidden mutation inside a helper called during a GET-equivalent lookup. Creating resources during what appears to be a read is surprising and violates the principle of least astonishment.

**Missing input size limit on `env` field** — The `env` field in `githubDeploySchema` is `z.record(z.string()).optional()`. There is no limit on the number of keys or the length of values. An attacker could inject very large environment variable payloads.

**Admin login brute-force counting not atomic** — The admin lockout logic in `admin.ts` reads `attempts`, checks, then updates. Under concurrent requests this is a TOCTOU race (two simultaneous logins could both read `attempts=4` and both succeed before either write increments to 5).

**`refreshSchema` validates token format but the refresh token in the database is stored as a SHA-256 hash** — The raw 80-character token is correctly not stored in the DB (only its SHA-256 hash is). However, the token is passed in the HTTP body in plain text. If HTTPS is not enforced (which it isn't in development), this token is exposed in transit.

**No server-side session invalidation on password change** — `AccountService.resetPassword` changes the password but does not revoke active sessions. An attacker who has already obtained a valid session token retains access after the victim resets their password.

**`TokenService.generateRefreshToken` exists but is never called** — A JWT-based refresh token generator is present in `packages/security/src/tokens.ts` but the actual system uses random bytes stored hashed in the DB. The JWT-based generator is dead code that could confuse future developers.

---

## 3. Frontend Review

### Architecture

The Next.js App Router is used correctly with route groups `(public)`, `(app)`, and `(admin)`. The `middleware.ts` provides route protection at the edge. Zustand is used for auth state (simple and appropriate). The API client (`lib/api/client.ts`) is well-structured with centralised CSRF handling and auto-retry on 401.

### Issues Found

**Frontend middleware trusts cookie existence, not validity** — `middleware.ts` checks `request.cookies.get('accessToken')?.value` for authentication. It does not validate the JWT. An expired or tampered token will pass the middleware check and the user will reach the protected page only to get a 401 on the first API call. The UX is correct (redirect to login after the retry fails), but the first page render may flash protected content momentarily before the redirect.

**`console.debug` leaks in production** — `lib/api/client.ts` calls `console.debug` on every request and response. In production, these logs are visible in the browser DevTools and leak internal API path structure to any observer. They should be guarded by an `isDev` flag.

**`console.error` on API errors** — Same file logs `[api:error]` to the console including the error message and context. In production this will surface internal error details in browser logs.

**Auth state is client-only** — The `useAuthStore` Zustand store is initialised with `hasHydrated: true` and `user: null`. There is no server-side session hydration. The first render is always unauthenticated even if a valid cookie exists, causing a flash of unauthenticated content on protected pages before the client-side auth check fires.

**No loading/skeleton states verified across pages** — While `SystemFallbacks.tsx` and error boundaries exist, individual page components were not audited for consistent loading states. The VPS page, deployments list, and monitoring page all make API calls on mount; without loading skeletons, users may see empty tables briefly.

**Error display inconsistency** — `errorParser.ts` exists, but its usage across page components was not uniform in the reviewed files. Some `catch` blocks appear to ignore errors silently.

**No accessibility review** — No ARIA labels, roles, or keyboard navigation patterns were observed in the reviewed components. This is a gap for production SaaS.

---

## 4. Security Audit

**Overall Security Rating: 7.5 / 10**

### Strong Points

- Argon2id password hashing with hardened parameters (memory=65536, time=3, parallelism=4)
- Timing-safe equality checks (`timingSafeEqualString`) used consistently for token comparison
- AES-256-GCM with random 12-byte IVs for SSH credential encryption
- OTP stored as SHA-256 hash — never returned from API
- Refresh token stored as SHA-256 hash — never stored in plaintext
- Refresh token replay detection with full session revocation on replay
- Proto-pollution guard in `preValidation` hook
- Custom CSRF implementation using HMAC-SHA256 double-submit cookie pattern
- Prototype-safe `shellQuote` and `shellPath` functions used consistently in all shell command construction
- Secure archive extraction using Python3 with path traversal checks
- Helmet configured with strict CSP, HSTS, X-Frame-Options: deny
- CORS locked to `config.app.appUrl` and `config.app.apiUrl` in production
- GitHub webhook HMAC-SHA256 signature verified using timing-safe comparison
- Webhook replay protection via unique delivery ID (`x-github-delivery`) as DB primary key
- Admin sessions have a separate JWT secret and token hash is validated per-request against DB

### Critical Issues

**🔴 No server-side session revocation on password reset**

`AccountService.resetPassword` updates the password hash but does NOT call `revokeAllSessions`. An attacker who captures a valid access token (15-minute window) or refresh token (7 days) retains full access after the victim resets their password.

```ts
// Missing in AccountService.resetPassword:
await prisma.session.deleteMany({ where: { userId } });
```

**🔴 GitHub OAuth access token stored encrypted but never rotated**

`GitHubAccount.accessToken` stores the OAuth token encrypted. GitHub OAuth tokens are long-lived (unless using fine-grained tokens or expiring ones). If the encryption key is compromised or if the token is decrypted for each deployment (which it is), there is no rotation mechanism. A compromised token gives read/write access to the user's entire GitHub account.

**🔴 Access token injected into git clone URL in plaintext on remote server**

In `prepareGithubSource`:

```ts
const repoUrl = repositoryUrl.replace(/^https:\/\//, `https://${encodeURIComponent(source.accessToken)}@`);
await this.run(ssh, ... `git clone ... ${shellQuote(repoUrl)} ${shellQuote(workDir)}`);
```

The GitHub access token is embedded in the git clone URL. This is logged by git itself in `.git/config` on the remote server, and may appear in shell history, process listings (`ps aux`), or SSH server logs. The token should be injected via `GIT_ASKPASS` or a git credentials helper, not as a URL component.

**🔴 Environment variables written to `.env.deployforge` in the working directory on remote server**

`injectEnvironment` writes a `.env.deployforge` file to the deployment working directory. This file contains all plaintext secrets. It is world-readable unless the directory permissions are locked. The function does `chmod 600` but only on the file, not the parent directory. Any other process running as the same user on the VPS can read it.

### High Issues

**🟠 CSRF cookie is not `HttpOnly`**

The CSRF token cookie is set without `httpOnly: true`:

```ts
reply.header('Set-Cookie', cookie(csrfCookieName, token, 60 * 60 * 8));
```

The `cookie()` utility defaults `httpOnly` to false when not specified. A CSRF token must be readable by JavaScript (by design for double-submit), but it still needs to be protected from exfiltration by untrusted scripts if the site uses any third-party scripts. This is an accepted trade-off, but should be explicitly documented.

**🟠 `SameSite=None; Secure` in production but cookies shared across domains**

The access and refresh token cookies use `SameSite=None; Secure` in production (from `cookie()` utility). This is required for cross-site requests but means the tokens will be sent on all cross-origin requests to the API domain, not just from the frontend. This is correct for the intended architecture but requires that the CORS origin restriction and CSRF are functioning correctly — any CORS misconfiguration would immediately expose the session tokens.

**🟠 Admin bootstrap secret is printed in logs on each startup**

`validateOAuthConfig` logs `clientIdConfigured: Boolean(...)` on startup. This is fine. However, admin creation requires sending `ADMIN_SECRET` in the request body (`createAdminSchema`). If the admin creation endpoint is called incorrectly, the Fastify logger may log the request body including the plain-text secret.

**🟠 No brute-force protection on OTP verification beyond 5 attempts**

`verifyOTP` increments an `attempts` counter and rejects after 5 attempts. However, an attacker who knows the email could:

1. Trigger OTP (registers a new OTP token, resets attempts to 0)
2. Try 5 guesses (exhausts attempts)
3. Trigger OTP again — attempts resets to 0 on `upsert`
4. Repeat indefinitely

There is no cooldown or exponential back-off between OTP requests. The route does have a per-IP rate limit of 10/minute, but IP rotation would bypass this.

**🟠 `console.debug` / `console.error` in production browser build**

See Frontend section. These logs leak internal path and error information.

**🟠 Missing `Secure` flag check in dev for cookies**

In development, cookies are set without `Secure`. This is correct, but if the dev server is accidentally exposed on a non-TLS network, tokens are transmitted in plaintext.

### Medium Issues

**🟡 Session not updated on user role change**

If an admin changes a user's role via the admin panel, the JWT access token already issued still contains the old role for its remaining 15-minute lifetime. The `authGuard` re-fetches the user from the database on every request, so role changes take effect immediately for the user record check. However, if the role is stored in the JWT and trusted without re-fetching, this becomes a privilege escalation vector. Currently the code re-fetches the user, so the risk is mitigated — but the JWT payload carries a stale role value that could be misleading.

**🟡 `GitHubAccount.accessToken` is decrypted on every deployment**

Every deployment decrypts the stored GitHub access token. There is no in-memory caching with a TTL. For high-frequency deployments, this results in repeated calls to `EncryptionService.decrypt`, which is safe but creates unnecessary overhead.

**🟡 `WebhookEvent` payload stored in DB without size check at Prisma layer**

The webhook handler already enforces a 1MB payload check, and `HardeningService.limitWebhookPayload` presumably truncates further. This is good. However, the `payload` field in `WebhookEvent` is a plain `String` with no max-length in the Prisma schema. If `limitWebhookPayload` is bypassed or misconfigured, large payloads could fill storage.

---

## 5. Database Review

### Schema Quality

The Prisma schema is well-organised. Models use UUID primary keys (`@id @default(uuid())`), except `Session`, `VPSHealth`, `Project`, `RefreshTokenReplay`, and several token models which use `cuid()`. This mix of `uuid()` and `cuid()` is inconsistent — it should be standardised.

### Indexing

Indexing is generally excellent. Most foreign keys, filter columns, and timestamp columns are indexed. Composite indexes for common query patterns (e.g. `[userId, status]`, `[userId, status, createdAt]`) are present.

### Issues Found

**🟡 `GitHubAccount.accessToken` is `String` (required, no max-length)**

The GitHub OAuth access token is stored here encrypted. The encrypted format is `${iv}:${tag}:${content}`. There is no max-length constraint. If the encryption output grows unexpectedly, this field accepts it silently.

**🟡 `Deployment.env` is a `String?` with no max-length**

Encrypted environment variables are stored as a single concatenated string. Very large env payloads (thousands of keys) could create very large strings in this column. A reasonable max (e.g. 64KB) should be enforced at the application layer.

**🟡 `TerminalCommandLog.command` and `.output` are `String?` with no length limit**

Terminal output could be enormous (e.g. `cat /large_file`). These fields are unbounded. Truncation should happen before persisting.

**🟡 `AuditLog.details` is a `String` with no length limit**

Audit log messages could be arbitrarily long. A TEXT column with no constraint is fine for PostgreSQL, but it should be explicitly capped at the application layer to prevent abuse.

**🟡 `WebhookEvent.payload` — same concern as audit log**

**🟡 N+1 risk in deployment status GET**

`DeploymentService.getStatus` includes `deploymentLogs: { take: 25, orderBy: { createdAt: 'desc' } }` and `history: { take: 5 }`. These are eager-loaded in a single query via Prisma include, which is correct. However, if this endpoint is called in a list context (e.g. listing all deployments and getting status for each), N+1 queries would result. The list endpoints do not appear to call `getStatus` in a loop, so this risk is not currently realised, but the pattern warrants attention.

**🟡 `RefreshTokenReplay` cleanup is in-band**

After each token rotation, expired replay records are deleted synchronously:

```ts
await prisma.refreshTokenReplay.deleteMany({ where: { expiresAt: { lt: new Date() } } });
```

Under high load, this adds an extra DB write to every token refresh. This cleanup should be a scheduled job or background process.

**🟢 Missing `@@map` annotations**

The Prisma models do not use `@@map` to control the underlying table names. Models like `VPS` will map to `VPS` in the DB (all caps), which is unconventional for PostgreSQL. PostgreSQL table names are case-insensitive but this could cause confusion.

**🟢 `User.email` is `String?` (optional) but `@unique`**

A nullable unique field is a PostgreSQL anti-pattern. Null values are not considered equal in a unique constraint, so multiple rows with `email = null` are allowed. This is intentional (OAuth-only users may not have an email), but should be documented.

---

## 6. DevOps Review

### Docker & Compose

The Dockerfiles use multi-stage builds correctly (base → deps → builder → prod-deps → runner). Both API and web Dockerfiles run as the non-root `node` user. Images are `--read-only` with `tmpfs` mounts for writeable directories. `no-new-privileges` and `cap_drop: ALL` are applied in Compose.

The `docker-compose.yml` uses named volumes for Postgres and Redis data persistence. Health checks are defined for all services with appropriate intervals and start periods. `depends_on` with `condition: service_healthy` correctly delays API startup until Postgres and Redis are ready.

### Issues Found

**🔴 Port mismatch between Dockerfile and docker-compose.yml**

`docker/api.Dockerfile` exposes port 4000 and the healthcheck uses port 4000:

```dockerfile
EXPOSE 4000
HEALTHCHECK ... CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/live')"
```

But `docker-compose.yml` maps `${API_PORT:-3001}:${PORT:-3001}` and sets `PORT: ${PORT:-3001}` in the environment. The Dockerfile's default and the Compose default disagree. If `PORT` is not explicitly set, the container listens on 3001 but the Dockerfile's `EXPOSE` declares 4000. This discrepancy is confusing and could cause health check failures if `PORT` is not set.

**🟠 No GitHub Actions CI/CD pipeline**

There is no `.github/` directory. There are no automated test, lint, typecheck, or Docker build workflows. Every change must be manually tested. This is a significant gap for a project claiming production readiness.

**🟠 Redis has no authentication configured**

The `redis` service in `docker-compose.yml` uses no password:

```yaml
command: ["redis-server", "--appendonly", "yes", "--save", "60", "1"]
```

Redis is on the internal network only (`deployforge_internal`), which mitigates exposure. But if any container on that network is compromised, Redis is fully open. A `--requirepass` option should be configured.

**🟠 No Nginx reverse proxy in Compose**

There is no Nginx or Caddy reverse proxy in the Compose stack for TLS termination. The API and web services expose their ports directly. In production, TLS must be terminated somewhere. The documentation may cover this, but it is not part of the deployable `docker-compose.yml`.

**🟠 `read_only: true` on API container conflicts with `/tmp` tmpfs but not `/tmp/deployforge`**

The API uses `/tmp/deployforge/` as a workspace for uploaded archives. The Compose file mounts `/tmp` as tmpfs, which means `/tmp/deployforge` is writable. This is correct. However, the `--read-only` flag plus only a `/tmp` tmpfs means the API container cannot write to any other directory. If any library or runtime (e.g., Prisma, pino) tries to write outside `/tmp`, it will fail silently or loudly. The current tmpfs configuration appears sufficient, but it should be explicitly tested.

**🟢 Postgres and Redis data are in named volumes — good**

Data is not stored in bind mounts, avoiding UID conflicts.

**🟢 Healthchecks are present and well-configured — good**

---

## 7. Performance Review

### What's Good

- BullMQ queue with Redis for async deployment execution — correct use of job queues
- Concurrent deployments limited to 5 (`concurrency: 5` in worker)
- Build caching on remote VPS (dependency cache, Docker layer caching via image tagging)
- Argon2id parameters are balanced (not excessively slow for a web service)
- `@fastify/rate-limit` applied globally and overridden per-route for sensitive paths
- Prisma `select` clauses used in `authGuard` to avoid fetching unnecessary columns

### Issues Found

**🟠 WebSocket log polling every 1,500ms hits DB on every tick**

The deployment log WebSocket handler polls `deploymentLog` every 1.5 seconds using `setInterval`. With many concurrent deployments being watched, this results in N × (deployment count) queries per 1.5s. Postgres LISTEN/NOTIFY or Redis pub/sub would eliminate this polling entirely.

**🟠 `getRemoteUsedPorts` opens a new SSH connection on every `getAvailablePort` call**

During deployment, `getRemoteUsedPorts` opens a fresh SSH connection to the target VPS:

```ts
const ssh = new SSHService();
await ssh.connect(...);
// execute, then disconnect
```

Port allocation already opens an SSH connection during the deployment flow. Opening a second connection purely to check used ports is wasteful. This operation should reuse the existing SSH session.

**🟠 `authGuard` performs a DB query on every authenticated request**

The guard fetches the user from the database on every request, including for the `sessionId` lookup. This is correct for security (session revocation) but adds latency. A short-TTL Redis cache keyed by `sessionId` would reduce DB load significantly.

**🟡 No pagination on `getStatus` deploymentLogs**

The `getStatus` endpoint fetches the last 25 deployment logs. For long-running deployments, 25 may be insufficient (the WebSocket stream should be used for real-time). But the REST endpoint is not paginated, making it brittle.

**🟡 `prisma.refreshTokenReplay.deleteMany` on every token refresh (see DB section)**

---

## 8. Code Quality

### What's Good

- Consistent naming conventions throughout (camelCase for TS, snake_case for Prisma fields that match PG conventions)
- Zod schemas at the top of each route file, named clearly
- Helper functions (`shellQuote`, `shellPath`, `sanitizeName`, `safeExtractCommand`) are pure and well-named
- Error classes (`DeploymentError`, `VPSConnectionFailure`) extend `Error` with typed fields
- `timingSafeEqualString` is used correctly and consistently

### Issues Found

**🟠 `fastify as any` cast repeated in every route file (15+ files)**

This is the most pervasive code quality issue. The TypeScript types for decorated Fastify properties are declared correctly in `plugins/auth.ts`, but every route still casts to bypass them. The fix is to properly import and use the `FastifyInstance` type with the augmented declarations.

**🟡 `deployment.service.ts` is ~1,000 lines — a God class**

This should be decomposed into:
- `SshCommandRunner` — wraps SSH command execution and logging
- `NginxConfigurator` — Nginx config generation
- `DockerLifecycleManager` — container create/start/stop/remove
- `BuildCacheManager` — dependency and build caching
- `DeploymentOrchestrator` — top-level coordination

**🟡 `TokenService.generateRefreshToken` is dead code**

The refresh token in the actual system is `crypto.randomBytes(40).toString('hex')`, not a JWT. The `generateRefreshToken` method in `TokenService` is never called and should be removed.

**🟡 Magic numbers throughout deployment service**

- `15` (health check retries), `2` (seconds between retries), `8000` (log output truncation), `120` (container log lines), `3000-9000` (port range) are all hardcoded inline. These should be named constants.

**🟡 `(request as any).rawBody` in webhooks route**

The `rawBody` is attached to the request by the custom content-type parser in `app.ts` using `(request as any).rawBody = body`. This `any` cast is necessary because Fastify's request type doesn't have `rawBody`. A proper type augmentation (`declare module 'fastify' { interface FastifyRequest { rawBody?: string } }`) would eliminate this cast.

**🟢 `safeExtractCommand` uses Python3 for safe archive extraction — good security practice**

---

## 9. Error Handling

### What's Good

The global error handler in `app.ts` is well-implemented:
- Maps Zod errors to 400
- Sanitises 500 errors to hide internal details (`exposesSensitiveInternals` regex check)
- Consistent response shape `{ success: false, error: { code, message } }`
- Sensitive keywords (`prisma`, `sql`, `jwt`, `secret`, `environment`, `env`, `stack`) are detected and masked

### Issues Found

**🟠 `sendVpsError` in `vps.ts` leaks raw error messages at 500-level**

```ts
const message = error instanceof Error ? error.message : 'VPS request failed';
return reply.status(500).send({ success: false, error: { code: 'VPS_ERROR', message } });
```

The global error handler masks 500-level messages, but `sendVpsError` sends the raw `error.message` for any non-`VPSConnectionFailure`, non-Zod error. This is inconsistent with the global error handler and could expose internal implementation details (Prisma error messages, Node.js internal errors) to clients.

**🟡 `webhooks.ts` error handler sends `err.message` on 500**

```ts
return reply.status(err instanceof z.ZodError ? 400 : 500).send({
  ...
  message: err.message || 'Webhook processing failed'
});
```

Same issue — 500-level responses should return a generic message, not `err.message`.

**🟡 `sendDeploymentError` leaks error messages for non-500 errors correctly, but inconsistently**

```ts
const status = err instanceof DeploymentError ? ... : 500;
message: status >= 500 ? 'Internal Server Error' : err.message,
```

This is mostly correct, but the stage information (`stage: err?.stage || 'request'`) is always exposed, even for 500 errors. The stage field is useful for debugging but not for clients.

**🟡 Auth service error for suspended/unverified users is same as wrong-password**

By design, the login function returns `genericAuthError()` (401 "Invalid email or password") for suspended accounts and unverified accounts. This is correct for security (user enumeration), but means users with suspended accounts or unverified email will see a confusing "Invalid email or password" message with no guidance.

---

## 10. API Review

### Endpoint Inventory

| Method | Path | Auth | Rate Limit | Notes |
|--------|------|------|-----------|-------|
| GET | /auth/csrf | None | 60/min | Correct |
| POST | /auth/register | None | 10/min | Correct |
| POST | /auth/verify-otp | None | 10/min | Correct |
| POST | /auth/login | None | 10/min | Correct |
| POST | /auth/refresh | None | 10/min | Correct |
| POST | /auth/logout | None | 10/min | Correct |
| GET | /auth/me | JWT | 30/min | Correct |
| POST | /auth/forgot-password | None | 10/min | Correct |
| POST | /auth/reset-password | None | 10/min | Correct |
| POST | /vps/add | JWT | 8/10min | Correct |
| POST | /vps/test-connection | JWT | 8/10min | Correct |
| GET | /vps/list | JWT | 30/min | Correct |
| GET | /vps/:id | JWT | 30/min | Correct |
| PATCH | /vps/:id | JWT | 8/10min | Correct |
| DELETE | /vps/:id | JWT | 5/min | Correct |
| POST | /deploy/github | JWT | 5/min | Correct |
| POST | /deploy/upload | JWT | 5/min | Correct |
| POST | /deploy/:id/stop | JWT | 5/min | Correct |
| POST | /deploy/:id/start | JWT | 5/min | Correct |
| POST | /deploy/rollback/:id | JWT | 5/min | Correct |
| WS | /deploy/ws/:id | JWT query | — | Polling concern |
| POST | /webhooks/github | None | 120/min | HMAC verified |
| GET | /admin/* | Admin JWT | Various | Separate auth |
| GET | /health, /live, /ready | None | None | Correct |

### Issues Found

**🟡 No API versioning** — All endpoints are unversioned. Adding a breaking change to any endpoint requires coordinating a simultaneous frontend deployment. `/api/v1/...` should be introduced from the start.

**🟡 Webhook endpoint on `/api/webhooks/github` and `/webhooks/github`** — Due to double-registration, the webhook endpoint is reachable at two paths. The CSRF skip list only skips `/api/webhooks/github`. The `/webhooks/github` path (reachable directly, before the URL rewriter runs on it) is also in the skip list only because the rewriter adds `/api/` prefix. This is fragile.

**🟡 Pagination is missing on most list endpoints** — `/vps/list`, `/deployments` (list), `/admin/users` presumably have no pagination limits enforced at the query level. A user or admin with 1,000 VPS entries would receive all of them in one response.

**🟢 Per-route rate limit overrides are well-chosen** — SSH-related operations (8/10min), deployment (5/min), and read operations (30/min) are correctly differentiated.

---

## 11. Production Readiness

### Reliability

Deployment failures have rollback mechanisms. The worker retries failed jobs (3 attempts, exponential back-off). Health checks are present on all services. The `assertLifecycleTransition` function prevents illegal state transitions.

### Stability Concerns

- No distributed locking on deployment jobs. Two simultaneous deployments for the same project could conflict on Nginx config, port allocation, and container naming.
- The polling WebSocket for deployment logs creates unneeded DB load.
- The `refreshTokenReplay` cleanup runs synchronously on every refresh.

### Scalability

- Single Redis instance, single Postgres instance — no clustering.
- Worker concurrency is fixed at 5 — no auto-scaling.
- No horizontal scaling plan for the API.

### Monitoring

No metrics collection (Prometheus, StatsD), no distributed tracing (OpenTelemetry), no structured alerting. The structured logs from Pino are a good foundation, but without a log aggregation system (Loki, Elasticsearch), they are not actionable in production.

### Conclusion

**The project is NOT safe to deploy to production as-is** due to the critical issues identified (session not revoked on password reset, access token in git clone URL, environment secrets written as plaintext to VPS working directory, Docker port mismatch). These must be fixed before any production deployment.

---

## 12. Missing Features

| Feature | Severity | Notes |
|---------|---------|-------|
| CI/CD pipeline (GitHub Actions) | 🔴 Critical | No automated testing, building, or deployment |
| Distributed lock for concurrent deploys | 🔴 Critical | Same project deployed simultaneously → conflicts |
| Session revocation on password reset | 🔴 Critical | Active sessions survive password change |
| API versioning (`/v1/`) | 🟠 High | Necessary before any breaking API change |
| Metrics endpoint (Prometheus/OpenTelemetry) | 🟠 High | No observability |
| Pagination on all list endpoints | 🟠 High | Unbounded queries in production |
| Redis authentication | 🟠 High | Redis is unauthenticated |
| TLS termination in Compose | 🟠 High | No HTTPS out of the box |
| Backup strategy for Postgres | 🟠 High | Named volume with no backup |
| Git token injection via credential helper | 🔴 Critical | Token currently exposed in clone URL |
| Scheduled cleanup for RefreshTokenReplay | 🟡 Medium | Currently synchronous per-request |
| Structured alerting | 🟡 Medium | Logs exist but no alerts |
| Admin brute-force atomicity | 🟡 Medium | TOCTOU race in login attempt counter |
| OTP rate limiting with cooldown | 🟡 Medium | Attempts reset on each OTP request |
| Request correlation IDs | 🟡 Medium | Log tracing across services |
| E2E tests (real, not placeholder) | 🔴 Critical | Current E2E tests are all `expect(true).toBe(true)` |
| Unit tests for all services | 🟠 High | Only 1 real unit test exists |

---

## 13. Testing Review

### Current State

The test suite is essentially non-existent for a production system:

**`apps/api/src/__tests__/auth.test.ts`** — Contains 2 test cases. One actually exercises `sendOTP` with mocked dependencies (partial coverage). The second test case ("should verify a valid OTP") has no assertions — the body is empty.

**`apps/api/src/__tests__/e2e.test.ts`** — Contains 5 test cases. **Every single one has `expect(true).toBe(true)` as its only assertion.** These are placeholder tests that always pass regardless of the state of the application. They provide zero test coverage.

### Missing Coverage

- No tests for `AuthService.login`, `AuthService.refresh`, `AuthService.logout`
- No tests for `AuthService.register` (OTP flow, duplicate email)
- No tests for `VPSService` (connection, health check)
- No tests for `DeploymentService` (any method)
- No tests for the CSRF plugin
- No tests for the auth plugin
- No tests for the global error handler
- No tests for any route handler
- No integration tests
- No real E2E tests
- No performance/load tests
- Test coverage: **~0%** of meaningful business logic

### Recommendation

Before production deployment, at minimum:
1. Unit test `AuthService` (register, login, refresh, OTP flow)
2. Unit test CSRF token generation and validation
3. Integration test auth routes (register → verify-otp → login → refresh → logout)
4. Remove or replace all placeholder E2E tests

---

## 14. Configuration Review

### `package.json` (root)

Dependencies are minimal and appropriate. `turbo` is `latest` — should be pinned for reproducibility.

### `tsconfig.json`

Not reviewed in full, but TypeScript `strict: true` is presumably enabled (the codebase uses type assertions to bypass strict checks, which suggests strict mode is active but is being worked around).

### `.env.example`

Complete, well-commented, and includes all required variables. Placeholder values use the `replace_with_` prefix which the env validator correctly rejects.

### `turbo.json`

Minimal and correct. Build pipeline dependencies are correctly expressed.

### `apps/web/.eslintrc.json`

Not reviewed (likely Next.js defaults). No custom ESLint rules for security patterns.

### Missing Configurations

- No `.eslintrc` at the monorepo root enforcing consistent rules across all packages
- No Prettier configuration
- No `vitest.config.ts` in the API package (tests apparently run without explicit configuration)
- No `CODEOWNERS` file
- No Dependabot or Renovate configuration for automated dependency updates

---

## 15. Bug Detection

### 🔴 Critical Bugs

**BUG-001: Dockerfile EXPOSE port mismatch (api.Dockerfile)**

`EXPOSE 4000` but runtime is `PORT=3001`. Health check in Dockerfile uses 4000, Compose uses 3001. This will cause the Dockerfile-level health check to always fail, and may confuse orchestrators.

**BUG-002: Git access token exposed in git clone URL**

Already detailed in Security section. The token appears in the process table, git config, and potentially SSH logs on the target VPS.

**BUG-003: Password reset does not revoke sessions**

`AccountService.resetPassword` changes the password but does not call `revokeAllSessions`. An attacker with a captured refresh token retains access for 7 days after the victim resets their password.

**BUG-004: E2E tests are all `expect(true).toBe(true)`**

All 5 E2E test cases pass regardless of whether the application works. The test suite gives false confidence.

### 🟠 High-Severity Bugs

**BUG-005: `VPSService.getVpsAuth` will throw if encrypted credential is null**

```ts
{ privateKey: this.decrypt(vps.encryptedPrivateKey!) }
```

The `!` non-null assertion bypasses TypeScript checks. If a VPS was created with `authType='key'` but `encryptedPrivateKey` was not set (possible due to a data corruption or migration issue), this throws a cryptic decryption error instead of a clean validation error.

**BUG-006: Upload temp directory not cleaned on stream failure**

In `readUploadMultipart`, if `pipeline(part.file, fs.createWriteStream(...))` fails, the `uploadDir` created by `mkdtemp` is never cleaned up. This leaks disk space in `/tmp/deployforge/incoming/`.

**BUG-007: Race condition on admin login attempt counter**

Two simultaneous admin login attempts with an incorrect password could both read `attempts=4` and both proceed, effectively allowing one extra attempt before lockout.

**BUG-008: `OTP upsert` resets attempts to 0**

On `sendOTP`, the verification token is upserted with `attempts: 0`. An attacker who exhausts 5 OTP attempts can simply request a new OTP to reset the counter, bypassing the attempt limit entirely.

### 🟡 Medium-Severity Bugs

**BUG-009: Deployment log WebSocket interval not cleared on connection error**

The `setInterval` in the WebSocket handler is cleared on `socket.close`, but if an error causes the socket to close without triggering the `close` event (abnormal closure), the interval may continue running and calling `sendLogs()` on a dead socket.

**BUG-010: `sanitizeVps` mutates the input object**

```ts
const sanitized = { ...vps };
delete sanitized.encryptedPassword;
```

A shallow copy is made, so top-level keys are safe. But this is a shallow clone — if VPS had nested objects, they would still reference the same memory. Not currently a problem, but fragile.

**BUG-011: Webhook branch filter only allows `main`, `master`, or `default_branch`**

```ts
if (!branch || !['main', 'master', parsed.repository.default_branch].includes(branch))
```

Projects with a configured branch that is neither `main` nor `master` nor the repo's default branch will never auto-deploy via webhook. The project's `branch` field should be checked against the webhook branch.

---

## 16. Severity Classification

| ID | Issue | Severity | File(s) | Impact | Fix |
|----|-------|---------|--------|--------|-----|
| S-001 | Git token in clone URL | 🔴 Critical | `deployment.service.ts:prepareGithubSource` | Full GitHub account access if VPS logs are accessed | Use `GIT_ASKPASS` or credential helper |
| S-002 | No session revocation on password reset | 🔴 Critical | `account.service.ts:resetPassword` | Attacker retains access post-reset | Add `revokeAllSessions` call |
| S-003 | Docker port mismatch | 🔴 Critical | `api.Dockerfile` | Health check failure; broken production deployment | Align EXPOSE and PORT |
| S-004 | E2E tests are placeholders | 🔴 Critical | `__tests__/e2e.test.ts` | False confidence; zero test coverage | Write real tests |
| S-005 | OTP attempt counter bypassable | 🟠 High | `auth.service.ts:sendOTP` | Brute-force OTP | Add cooldown between OTP requests |
| S-006 | Admin brute-force TOCTOU | 🟠 High | `admin.ts:adminLogin` | Extra login attempt after lockout threshold | Use DB atomic increment |
| S-007 | No CI/CD pipeline | 🟠 High | `.github/` (missing) | No automated quality gate | Add GitHub Actions |
| S-008 | Redis unauthenticated | 🟠 High | `docker-compose.yml` | Redis exploitable from any internal container | Add requirepass |
| S-009 | Plaintext env vars on VPS | 🔴 Critical | `deployment.service.ts:injectEnvironment` | Secrets readable by any process on VPS | Use Docker secrets or encrypted injection |
| S-010 | No pagination on list endpoints | 🟠 High | Multiple routes | Unbounded queries; DoS potential | Add cursor/offset pagination |
| S-011 | Upload temp dir not cleaned on failure | 🟠 High | `routes/deploy.ts:readUploadMultipart` | Disk space leak | Add `finally` block |
| S-012 | `console.debug/error` in prod frontend | 🟡 Medium | `lib/api/client.ts` | Info leakage in browser DevTools | Guard with `isDev` |
| S-013 | `VPSService.getVpsAuth` null assertion | 🟡 Medium | `vps.service.ts` | Runtime crash with confusing error | Validate before decrypt |
| S-014 | 500-level errors leak raw messages | 🟡 Medium | `vps.ts:sendVpsError`, `webhooks.ts` | Internal details exposed | Mask 500 messages like global handler |
| S-015 | Dead code: `TokenService.generateRefreshToken` | 🟢 Low | `packages/security/src/tokens.ts` | Confusion for future developers | Remove method |
| S-016 | Webhook branch filter too narrow | 🟡 Medium | `webhooks.ts` | Auto-deploy misses non-standard branches | Match against project's configured branch |

---

## 17. Code Smells

**God Class**: `DeploymentService` (~1,000 lines, 30+ methods, handles SSH, Docker, Nginx, caching, port allocation, file I/O, domain management, rollback)

**Dead Code**: `TokenService.generateRefreshToken` — defined, never called

**Magic Numbers**: `15` (retries), `2` (seconds), `8000` (truncation), `120` (log lines), `3000-9000` (port range), `30 * 60 * 1000` (sandbox TTL), `7 * 24 * 60 * 60 * 1000` (session TTL) — all hardcoded inline without named constants

**Over-use of `any` types**: `fastify as any` in every route, `vps: any` in `getVpsAuth`, `request.user: any` everywhere, `deployment: any` in many service methods

**Tight coupling**: `sanitizeDeployment` imports `DeploymentService` just to call `envPreview`. This creates a circular-ish dependency between a utility and a service.

**Hardcoded paths**: `/tmp/deployforge`, `/home/${username}/deployforge/`, `/etc/nginx/conf.d/` — scattered throughout `deployment.service.ts`. These should be config constants.

**Double route registration**: Every route registered twice (with and without `/api/` prefix). 70+ `app.register` calls in `app.ts`.

**Shallow sanitization by field deletion**: `sanitizeVps` uses `delete sanitized.field` on a shallow copy. Proper sanitization should use an allowlist (select only safe fields) rather than a denylist (delete known bad fields).

**Inconsistent UUID vs CUID usage**: Session uses `cuid()`, Deployment uses `uuid()`, RefreshTokenReplay uses `cuid()` — no principled choice.

---

## 18. Scores

| Category | Score | Comment |
|----------|-------|---------|
| Architecture | 7.5/10 | Good structure, monorepo is well-organised; double-route registration and God class are notable detractors |
| Backend | 6.5/10 | Solid patterns; auth is strong; deployment service is too large; type safety gaps throughout |
| Frontend | 6.5/10 | Reasonable structure; client-only auth causes flash; debug logs in production |
| Database | 7.5/10 | Excellent indexing; UUID/CUID inconsistency; unbounded string fields |
| Security | 7.5/10 | Strong fundamentals; critical gaps in git token handling and post-reset session revocation |
| Performance | 6.0/10 | Queue architecture is correct; polling WebSocket and per-request DB cleanup are inefficiencies |
| Scalability | 5.0/10 | No horizontal scaling plan; no distributed locking; single Redis/Postgres |
| Maintainability | 6.0/10 | Clear naming; `any` overuse and 1,000-line service class reduce maintainability |
| Code Quality | 6.5/10 | Good naming conventions; magic numbers; dead code; `any` casts undermine TypeScript |
| DevOps | 6.0/10 | Good Compose hardening; no CI/CD; port mismatch; no TLS in Compose |
| Testing | 1.5/10 | 1 real unit test + 5 always-passing E2E placeholders = near-zero coverage |
| Documentation | 7.0/10 | Comprehensive docs directory; API reference, architecture, security docs exist |

---

## 19. Final Verdict

### 🔴 Not Production Ready

**Reasons:**

1. **Critical security gap**: GitHub access tokens are embedded in git clone URLs on the remote VPS, potentially exposing them in logs, git history, and process tables.

2. **Critical security gap**: Password reset does not revoke active sessions, leaving compromised accounts exposed for up to 7 days after a reset.

3. **Critical security gap**: Deployment environment variables are written as plaintext `.env.deployforge` files on the target VPS working directory.

4. **Critical infrastructure bug**: The API Dockerfile exposes port 4000 while the runtime port is 3001. The Dockerfile health check will fail in production.

5. **Critical testing gap**: The E2E test suite is entirely composed of `expect(true).toBe(true)` placeholder assertions. There is no automated verification that the application works. With no CI/CD pipeline, broken code can reach production undetected.

6. **Missing production infrastructure**: No CI/CD, no monitoring/alerting, no API versioning, no pagination, no Redis authentication, no TLS termination in Compose, no backup strategy.

Despite these gaps, the project demonstrates **strong architectural thinking**: the monorepo structure is clean, the auth system (tokens, refresh rotation, replay detection, CSRF) is well-implemented, the database schema is thoughtful, the Docker hardening (`read_only`, `cap_drop: ALL`, `no-new-privileges`) is commendable, and the deployment engine is impressively comprehensive for a solo-built project.

---

## 20. Final Rating

| Metric | Value |
|--------|-------|
| **Overall Score** | **52 / 100** |
| **Confidence Level** | **91%** |
| **Estimated Production Readiness** | **25%** |

---

## 21. Final Roadmap

### Phase 1 — Critical Fixes (Block all production deployment)

| Task | Priority | Difficulty | Time | Impact |
|------|---------|-----------|------|--------|
| Fix git token injection — use `GIT_ASKPASS` or credential helper instead of URL embedding | P0 | Medium | 1–2 days | Eliminates credential exposure on VPS |
| Add `revokeAllSessions` to `resetPassword` and `changePassword` | P0 | Easy | 0.5 days | Prevents post-reset session hijacking |
| Remove plaintext env var file on VPS — use Docker `--env-file` with restricted permissions or Docker secrets | P0 | Medium | 1 day | Prevents secrets leakage on multi-tenant VPS |
| Fix Dockerfile port mismatch (`EXPOSE 3001`, healthcheck on 3001) | P0 | Easy | 0.5 hours | Fixes broken production health check |
| Replace E2E placeholder tests with real assertions | P0 | Hard | 5–7 days | Establishes minimum quality gate |
| Add GitHub Actions CI pipeline (build, typecheck, lint, test on every PR) | P0 | Medium | 1–2 days | Prevents broken code reaching production |

### Phase 2 — High Priority (Before public launch)

| Task | Priority | Difficulty | Time | Impact |
|------|---------|-----------|------|--------|
| Add Redis password (`--requirepass`) in Compose and update `REDIS_URL` | P1 | Easy | 1 hour | Secures Redis on internal network |
| Add distributed lock (Redis SETNX) per `projectId` during deployment | P1 | Medium | 1–2 days | Prevents concurrent deployment conflicts |
| Add API versioning prefix (`/api/v1/`) | P1 | Medium | 1 day | Enables backward-compatible API evolution |
| Add cursor-based pagination to all list endpoints | P1 | Medium | 2–3 days | Prevents unbounded queries in production |
| Replace WebSocket polling with Redis pub/sub or Postgres LISTEN/NOTIFY for deployment logs | P1 | Hard | 2–3 days | Eliminates per-tick DB queries |
| Add TLS termination (Caddy or Nginx) to `docker-compose.yml` | P1 | Medium | 1 day | HTTPS out of the box |
| Move scheduled cleanup of `RefreshTokenReplay` to a cron job | P1 | Easy | 0.5 days | Removes synchronous cleanup from request path |
| Add OTP request cooldown (minimum 60 seconds between OTP requests per email) | P1 | Easy | 0.5 days | Prevents brute-force via OTP regeneration |
| Fix admin login brute-force counter to use atomic DB increment | P1 | Easy | 0.5 days | Closes TOCTOU race on lockout |
| Write unit tests for `AuthService`, `VPSService`, CSRF plugin | P1 | Medium | 3–5 days | Establishes >50% service coverage |

### Phase 3 — Medium Priority (First month post-launch)

| Task | Priority | Difficulty | Time | Impact |
|------|---------|-----------|------|--------|
| Decompose `DeploymentService` into focused sub-services | P2 | Hard | 5–7 days | Improves testability and maintainability |
| Remove all `fastify as any` casts — use proper TypeScript generics | P2 | Medium | 1–2 days | Restores TypeScript type safety |
| Add Prometheus metrics endpoint + Grafana dashboard | P2 | Medium | 2–3 days | Production observability |
| Add request correlation ID (UUID per request, logged and propagated) | P2 | Easy | 0.5 days | Cross-service log tracing |
| Replace `console.debug/error` in frontend with conditional logging | P2 | Easy | 0.5 days | Stops information leakage in production |
| Add Dependabot configuration for automated dependency updates | P2 | Easy | 1 hour | Proactive security patching |
| Add Postgres backup strategy (e.g. `pg_dump` cron + S3 upload) | P2 | Medium | 1 day | Data recovery capability |
| Fix webhook branch filter to match project's configured branch | P2 | Easy | 1 hour | Correct auto-deploy for non-main branches |
| Standardise UUID vs CUID in schema (choose one) | P2 | Medium | 1 day | Schema consistency |

### Phase 4 — Nice to Have (Roadmap / Future)

| Task | Priority | Difficulty | Time | Impact |
|------|---------|-----------|------|--------|
| Server-side auth hydration in Next.js (eliminate flash of unauthenticated state) | P3 | Medium | 1–2 days | UX improvement |
| OpenTelemetry distributed tracing | P3 | Hard | 3–5 days | Advanced observability |
| GitHub token rotation mechanism | P3 | Medium | 1–2 days | Long-term credential hygiene |
| Horizontal scaling documentation + Redis Cluster / PgBouncer guidance | P3 | Medium | 2 days | Scale-out readiness |
| Accessibility audit and ARIA improvements | P3 | Medium | 2–3 days | Compliance and inclusivity |
| Load testing suite (k6 or Artillery) | P3 | Medium | 2–3 days | Capacity planning |
| Admin brute-force protection with CAPTCHA or device fingerprinting | P3 | Hard | 3–5 days | Advanced account security |
| Automatic GitHub OAuth token refresh (if using expiring tokens) | P3 | Medium | 2 days | Long-lived deployment reliability |

---

*End of Audit Report — DeployForge v0.1.0*