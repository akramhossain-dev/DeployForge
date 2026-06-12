# 📋 SPECIFICATION.md

## 1. Core Functional Requirements

### 1.1 Authentication & Profile
- **Password Auth:** Argon2id hashing for local credentials.
- **OTP:** Email-based OTP verification for email activation and sensitive actions.
- **GitHub OAuth:** Single-click registration, account linking, and token decryption.
- **Profile:** Management of profile details (Full Name only; Email and Username are read-only after signup).
- **Session Security:** Multi-session tracking with device metadata (IP, OS, Browser, Device Class), manual revocation of other active sessions, and immediate token rejection on API request.
- **Security Audit Logs:** Paginated, searchable security logs showing event categorization (auth, sessions, passwords, github, account) with client details.

### 1.2 VPS Management
- **Connection:** SSH credentials (passwords or private keys) encrypted via AES-256-GCM.
- **Discovery:** Automatically detect Docker, Nginx, and system OS configurations upon connection validation.
- **Health Checks:** Manual or periodic SSH execution of status commands to extract CPU, Memory, Disk usage, and container counts.
- **Rate-Limiting:** Enforces strict limits on SSH connectivity testing rate limits (e.g., maximum 8 attempts per 10 minutes).

### 1.3 Deployment System
- **Framework Auto-Detection:** Scans code repository structures to detect framework configurations (Next.js, Node.js, Django, Laravel, React/Vite, Astro).
- **Build Types:** Support for Dockerfile-based container builds.
- **Deployment Sources:**
  - **GitHub Repositories:** Sync repositories, register webhook push triggers, and pull source code.
  - **File Archives:** Manual file upload deployments (.zip, .tar.gz, .tgz) stored in a temporary path before deployment.
- **Port Management:** Dynamic port allocation with SSH conflict checking.
- **Environment Variables:** Encrypted JSON config storage per deployment.

### 1.4 Domain & Networking
- **Auto-Nginx:** Upstream template configuration generated on target server.
- **SSL:** Let's Encrypt certificates managed via Nginx and Certbot execution.
- **Domain Mapping:** Custom domain routing mapping to the container port.

---

## 2. Technical Requirements

### 2.1 Backend Performance
- Standard request time under 200ms.
- Asynchronous task processing (via BullMQ) for all long-running operations (>2s), such as building Docker images and running server updates.

### 2.2 Security Standards
- Private keys, passwords, environment secrets, and GitHub access tokens are encrypted at rest using AES-256-GCM.
- Strict token handling (Short-lived access JWT, long-lived secure refresh token).
- Immediate session verification check in DB during auth validation hook.

---

## 3. Internal Sandbox Validation Features
The sandbox features are **strictly internal-only backend mechanisms** used during the build phase:
- **Build Scoring:** A 0-100 score indicating application packaging fitness (e.g. valid lockfiles, correct package configs).
- **Resource Profiling:** Checks available target server RAM and CPU before starting deployment.
- **Security Scans:** Checks for configuration issues before starting the Docker build.
- **Note:** Sandbox pages, routes, lists, or control buttons have been completely decommissioned from the user-facing frontend UI.
