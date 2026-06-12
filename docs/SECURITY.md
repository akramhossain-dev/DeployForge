# 🔐 SECURITY.md

DeployForge implements security controls at the database, session, network, and target execution layers.

---

## 1. Data Encryption

### 1.1 Secrets at Rest (AES-256-GCM)
All sensitive data (VPS private keys, SSH passwords, GitHub access tokens, environment variables) are encrypted at rest:
*   **Module:** Managed by `@deployforge/security` (`EncryptionService`).
*   **Format:** Stored directly in table columns (e.g. `VPS.encryptedPrivateKey`, `GitHubAccount.accessToken`, `Deployment.env`) as `iv:authTag:encryptedData`.
*   **Keys:** Derived from the `ENCRYPTION_KEY` environment variable.

### 1.2 Password Hashing (Argon2id)
Local authentication credentials are hashed using Argon2id to prevent brute-forcing.

---

## 2. Authentication & Session Security

### 2.1 Access Tokens & Active Session Verification
*   **JWT Structure:** short-lived access tokens containing the user identity, roles, and a unique `sessionId`.
*   **Refresh Tokens:** long-lived refresh tokens stored in the database `UserSession` table.
*   **Database Invalidation Check:** The backend `authGuard` plugin checks the `sessionId` from the JWT against the database `UserSession` table on every request. If a session is deleted/revoked, the access token is rejected immediately.
*   **Metadata Tracking:** User agents are parsed to extract device class, operating system, and browser, which are stored with the session and displayed to the user.

### 2.2 Security Auditing
Critical security actions trigger an entry in the `AuditLog` table. This log records:
*   Action categories (`auth`, `sessions`, `password`, `github`, `account`).
*   IP addresses, parsed OS, Browser, Device, and User-Agent.
*   Descriptions of the event (e.g. login failures, password changes, session revokes).

---

## 3. Network & Deployment Security

### 3.1 Docker Isolation
*   Applications run containerized inside Docker on target nodes.
*   Containers are started with strict security parameters:
    `--security-opt no-new-privileges --cap-drop ALL`

### 3.2 Webhook Signature Checking
*   All incoming GitHub webhooks routed through `/webhooks/github` are validated.
*   DeployForge verifies that the request payload matches the `X-Hub-Signature-256` signature computed using the `GITHUB_WEBHOOK_SECRET`. Unsigned or invalid requests are dropped.

### 3.3 Payload Masking
*   The API automatically masks sensitive fields before returning responses to the user:
    *   Excludes `encryptedPassword` and `encryptedPrivateKey` from VPS responses.
    *   Provides a safe masked preview of environment variable values (e.g. `API_KEY=********`) in deployment responses.
