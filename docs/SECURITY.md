# 🔐 DeployForge Security Protocols

DeployForge enforces security controls at the data storage, authentication, network routing, and host execution layers.

---

## 1. Data Encryption & Storage

### 1.1 Secrets at Rest (AES-256-GCM)
All sensitive secrets (VPS passwords, private keys, environment variables) are encrypted before write operations:
* **Module:** `@deployforge/security` (`EncryptionService`).
* **Algorithm:** AES-256-GCM with a unique 12-byte IV per entry.
* **Storage Format:** `iv:authTag:encryptedData` (hex-encoded).
* **Key Source:** `ENCRYPTION_KEY` env var — must be a 64-character hex string.
* **Transparent Middleware:** Prisma middleware auto-encrypts/decrypts the `env` field on `Deployment` and `DeploymentHistory` models.

### 1.2 Password Hashing (Argon2id)
* **Algorithm:** Argon2id via `@deployforge/security`.
* **Parameters:** Memory 64MB, 3 iterations, 4 threads (production-grade).
* **Minimums:** User passwords ≥ 6 chars; Super Admin password ≥ 8 chars.

---

## 2. Environment Variable Validation

The API validates all environment variables at startup using Zod (`apps/api/src/config/env.ts`):
* **Placeholder Detection:** Rejects secrets starting with `replace_with_`, `your_`, `changeme`, etc.
* **Production Enforcement:** `APP_URL` and `API_URL` must use `https://` and must not point to `localhost` when `NODE_ENV=production`.
* **Format Checks:** `ENCRYPTION_KEY` must be 64 hex chars; `DATABASE_URL` must be a valid PostgreSQL URI.
* **Hard Exit:** Any failure causes `process.exit(1)` with descriptive error messages.

---

## 3. Authentication & Session Security

### 3.1 JWT Access & Opaque Refresh Tokens
* **Access Tokens (JWT):** 15-minute lifetime with `userId`, `role`, and `sessionId`.
* **Refresh Tokens:** Long-lived, stored as SHA-256 hash in database.
* **Immediate Revocation:** `authGuard` validates `sessionId` against active DB records on every request.
* **Replay Protection:** Reused refresh tokens trigger full session revocation for that user.

### 3.2 Admin Authentication (Separate System)
* **Isolated Model:** `AdminUser` and `AdminSession` are fully separate from regular `User` sessions.
* **Brute-Force Lockout:** Configurable via `ADMIN_MAX_ATTEMPTS` (default `5`) and `ADMIN_LOCKOUT_TIME` (default `900` seconds).
* **Separate Secret:** `ADMIN_JWT_SECRET` signs admin tokens — distinct from user `JWT_SECRET`.

### 3.3 Security Audit Logs
Critical actions are written to the `AuditLog` table:
* **Scope:** `auth`, `sessions`, `password`, `github`, `account` categories.
* **Metadata:** IP address, OS, browser, device parsed from user-agent.

---

## 4. Network & Ingress Security

### 4.1 CSRF Protection
Double-submit cookie pattern (`apps/api/src/plugins/csrf.ts`):
* Token signed via HMAC-SHA256.
* Client must send token in both `csrfToken` cookie and `X-CSRF-Token` header for all state-changing requests.
* Comparison uses `crypto.timingSafeEqual` to prevent timing attacks.

### 4.2 Security Headers (`@fastify/helmet`)
* **CSP:** `default-src 'none'` — scripts, styles, frames, objects all blocked.
* **Frame Ancestors:** `'none'` — prevents clickjacking.
* **HSTS:** `max-age=31536000; includeSubDomains; preload` (production only).
* **Permissions Policy:** Restricts camera, microphone, geolocation, payment, USB.
* **Referrer Policy:** `no-referrer`.

### 4.3 Rate Limiting
* Global: `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW` (defaults: 100/minute).
* Sensitive routes have tighter per-route limits.
* Returns `HTTP 429` with `{ code: "RATE_LIMIT_EXCEEDED" }`.

### 4.4 Prototype Pollution Protection
A `preValidation` hook rejects any request body, query, or params containing `__proto__`, `prototype`, or `constructor` with `HTTP 400`.

---

## 5. Remote Execution & Runtime Sandboxing

### 5.1 SSH Input Sanitization
* Shell arguments are escaped via prototype-safe `shellQuote`/`shellPath` helpers in `@deployforge/vps`.
* Archive extractions use a Python3 wrapper script on the target VPS to prevent path traversal.

### 5.2 Docker Isolation (Application Containers)
* `--cap-drop ALL` — removes all root-level kernel capabilities.
* `--security-opt no-new-privileges` — blocks privilege escalation.

### 5.3 Deployment Sandbox (Pre-flight)
Before execution, the `DeploymentSandbox` system scores the deployment configuration, estimates CPU/RAM/Disk usage, and flags violations. Deployments with status `rejected` are blocked from proceeding.

### 5.4 Control Plane Container Hardening
Both `api` and `web` Docker services run with:
* `read_only: true` filesystem (only `/tmp` writable via `tmpfs`).
* `no-new-privileges: true`.
* `cap_drop: ALL`.

---

## 6. Metrics Endpoint Protection

The `/metrics` endpoint is protected by an optional Bearer token:
* **Config:** Set `METRICS_TOKEN` to a random 64-char hex string.
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
* **Usage:** `Authorization: Bearer <METRICS_TOKEN>`
* If `METRICS_TOKEN` is empty, the endpoint is unprotected (dev-only; not recommended for production).
