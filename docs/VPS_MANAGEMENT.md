# 🖥️ VPS_MANAGEMENT.md

DeployForge uses an **agentless infrastructure management** approach. Instead of requiring a daemon on target servers, it logs in using standard SSH credentials and configures remote containers, routing tables, and SSL properties.

---

## 1. Credentials Encryption
To protect server security, passwords and private keys are never stored in plaintext:
*   Credentials are encrypted in `vps.service.ts` using AES-256-GCM via the shared `packages/security` module.
*   The encryption format stored in the `VPS` table is: `iv:authTag:encryptedData`.
*   The decryption key is loaded from the environment variable `ENCRYPTION_KEY` at runtime and is never logged or exposed in the DB.

---

## 2. Server Connection Verification
When adding a VPS or calling `/vps/test-connection`, the backend executes the connection logic in `vps.service.ts` using `@deployforge/vps` (`SSHService`):
1.  Loads host details, username, port, and decrypts credentials.
2.  Establishes an SSH connection with a `10s` timeout limit.
3.  Catches common connection failures (timeout, bad credentials, port blocked, unreachable host) and maps them to clean user-friendly HTTP errors (`INVALID_CREDENTIALS`, `PORT_BLOCKED`, etc.).

---

## 3. Remote Discovery & Provisioning
Upon connection, DeployForge performs discovery to check the capabilities of the server:
*   **Operating System:** Runs queries to identify the OS configuration.
*   **Docker Daemon:** Checks if `docker` is installed and running, and retrieves version tags.
*   **Nginx Proxy:** Checks if Nginx is installed, enabling the domain and SSL management workflows.
*   **Auto-Setup:** If Nginx or Docker are missing, DeployForge can issue automated shell setup commands over SSH to provision dependencies (Docker Engine, Nginx, Certbot).

---

## 4. Rate-Limiting Protections
Since SSH command dispatching can be target-intensive and susceptible to brute-forcing, a strict rate-limiter is applied to all connection and health-checking routes (`/vps/add`, `/vps/test-connection`, `/vps/:id/health-check`, and `PATCH /vps/:id`).
*   **Rate Limits:** Enforces a maximum of **8 connections/SSH attempts per 10 minutes** per user.
*   **Error Return:** Returns `429 (Rate limit exceeded)` on violation.
