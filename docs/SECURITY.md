# 🔐 DeployForge Security Protocols

DeployForge enforces security controls at the data storage, authentication, network routing, and host execution layers. 

---

## 1. Data Encryption & Storage

### 1.1 Secrets at Rest (AES-256-GCM)
All sensitive secrets (VPS root passwords, private keys, GitHub access tokens, environment variables) are encrypted before write operations:
* **Module:** Managed by `@deployforge/security` (`EncryptionService`).
* **Algorithm:** AES-256-GCM with a unique 12-byte initialization vector (IV) per entry.
* **Storage Format:** Stored in database columns as `iv:authTag:encryptedData`.
* **Key Derivation:** The key is loaded from the `ENCRYPTION_KEY` environment variable.

### 1.2 Password Hashing (Argon2id)
User password hashes are computed using Argon2id via the `@deployforge/security` password module:
* **Parameters:** Configured with production-grade settings: memory cost of 64MB (`65536`), time cost of `3` iterations, and parallelism of `4` threads.
* **Length Validation:** User passwords must be at least `6` characters long.

---

## 2. Authentication & Session Security

### 2.1 JWT Access & Opaque Refresh Tokens
* **Access Tokens (JWT):** Short-lived JWTs (15-minute lifetime) containing the user's ID, role, and a unique `sessionId`.
* **Refresh Tokens:** Long-lived, cryptographically secure random tokens stored hashed (SHA-256) in the database.
* **Immediate Session Revocation:** The backend `authGuard` plugin checks the `sessionId` from the JWT against the active database session records on every request. If an administrator disables a user or a user logs out (revoking their session), all matching JWTs are rejected immediately, rather than waiting for expiration.
* **Token Rotation & Replay Protection:** Requesting a new access token rotates both the access and refresh tokens. If a refresh token is reused, the platform flags it as a replay attack and revokes all active sessions for that user.

### 2.2 Security Auditing & Logs
Critical actions (authentication attempts, password updates, session cancellations, and role changes) are written to the database `AuditLog` table:
* **Scope:** Captures categories like `auth`, `sessions`, `password`, `github`, and `account`.
* **Metadata:** Records client IP address and parses the user-agent string to capture the client's OS, browser, and device profile.

---

## 3. Network & Ingress Security

### 3.1 CSRF Protection
DeployForge implements a custom double-submit cookie CSRF mechanism:
* **HMAC Signatures:** The server generates a random token cryptographically signed via HMAC-SHA256.
* **Double Validation:** The client must send the token in both the `Set-Cookie` cookie and the `X-CSRF-Token` header for state-changing requests.

### 3.2 Secure Ingress Headers
Fastify API servers employ `@fastify/helmet` to inject strict security headers:
* **Content Security Policy (CSP):** Restricts script executions and connection targets.
* **Frame Ancestors:** Blocked (`frame-ancestors 'none'`) to prevent clickjacking.
* **Permissions Policy:** Restricts access to device sensors, cameras, and microphones.
* **CORS Origin Filtering:** REST API and WebSocket connections are restricted to configured client and server domains in production.

---

## 4. Remote Execution & Runtime Sandboxing

### 4.1 SSH Input Sanitization
Because DeployForge executes commands on remote servers agentlessly, all command constructions are sanitized to prevent shell injection:
* **Escape Protocols:** Arguments are escaped using custom, prototype-safe `shellQuote` and `shellPath` helper functions.
* **Archive Extraction:** Archive extractions are executed inside a secure python3 wrapper script on the target VPS, preventing path traversal attacks.

### 4.2 Docker Isolation
Deployed user applications are isolated inside Docker container environments on target hosts:
* **Capabilities Dropping:** Containers start with `--cap-drop ALL`, removing root privileges within the container.
* **Privilege Escalation Block:** Enforced via `--security-opt no-new-privileges` to prevent processes from gaining elevated permissions.
