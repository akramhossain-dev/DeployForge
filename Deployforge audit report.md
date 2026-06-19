# DeployForge — Complete Codebase Audit & Production Readiness Review

**Repository:** https://github.com/akramhossain-dev/DeployForge.git  
**Audit Date:** June 16, 2026  
**Auditor Roles:** Principal Software Architect · Principal Security Engineer · Senior DevOps Engineer · Senior QA Engineer · Senior Backend Architect · Senior Frontend Architect · Database Architect · Production Readiness Auditor

---

## EXECUTIVE SUMMARY

DeployForge is a self-hosted deployment platform built on a Fastify API, Next.js 14 frontend, PostgreSQL, Redis, BullMQ workers, and SSH-based VPS control. The codebase is architecturally coherent and demonstrates genuinely good patterns in several areas: refresh-token replay detection, ownership-verified IDOR guards, AES-256-GCM encryption of credentials, Argon2id password hashing, and a well-structured Zod validation layer.

However, the project is **not production-ready** in its current state. Three issues alone are release-blocking: CORS is hardcoded to `localhost` in production mode (breaking every real user's cross-origin request), a critical foreign-key violation crashes the database on every failed admin login attempt (storing the literal string `"SYSTEM"` into a UUID-typed relation field), and the frontend stores access tokens in `localStorage`, directly contradicting the HttpOnly cookie strategy used by the API. Additionally, four declared workspace packages (`auth`, `deployment`, `github`, `monitoring`) contain only a `.gitignore` — zero source code — meaning any build that resolves those workspace paths will fail. The E2E test suite consists entirely of `expect(true).toBe(true)` assertions and provides no real coverage.

**Final Release Decision: NOT READY**

---

## WHAT IS IMPLEMENTED WELL

1. **Refresh-token rotation with replay detection** (`auth.service.ts` → `AuthService.refresh`): Old token is hashed and stored in Redis with a 1-hour TTL; a replay triggers immediate revocation of all sessions for the affected user. This is textbook implementation.

2. **Argon2id password hashing** (`packages/security/src/passwords.ts`): `memoryCost: 65536`, `timeCost: 3`, `parallelism: 4` — strong production-grade settings.

3. **AES-256-GCM encryption for credentials**: VPS passwords, SSH private keys, GitHub access tokens, and deployment environment variables are all encrypted at rest with a 64-hex-byte key. Random 12-byte IVs per operation. Auth-tag stored alongside ciphertext. Correct use of authenticated encryption.

4. **Ownership checks via `verifyDeploymentOwnership` / `verifyVpsOwnership` / `verifyDomainOwnership`** (`apps/api/src/utils/authz.ts`): Every sensitive resource route explicitly verifies that the resource belongs to the requesting user, and cross-ownership attempts are audit-logged.

5. **Zod validation on all routes**: Every handler parses its request body/params/query through a typed Zod schema before use, with structured error responses.

6. **GitHub webhook signature verification** (timing-safe `timingSafeEqual`) plus replay protection via `WebhookEvent.id` unique constraint on the GitHub delivery ID.

7. **Admin system separation**: Admin users live in a completely separate `AdminUser` / `AdminSession` table, use a different JWT secret (`ADMIN_JWT_SECRET`), and their sessions store a hashed token for binding. Admin brute-force lockout is implemented via Redis.

8. **Structured environment validation on startup** (`apps/api/src/config/env.ts`): The entire `.env` is parsed and validated with Zod at boot; the process exits with a descriptive error list before accepting any requests.

9. **Safe archive extraction** (`safeExtractCommand` in `deployment.service.ts`): Python-based extraction with path traversal protection, max-depth (12), and max-entry (20,000) limits. Zip-slip attacks are blocked.

10. **Comprehensive audit logging**: Every sensitive action (login, logout, token refresh, password change, session revocation, unauthorized access attempts) is written to `AuditLog` with IP, browser, OS, and device parsed from the user agent.

---

## VERIFIED FIXES (Items Already Addressed in Code)

- Refresh token is stored as SHA-256 hash in the DB, never as plaintext.
- OTP is stored as SHA-256 hash; never returned in API responses.
- `passwordHash` is stripped from `request.user` in `authGuard` before the user object is set.
- `sanitizeVps` and `sanitizeDeployment` delete all credential fields before returning to the client.
- GitHub OAuth state parameter is signed with a JWT and validated before code exchange.
- The `env` field (encrypted deployment environment variables) is stripped from all API responses; only key names are returned as `envPreview`.
- Upload file names are sanitized (`/[^A-Za-z0-9._-]/g`) and strictly checked for extension before writing.
- Terminal WebSocket ownership check: `prisma.vPS.findUnique` then `vps.userId !== userId` comparison.

---

## CRITICAL ISSUES

### CRIT-1: CORS Locks Out All Production Users
- **Severity:** CRITICAL — Release Blocker
- **File:** `apps/api/src/app.ts` line 42
- **Root Cause:**
  ```typescript
  origin: config.app.env === 'development' ? true : /localhost/,
  ```
  In any non-`development` environment the CORS origin is a regex that only matches `localhost`. Any browser request from a real production domain (e.g., `https://app.deployforge.io`) will be rejected with a CORS preflight failure. Every authenticated request the frontend makes will fail.
- **Impact:** The entire application is non-functional for any real deployment. Every API call from the production frontend will be blocked by the browser.
- **Recommended Fix:**
  ```typescript
  const allowedOrigins = config.app.env === 'development'
    ? true
    : [config.app.appUrl, config.app.apiUrl].filter(Boolean);
  await app.register(cors, { origin: allowedOrigins, credentials: true });
  ```

---

### CRIT-2: Foreign Key Violation Crashes DB on Failed Admin Login
- **Severity:** CRITICAL — Runtime Crash
- **File:** `apps/api/src/routes/admin.ts` lines 141, 163, 179
- **Root Cause:**
  ```typescript
  adminId: adminId || 'SYSTEM',
  ```
  When an admin login attempt fails for an unknown email, `adminId` is `null` and the code falls back to the string `'SYSTEM'`. `AdminActivity.adminId` is a foreign key pointing to `AdminUser.id` (UUID), and `'SYSTEM'` is not a valid UUID. Prisma will throw a foreign-key constraint violation (`P2003`), which is not caught, resulting in a 500 error for every lockout event involving an unknown email.
- **Impact:** Failed login attempts for non-existent admin accounts crash with an unhandled database error. This also means brute-force lockout events are never logged for unknown emails — defeating the lockout audit trail.
- **Recommended Fix:** Add a nullable `adminId` column to `AdminActivity`, or use a `SYSTEM` sentinel admin account, or skip activity logging when no valid admin is found:
  ```typescript
  if (adminId) {
    await prisma.adminActivity.create({ data: { adminId, action: 'ADMIN_LOGIN_FAILURE', ... } });
  }
  ```

---

### CRIT-3: Access Token Stored in `localStorage` (Contradicts HttpOnly Cookie Design)
- **Severity:** CRITICAL — Security Architecture Flaw
- **File:** `apps/web/lib/store/useAuthStore.ts` lines 51–69, 85
- **Root Cause:** The API sets access tokens as `HttpOnly` cookies (correct), but `setSession` also explicitly writes the same token to `localStorage.setItem('df_token', accessToken)`. The API client in `lib/api/client.ts` reads the token from the Zustand store (which persists to `localStorage` via `zustand/middleware/persist`). This means:
  1. Any XSS script can steal the access token from `localStorage`.
  2. The cookie is redundant and may cause confusion about which credential the client actually uses.
  3. The Zustand persist middleware also writes `refreshToken` to `localStorage` — meaning a refresh token, which grants 7-day session extension, is exposed to XSS.
- **Impact:** XSS vulnerability anywhere on the frontend (including third-party scripts) can steal both the access token and the refresh token.
- **Recommended Fix:** Remove all `localStorage` usage for tokens. Rely exclusively on HttpOnly cookies. Update `api/client.ts` to send `credentials: 'include'` and remove the `Authorization: Bearer` header injection from store state.

---

### CRIT-4: Four Workspace Packages Are Completely Empty
- **Severity:** CRITICAL — Build Failure
- **Files:**
  - `packages/auth/` — contains only `.gitignore`
  - `packages/deployment/` — contains only `.gitignore`
  - `packages/github/` — contains only `.gitignore`
  - `packages/monitoring/` — contains only `.gitignore`
- **Root Cause:** These packages are declared in `pnpm-workspace.yaml` but have no `package.json`, no source files, and no exports. They are referenced in `docs/REPOSITORY_STRUCTURE.md` as active packages.
- **Impact:** Any build pipeline or CI step that attempts to resolve these workspace packages will fail. The repository structure documentation misleads contributors.
- **Recommended Fix:** Either implement the packages (moving relevant code from `apps/api/src/services/` into them) or remove their directories and workspace declarations.

---

## HIGH ISSUES

### HIGH-1: Account Enumeration via `forgotPassword`
- **Severity:** HIGH
- **File:** `apps/api/src/services/account.service.ts` line 150
- **Root Cause:**
  ```typescript
  if (!user) {
    throw publicError('User not found', 404);
  }
  ```
  The forgot-password endpoint returns a `404` with "User not found" when the email does not exist. An attacker can enumerate every registered email address by sending password reset requests and observing whether they get a 200 or 404.
- **Impact:** User privacy breach; enables targeted phishing.
- **Recommended Fix:** Always return HTTP 200 with a generic message regardless of whether the account exists:
  ```typescript
  if (!user) return; // silently succeed
  ```
  The route already returns `{ message: 'If the account exists, a reset link has been sent.' }` — the service must match that contract.

---

### HIGH-2: Duplicate Route Registrations (Route Conflict)
- **Severity:** HIGH — Operational / Logic Error
- **Files:** `apps/api/src/routes/deploy.ts` and `apps/api/src/routes/deployments.ts`
- **Root Cause:** Both route files are registered at different prefixes (`/api/deploy` and `/api/deployments`), but they expose the same functionality with different URL shapes:
  - `POST /api/deploy/:id/stop` ↔ `POST /api/deployments/:id/stop`
  - `POST /api/deploy/:id/start` ↔ `POST /api/deployments/:id/start`
  - `POST /api/deploy/rollback/:id` ↔ `POST /api/deployments/:id/rollback`
  - `GET /api/deploy/list` ↔ `GET /api/deployments/`
  The `/api/deploy` routes also duplicate `/api/deployments` with different ownership check patterns in some cases.
- **Impact:** Frontend and API clients are confused about the canonical URL. Any inconsistency in business logic between the two copies creates divergent behavior. Maintenance burden doubles.
- **Recommended Fix:** Consolidate into a single route set under `/api/deployments`. Remove `/api/deploy` or make it redirect.

---

### HIGH-3: No Next.js `middleware.ts` — Frontend Route Protection Is Client-Side Only
- **Severity:** HIGH
- **File:** `apps/web/` — file does not exist
- **Root Cause:** The dashboard and all authenticated app routes are guarded only by a client-side `useEffect` in `(app)/layout.tsx`:
  ```tsx
  React.useEffect(() => {
    if (!hasHydrated) return;
    if (!token) router.replace('/');
  }, [hasHydrated, router, token]);
  ```
  There is no server-side `middleware.ts` to enforce authentication before rendering. Next.js renders the full page on the server (or sends the JS bundle) before the client-side guard fires.
- **Impact:** The dashboard HTML and data are briefly rendered before redirect on unauthorized access. Sensitive page content (deployment names, VPS IPs from SSR data fetches) could be exposed before the redirect fires.
- **Recommended Fix:** Create `apps/web/middleware.ts` to check for the `accessToken` cookie and redirect unauthenticated users server-side before any page renders.

---

### HIGH-4: Redis Exposed on Public Port in Docker Compose
- **Severity:** HIGH
- **File:** `docker-compose.yml` lines 17–18
- **Root Cause:**
  ```yaml
  ports:
    - "6379:6379"
  ```
  Redis is bound to all host interfaces with no authentication configured. Any process on the host (or network if the host is internet-accessible) can connect to Redis.
- **Impact:** Redis holds active session replay-protection data, admin lockout state, and refresh-token rotation cache. An attacker who can reach Redis can clear lockout counters, forge cache entries, or dump cached data.
- **Recommended Fix:** Remove the ports mapping for Redis in production. Use Docker's internal network only. If external access is needed, add `requirepass` to the Redis config and update `REDIS_URL`.

---

### HIGH-5: Docker Containers Run as Root
- **Severity:** HIGH
- **Files:** `docker/api.Dockerfile`, `docker/web.Dockerfile`
- **Root Cause:** Neither Dockerfile creates a non-root user. The application process runs as `root` inside the container.
- **Impact:** A container escape or RCE vulnerability runs with full root privileges.
- **Recommended Fix:**
  ```dockerfile
  RUN addgroup -S deployforge && adduser -S deployforge -G deployforge
  USER deployforge
  ```

---

### HIGH-6: Admin Logs Page Linked in Sidebar But Does Not Exist
- **Severity:** HIGH — Runtime 404
- **File:** `apps/web/components/admin/AdminShell.tsx` line 21
- **Root Cause:**
  ```typescript
  { href: '/admin/logs', label: 'Logs', icon: ListFilter },
  ```
  The admin sidebar links to `/admin/logs`, but there is no `apps/web/app/(admin)/admin/logs/page.tsx`. This route returns a Next.js 404 in production.
- **Impact:** Admins cannot access the logs view; the link is dead.
- **Recommended Fix:** Create the page or remove the nav item.

---

### HIGH-7: Production CORS Also Blocks Cookie-Credentialed Requests from Real Domains
*(See CRIT-1 for full details — noted here for emphasis on the credentials impact.)*

---

## MEDIUM ISSUES

### MED-1: `AdminActivity` Schema References Both `timestamp` and `createdAt` (Redundancy)
- **Severity:** MEDIUM
- **File:** `prisma/schema.prisma` — `AdminActivity` model
- **Root Cause:** The model has both `timestamp DateTime @default(now())` and `createdAt DateTime @default(now())`. Both auto-populate with `now()`. The admin logs query uses `timestamp` for ordering but indexes both, creating duplicate data and index overhead.
- **Recommended Fix:** Remove `timestamp`; use `createdAt` consistently.

---

### MED-2: `VPSAuthType` Enum Has Redundant `ssh_key` Value
- **Severity:** MEDIUM
- **File:** `prisma/schema.prisma`, `apps/api/src/routes/vps.ts`
- **Root Cause:** The enum is `{ key, password, ssh_key }`. In `vps.ts`, `ssh_key` is immediately transformed to `key`:
  ```typescript
  authType: z.enum(['password', 'key', 'ssh_key']).transform((value) => (value === 'ssh_key' ? 'key' : value)),
  ```
  The `ssh_key` value should never reach the database, but it remains in the enum definition, causing confusion.
- **Recommended Fix:** Remove `ssh_key` from the `VPSAuthType` enum; handle the alias only at the API layer.

---

### MED-3: `User.provider` (String) Duplicates `User.authProvider` (Enum)
- **Severity:** MEDIUM
- **File:** `prisma/schema.prisma` — `User` model lines 146–147
- **Root Cause:** The User model has both `provider String @default("email")` and `authProvider AuthProvider @default(local)`. These carry the same semantic information in different types. Code must be kept in sync across both fields.
- **Recommended Fix:** Remove `provider`; use `authProvider` exclusively.

---

### MED-4: `packages/security/src/tokens.ts` Exports Unused `generateRefreshToken`
- **Severity:** MEDIUM
- **File:** `packages/security/src/tokens.ts`
- **Root Cause:** `TokenService.generateRefreshToken` is defined and exported but never called anywhere in the codebase. Refresh tokens are generated with `crypto.randomBytes(40).toString('hex')` directly in `auth.service.ts`. The JWT-based refresh token method is dead code that creates confusion about which approach is authoritative.
- **Recommended Fix:** Remove `generateRefreshToken` from `TokenService`.

---

### MED-5: Admin Date Filtering Allows Unsanitized String → `new Date()`
- **Severity:** MEDIUM
- **File:** `apps/api/src/routes/admin.ts` line 502
- **Root Cause:**
  ```typescript
  const createdAt = {
    ...(query.from ? { gte: new Date(query.from) } : {}),
    ...(query.to ? { lte: new Date(query.to) } : {}),
  };
  ```
  The `from` and `to` query parameters are parsed with Zod as optional strings but not validated as actual dates before being passed to `new Date()`. An invalid string like `"invalid"` produces `Invalid Date`, which Prisma may silently ignore or throw on.
- **Recommended Fix:** Use `z.string().datetime()` or `z.coerce.date()` for these query parameters.

---

### MED-6: `console.info` / `console.error` Used in Production Code Instead of Structured Logger
- **Severity:** MEDIUM
- **Files:** `apps/api/src/services/github.service.ts`, `apps/api/src/services/vps.service.ts`, `apps/api/src/services/deployment.service.ts`
- **Root Cause:** Several services use raw `console.info` / `console.error` instead of the Fastify/Pino logger that the app configures. These bypass log level filtering and structured JSON output.
- **Recommended Fix:** Inject or import the Fastify logger. Use `fastify.log.info(...)` consistently.

---

### MED-7: WebSocket Log Polling Is Inefficient (1.5s Interval with DB Query)
- **Severity:** MEDIUM
- **Files:** `apps/api/src/routes/deploy.ts` line ~230, `apps/api/src/routes/ws.ts`
- **Root Cause:** Log streaming is implemented via `setInterval` polling the database every 1,500ms per active WebSocket connection. With N concurrent deployments, this means N × 1 DB query per 1.5s. Under moderate load this degrades database performance significantly.
- **Recommended Fix:** Use a Redis pub/sub channel or a BullMQ event emitter to push log events to subscribers. Replace polling with push delivery.

---

### MED-8: Sandbox Cleanup Is Not Time-Bounded or Guaranteed
- **Severity:** MEDIUM
- **File:** `apps/api/src/workers/deployment.worker.ts`
- **Root Cause:** The `sandbox-cleanup` job exists in the worker but there is no code that schedules it. Sandbox deployments are `mode: 'sandbox'` but there is no TTL job queued after the sandbox run completes. Sandbox containers and their VPS resources persist indefinitely unless manually deleted.
- **Recommended Fix:** After a sandbox deployment completes, enqueue a `sandbox-cleanup` BullMQ job with a delay (e.g., 1 hour).

---

### MED-9: No `next.config.js` — Missing Security Headers for the Frontend
- **Severity:** MEDIUM
- **File:** `apps/web/` — file does not exist
- **Root Cause:** There is no `next.config.js` in the web app. This means no Content Security Policy, no `X-Frame-Options`, no `X-Content-Type-Options`, and no `Referrer-Policy` headers are set on frontend responses.
- **Recommended Fix:** Create `apps/web/next.config.js` with `headers()` exporting security headers.

---

### MED-10: `api.Dockerfile` Copies `node_modules` from Builder — Not a Clean Production Image
- **Severity:** MEDIUM
- **File:** `docker/api.Dockerfile`
- **Root Cause:**
  ```dockerfile
  COPY --from=builder /app/node_modules ./node_modules
  ```
  This copies the full monorepo `node_modules` (including all dev dependencies) into the production image. The image will be unnecessarily large and include devDependencies.
- **Recommended Fix:** Run `pnpm install --prod` or use `pnpm deploy` for a clean production install in the runner stage.

---

## LOW ISSUES

### LOW-1: `packages/database/src/index.js` Duplicates `index.ts` (Committed Build Artifact)
- **File:** `packages/database/src/index.js`, `packages/security/src/encryption.js`, `packages/security/src/index.js`, `packages/security/src/passwords.js`, `packages/security/src/tokens.js`, `packages/vps/src/index.js`, `packages/vps/src/ssh.js`, `packages/mail/src/index.js`
- **Root Cause:** Compiled `.js` files have been committed alongside their TypeScript source files. These are build artifacts that should be in `.gitignore`.
- **Recommended Fix:** Add `*.js` or `dist/` to the package-level `.gitignore`. Ensure these files are built, not committed.

---

### LOW-2: `VerificationToken` Model Uses `email` as the Unique Key (Not `userId`)
- **File:** `prisma/schema.prisma` — `VerificationToken` model
- **Root Cause:** The OTP verification token is keyed by `email` string, not a foreign key to `User`. If a user changes their email mid-flow, orphan tokens may accumulate.
- **Recommended Fix:** Add a `userId` foreign key to `VerificationToken`.

---

### LOW-3: Timing of OTP Expiry Check vs. Attempts Check (TOCTOU)
- **File:** `apps/api/src/services/auth.service.ts` — `verifyOTP`
- **Root Cause:** The code checks expiry first, then attempts:
  ```typescript
  if (new Date() > record.expiresAt) throw publicError('OTP expired...', 400);
  if (record.attempts >= 5) throw publicError('Too many attempts...', 429);
  ```
  If an OTP is expired AND attempts are exhausted, the user receives "OTP expired" rather than "Too many attempts." This is a minor UX inconsistency, not exploitable.

---

### LOW-4: `useAuthStore` Zustand Persist Stores Sensitive Data in `localStorage` Under a Known Key
- **File:** `apps/web/lib/store/useAuthStore.ts`
- **Root Cause:** The persist middleware uses the storage key `df-auth-storage`. Any browser extension or XSS script that knows this key name can read the entire auth state (user object, token, refreshToken) from `localStorage`.
- **Recommended Fix:** Covered by CRIT-3. Eliminating `localStorage` usage resolves this entirely.

---

### LOW-5: `docker-compose.yml` Uses Weak Default Postgres Credentials
- **File:** `docker-compose.yml`
- **Root Cause:** Default fallback values `postgres`/`postgres`/`deployforge` are set for database credentials.
- **Recommended Fix:** Remove fallback defaults; require explicit environment variables.

---

### LOW-6: Admin `GET /settings` Leaks Internal Configuration Metadata
- **File:** `apps/api/src/routes/admin.ts`
- **Root Cause:** The `/api/admin/settings` endpoint returns internal config details including SMTP host, port, GitHub callback URL, Google OAuth status, Redis configuration status, and `appUrl`. While behind admin auth, it exposes operational details unnecessarily.
- **Recommended Fix:** Limit to boolean flags (`smtpConfigured`, `githubConfigured`) rather than actual hostnames and URLs.

---

## CODE QUALITY ISSUES

1. **Dead code — `generateRefreshToken` in `TokenService`:** Never used; remove it.
2. **`parseCookies` implemented twice:** Both `apps/api/src/routes/auth.ts` and `apps/api/src/plugins/auth.ts` contain identical `parseCookies` functions. Extract to a shared utility.
3. **`deleteDeploymentCascade`, `deleteVpsCascade`, `deleteUserCascade` in `admin.ts`:** These large async cascade functions belong in a service layer, not in the route file.
4. **`deployment.service.ts` is 1,806 lines:** This is a God class. The file handles GitHub cloning, file upload, Docker builds, Nginx static hosting, cache management, asset rewriting, sandbox analysis, and more. It needs to be split into focused services.
5. **Inconsistent error handling patterns:** Some routes use `try/catch` with structured `sendDeploymentError`, others throw with `expose: true`, others return structured error objects directly. Standardize.
6. **`console.info` / `console.error` in services:** Mix of structured Pino logging and raw console calls.
7. **`maskDeployment` and `sanitizeDeployment` overlap:** `deployments.ts` defines `maskDeployment` which wraps `sanitizeDeployment` but also adds URL-generation logic. This should be a single well-named function.

---

## SECURITY ISSUES

| ID | Issue | Severity |
|----|-------|----------|
| SEC-1 | CORS allows only `localhost` in production | CRITICAL |
| SEC-2 | Access & refresh tokens stored in `localStorage` (XSS-accessible) | CRITICAL |
| SEC-3 | Foreign-key crash on admin lockout for unknown email | CRITICAL |
| SEC-4 | Account enumeration via forgot-password 404 response | HIGH |
| SEC-5 | Redis exposed on host port 6379 with no authentication | HIGH |
| SEC-6 | Docker containers run as root | HIGH |
| SEC-7 | No Next.js `middleware.ts` — no server-side auth guard | HIGH |
| SEC-8 | No `Content-Security-Policy` header on frontend | MEDIUM |
| SEC-9 | Admin date filters use unsanitized strings via `new Date()` | MEDIUM |
| SEC-10 | `MASTER_KEY` / `ENCRYPTION_KEY` must match — confusing constraint with no migration path | LOW |

**Items confirmed NOT vulnerable (do not re-report):**
- Token hashing: refresh tokens stored as SHA-256 — correct.
- OTP hashing: OTPs stored as SHA-256 — correct.
- Password hashing: Argon2id — correct.
- Credential encryption: AES-256-GCM — correct.
- Webhook HMAC: timing-safe comparison — correct.
- IDOR: all resource routes verify ownership — correct.
- Helmet registered — XSS/MIME-sniff/framing headers set on the API.

---

## DATABASE ISSUES

1. **`AdminActivity.adminId` is a non-nullable foreign key but code stores `'SYSTEM'` — FK violation.** (See CRIT-2)
2. **`AdminActivity` has both `timestamp` and `createdAt` — redundant columns.**
3. **`VPSAuthType` enum includes `ssh_key` which is an alias for `key` — never reaches the DB.**
4. **`User` model has both `provider` (String) and `authProvider` (Enum) — duplicate fields.**
5. **`VerificationToken` keyed by `email` string, not FK to `User.id` — orphan risk on email change.**
6. **`DeploymentHistory.env` stores the same encrypted env as `Deployment.env` — potential data duplication.**
7. **Missing database health-check in `docker-compose.yml`** — API container starts before Postgres is ready; `depends_on` alone does not wait for Postgres to accept connections.

---

## FRONTEND ISSUES

1. **`localStorage` token storage — access and refresh tokens exposed to XSS.** (See CRIT-3)
2. **No `middleware.ts` — server-side auth guard missing.** (See HIGH-3)
3. **Admin `/logs` page linked in sidebar but does not exist.** (See HIGH-6)
4. **No `next.config.js` — no CSP or security headers.** (See MED-9)
5. **`console.debug` logging in `api/client.ts` in production** — request paths, auth status, and error messages are logged to the browser console; these should be gated to `process.env.NODE_ENV !== 'production'`.
6. **`api/client.ts` does not send `credentials: 'include'`** — since the API sets cookies, the fetch calls need `credentials: 'include'` to send them cross-origin. Currently only the `Authorization: Bearer` header is set (from `localStorage`), meaning the `HttpOnly` cookies are never sent.
7. **Duplicate dashboard routes:** Both `(app)/dashboard/` and `(app)/deployments/` exist with what appear to be overlapping pages for deployments.
8. **No loading state for WebSocket log streaming** — the UI should show a connecting/loading indicator while WebSocket establishes.

---

## BACKEND ISSUES

1. **CORS production misconfiguration.** (See CRIT-1)
2. **`AdminActivity` FK crash.** (See CRIT-2)
3. **Duplicate route prefixes** (`/api/deploy` vs `/api/deployments`). (See HIGH-2)
4. **Sandbox cleanup job is never scheduled.** (See MED-8)
5. **WebSocket log polling at 1.5s DB interval.** (See MED-7)
6. **`deployment.service.ts` God class at 1,806 lines.**
7. **Admin logs date filter accepts raw string to `new Date()`.** (See MED-5)
8. **`console.*` in services bypasses Pino logger.**

---

## DEPLOYMENT ENGINE ISSUES

1. **`safeExtractCommand`** uses Python heredoc via SSH — correct approach; no bypass found.
2. **`shellQuote` / `shellPath` functions** — all dynamic values passed to SSH commands go through these; no injection found in the critical paths.
3. **User-supplied `buildCommand` and `startCommand`** are auto-detected by the framework detection logic, not user-supplied — not injectable.
4. **Environment variable keys** are validated against `/^[A-Za-z_][A-Za-z0-9_]*$/` before use — correct.
5. **The `asset-rewrite` Python script** is dynamically injected into a heredoc — `shellQuote` is applied to user-controlled paths before interpolation — no injection found.
6. **Rollback `docker run` command** uses `shellQuote(history.imageTag)` and `shellQuote(containerName)` — imageTag is stored in DB (not user input at rollback time) — acceptable.
7. **Sandbox cleanup is not time-bounded.** (See MED-8)
8. **No memory/CPU limits on `docker run`** — containers can monopolize host resources. `--memory` and `--cpus` flags should be added.

---

## TESTING ISSUES

1. **E2E test file (`e2e.test.ts`) contains 5 tests, all `expect(true).toBe(true)`** — zero actual assertions. These tests pass trivially and provide no coverage.
2. **Only 2 real auth unit tests** exist in `auth.test.ts`. One of them (`verifyOTP`) has no body — just a comment.
3. **The `MailService` mock in `auth.test.ts` is incorrect** — `MailService` is a class with instance methods, but the mock targets it as an object with static methods. The test will fail or mock ineffectively in strict mode.
4. **No tests for:** authorization (IDOR), VPS operations, deployment lifecycle, rollback, webhook processing, sandbox analysis, session management, GitHub OAuth, admin routes, domain/SSL attachment.
5. **No API-level integration tests** — there is no test that boots the Fastify app and exercises routes end-to-end.
6. **`vitest` is listed as a devDependency nowhere in `apps/api/package.json`** — test runner is not declared; `pnpm test` will likely fail.

---

## DOCUMENTATION ISSUES

1. **`docs/BACKUP_SYSTEM.md` honestly documents the feature as "NOT implemented"** — this is good transparency, but the public `README.md` and features page should reflect this clearly.
2. **`docs/REPOSITORY_STRUCTURE.md` lists `packages/auth`, `packages/deployment`, `packages/github`, `packages/monitoring` as active packages** — they are empty stubs.
3. **`docs/SECURITY.md` likely claims CSRF protection** — no CSRF mechanism exists in the codebase (no `fastify-csrf`, no double-submit cookie, no same-site strict).
4. **`SETUP.md` should document the `ADMIN_SECRET` bootstrap process** and how the first super-admin account is created.
5. **No API changelog or versioning documentation** — the API has two overlapping route sets for deployments which is undocumented.

---

## FALSE POSITIVES FROM PREVIOUS AUDITS

*(This is a fresh audit from source code. No prior audit findings were used.)*

---

## FILES REVIEWED

| Path | Description |
|------|-------------|
| `prisma/schema.prisma` | Full database schema |
| `prisma/migrations/` | All 4 migration SQL files |
| `apps/api/src/app.ts` | Fastify app setup, CORS, middleware |
| `apps/api/src/server.ts` | Server entry point |
| `apps/api/src/config/env.ts` | Environment validation |
| `apps/api/src/plugins/auth.ts` | `authGuard`, `requireAdmin`, `requireSuperAdmin` |
| `apps/api/src/utils/authz.ts` | Ownership verification helpers |
| `apps/api/src/utils/sanitizers.ts` | Response sanitization |
| `apps/api/src/utils/queue.ts` | BullMQ queue setup |
| `apps/api/src/routes/auth.ts` | Auth routes (login, register, OTP, refresh, logout) |
| `apps/api/src/routes/admin.ts` | Admin control plane |
| `apps/api/src/routes/vps.ts` | VPS management |
| `apps/api/src/routes/deploy.ts` | Deployment initiation |
| `apps/api/src/routes/deployments.ts` | Deployment lifecycle management |
| `apps/api/src/routes/domain.ts` | Domain and SSL management |
| `apps/api/src/routes/github.ts` | GitHub OAuth and repo management |
| `apps/api/src/routes/google.ts` | Google OAuth |
| `apps/api/src/routes/webhooks.ts` | GitHub webhook receiver |
| `apps/api/src/routes/monitoring.ts` | Metrics, logs, rollback |
| `apps/api/src/routes/sandbox.ts` | Sandbox analysis |
| `apps/api/src/routes/sessions.ts` | Session management |
| `apps/api/src/routes/terminal.ts` | WebSocket terminal |
| `apps/api/src/routes/ws.ts` | WebSocket deployment logs/status |
| `apps/api/src/routes/profile.ts` | User profile management |
| `apps/api/src/routes/contact.ts` | Contact form |
| `apps/api/src/routes/public.ts` | Public routes |
| `apps/api/src/services/auth.service.ts` | Core auth logic, OTP, refresh |
| `apps/api/src/services/account.service.ts` | Profile, password, forgot-password |
| `apps/api/src/services/deployment.service.ts` | Full deployment engine (1,806 lines) |
| `apps/api/src/services/vps.service.ts` | VPS management |
| `apps/api/src/services/github.service.ts` | GitHub API integration |
| `apps/api/src/services/terminal.service.ts` | SSH terminal bridge |
| `apps/api/src/services/rollback.service.ts` | Container rollback |
| `apps/api/src/services/sandbox.service.ts` | Sandbox analysis |
| `apps/api/src/services/monitoring.service.ts` | Metrics collection |
| `apps/api/src/services/logging.service.ts` | Deployment log writer |
| `apps/api/src/services/hardening.service.ts` | Payload limits, data retention |
| `apps/api/src/services/cache.service.ts` | Redis cache wrapper |
| `apps/api/src/workers/deployment.worker.ts` | BullMQ worker |
| `apps/api/src/__tests__/auth.test.ts` | Auth unit tests |
| `apps/api/src/__tests__/e2e.test.ts` | E2E test stubs |
| `packages/security/src/tokens.ts` | JWT token service |
| `packages/security/src/encryption.ts` | AES-256-GCM encryption |
| `packages/security/src/passwords.ts` | Argon2id password service |
| `packages/vps/src/ssh.ts` | SSH2 client wrapper |
| `packages/database/src/index.ts` | Prisma client export |
| `packages/mail/src/index.ts` | Nodemailer wrapper |
| `packages/shared/src/` | Shared types and constants |
| `packages/auth/` | Empty (only `.gitignore`) |
| `packages/deployment/` | Empty (only `.gitignore`) |
| `packages/github/` | Empty (only `.gitignore`) |
| `packages/monitoring/` | Empty (only `.gitignore`) |
| `apps/web/lib/store/useAuthStore.ts` | Frontend auth state |
| `apps/web/lib/store/useAdminAuthStore.ts` | Frontend admin auth state |
| `apps/web/lib/api/client.ts` | API fetch client |
| `apps/web/app/(app)/layout.tsx` | Dashboard layout and auth guard |
| `apps/web/app/(admin)/admin/layout.tsx` | Admin layout |
| `apps/web/components/admin/AdminShell.tsx` | Admin shell component |
| `apps/web/hooks/useDeployForgeData.ts` | Data fetching hooks |
| `docker-compose.yml` | Container orchestration |
| `docker/api.Dockerfile` | API container build |
| `docker/web.Dockerfile` | Web container build |
| `turbo.json` | Monorepo task pipeline |
| `package.json` (root) | Workspace root |
| `.env.example` | Environment template |
| `.gitignore` | Git ignore rules |
| `docs/` | All 18 documentation files |

---

## TOP 20 FIXES BEFORE PUBLIC RELEASE

| # | Fix | Severity | Estimated Effort |
|---|-----|----------|-----------------|
| 1 | Fix CORS origin to use `config.app.appUrl` in production | CRITICAL | 15 min |
| 2 | Fix `AdminActivity.adminId` FK violation for unknown-email lockout events | CRITICAL | 1 hr |
| 3 | Remove token storage from `localStorage`; use HttpOnly cookies exclusively | CRITICAL | 4 hrs |
| 4 | Add `credentials: 'include'` to all API fetch calls in `client.ts` | CRITICAL | 1 hr |
| 5 | Implement or remove the 4 empty workspace packages | CRITICAL | 2–8 hrs |
| 6 | Create `apps/web/middleware.ts` for server-side auth guard | HIGH | 2 hrs |
| 7 | Fix account enumeration in `forgotPassword` — return 200 always | HIGH | 30 min |
| 8 | Remove Redis public port binding from `docker-compose.yml` | HIGH | 15 min |
| 9 | Add non-root user to both Dockerfiles | HIGH | 30 min |
| 10 | Create `apps/web/app/(admin)/admin/logs/page.tsx` | HIGH | 2 hrs |
| 11 | Consolidate `/api/deploy` and `/api/deployments` into one route set | HIGH | 3 hrs |
| 12 | Schedule sandbox cleanup BullMQ job after sandbox run completes | MEDIUM | 1 hr |
| 13 | Create `apps/web/next.config.js` with security headers (CSP, X-Frame-Options, etc.) | MEDIUM | 1 hr |
| 14 | Replace `setInterval` DB polling on WebSocket logs with Redis pub/sub | MEDIUM | 4 hrs |
| 15 | Add Zod `datetime()` validation to admin log `from`/`to` query params | MEDIUM | 30 min |
| 16 | Remove `timestamp` field from `AdminActivity`; use `createdAt` only | MEDIUM | 1 hr |
| 17 | Remove `provider` field from `User`; use `authProvider` only | MEDIUM | 2 hrs |
| 18 | Remove `ssh_key` from `VPSAuthType` enum | MEDIUM | 1 hr |
| 19 | Remove committed `.js` build artifacts from `packages/` | LOW | 15 min |
| 20 | Add `--memory` and `--cpus` resource limits to all `docker run` commands | MEDIUM | 2 hrs |

---

## SCORES

| Category | Score | Rationale |
|----------|-------|-----------|
| **Production Readiness** | **29 / 100** | CORS bug blocks all production traffic; FK crash on admin login; localStorage tokens; 4 empty packages; no real test coverage |
| **Security** | **52 / 100** | Excellent: Argon2id, AES-256-GCM, replay detection, IDOR guards, webhook HMAC. Critical gaps: CORS, localStorage tokens, account enumeration, no CSP, Redis exposed |
| **Code Quality** | **58 / 100** | Zod validation throughout, clean service layer patterns, but 1,806-line God class, duplicate routes, dead code, `console.*` mixing |
| **Testing** | **4 / 100** | 5 fake E2E tests, 1 real unit test with a broken mock. Zero authorization, deployment, or integration tests. `vitest` not declared as a dependency |
| **Documentation** | **65 / 100** | Extensive docs directory (18 files). Backup docs honestly declare non-implementation. Empty package docs are misleading. Admin logs page undocumented |

---

## FINAL RELEASE DECISION

# ❌ NOT READY

The project demonstrates architectural maturity and several well-implemented security features. However, three critical defects make it non-functional for any real user in a production deployment: CORS blocks all cross-origin API calls, a database FK violation crashes on every failed admin login for unknown emails, and the frontend stores JWTs in `localStorage` defeating the HttpOnly cookie strategy. Additionally, four workspace packages are empty stubs that would cause build failures.

These issues are fixable. With a focused remediation sprint (estimated 3–5 days for a single developer), the project could reach READY WITH MINOR FIXES status. The core deployment engine, authentication flow, and security primitives are solid foundations worth building on.