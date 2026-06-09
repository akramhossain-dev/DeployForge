# 🔐 SECURITY.md

## 1. Data Encryption

### 1.1 Secrets at Rest
All sensitive data (SSH Keys, API Tokens, ENV variables) are encrypted using **AES-256-GCM**.
- **Key Derivation**: Master key stored in environment variables (never in DB).
- **Format**: `iv:authTag:encryptedData`
- **Rotation**: Support for master key rotation via CLI script.

### 1.2 Password Hashing
- **Algorithm**: Argon2id
- **Reasoning**: Resistant to GPU cracking and side-channel attacks.
- **Parameters**: 
  - Iterations: 3
  - Memory: 64MB
  - Parallelism: 4

---

## 2. Authentication & Authorization

### 2.1 JWT Strategy
- **Access Token**: Short-lived (15 minutes).
- **Refresh Token**: Long-lived (7 days), stored as HttpOnly cookie.
- **Payload**: User ID, Role, and Security Version (for instant invalidation).

### 2.2 Role-Based Access Control (RBAC)
- **OWNER**: Full access to VPS and Projects.
- **COLLABORATOR**: Can trigger deployments and view logs, cannot delete VPS or modify billing.
- **VIEWER**: Read-only access to monitoring and history.

---

## 3. Deployment Security

### 3.1 Sandboxing
- **Docker Isolation**: Each application runs in its own Docker container with limited resource quotas (cgroups).
- **Network Isolation**: Apps can only communicate with the internet or specified internal networks (e.g., a DB network).

### 3.2 SSH Security
- **Dynamic Keys**: DeployForge can generate a unique SSH keypair per VPS or per User.
- **Restricted Commands**: Optional restriction of SSH keys to only allow Docker-related commands (via `command="..."` in `authorized_keys`).

---

## 4. Infrastructure Security

### 4.1 Secret Manager
- Centralized `packages/security` used to handle all encryption/decryption logic.
- Avoids "leaky abstractions" where developers might accidentally log plaintext secrets.

### 4.2 Webhook Security
- **GitHub Signature**: All incoming GitHub webhooks are validated using an X-Hub-Signature-256 HMAC-SHA256 hash.
