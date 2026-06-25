# 🌟 DeployForge Feature Catalog

DeployForge provides a comprehensive suite of features to onboard servers, deploy applications, configure networking, monitor performance, and enforce platform governance.

---

## 1. Virtual Private Server (VPS) Management

DeployForge uses an agentless infrastructure model to manage target nodes:
* **Target Node Onboarding:** Onboard any server running a standard Linux distribution (Ubuntu 22.04/24.04 LTS recommended) using its IPv4 address, SSH port, and username.
* **Flexible Authentication:** Supports both SSH password authentication and secure SSH Private Key authentication.
* **Host Secrets Encryption:** All passwords and private keys are encrypted before storage using AES-256-GCM, using keys derived from the platform's `ENCRYPTION_KEY`.
* **Automated Package Detection & Hardening:** On onboarding, the system verifies if Docker Engine and Nginx are installed. If missing, it installs them automatically, configures baseline security hardening, and opens required firewall ports.
* **Manual Connection Audits:** Trigger connection tests at any time to verify that target SSH access is active.

---

## 2. Advanced Deployment Engine

A robust pipeline supporting automated git workflows and manual asset uploads:
* **GitHub Integration:** Authorize via OAuth to sync repositories, branch lists, and commit histories.
* **Git Webhook Automation:** DeployForge configures webhook listeners on the target GitHub repository. Pushing changes to monitored branches (e.g., `main`, `master`) automatically triggers a new deployment.
* **Manual File Uploads:** Upload source code as a compressed archive (`.zip`, `.tar.gz`) directly from the browser dashboard.
* **Dynamic Framework Detection:** The build engine parses repository files and automatically configures environments for:
  - **Node.js:** Standard server applications.
  - **Next.js:** Server-side rendered (SSR) or static builds.
  - **Vite (React/Vue):** Generates static assets served via Nginx.
  - **Astro / SvelteKit:** Modern meta-framework environments.
  - **Python / Django / FastAPI:** WSGI/ASGI-compatible builds.
  - **Static HTML:** Pure assets.
* **Blue-Green Zero-Downtime Releases:** Spin up new builds in secondary containers. The platform runs HTTP health checks on the new port; if healthy, Nginx configuration blocks are rewritten, the proxy reloads, and traffic transfers instantly with zero downtime. If verification fails, the new build is pruned and the existing container remains online.
* **Instant Rollbacks:** Rollback to any previous successful deployment image with a single click.

---

## 3. Custom Domains & Automated SSL

Automated traffic routing and security out of the box:
* **Custom Domain Attachment:** Bind custom domains or subdomains (e.g., `app.domain.com`) to any active project deployment.
* **Automated DNS Check:** The platform runs dig queries to verify that the domain's A/AAAA records point to the target VPS IP before attempting to configure SSL.
* **Dynamic Ingress (Nginx):** DeployForge automatically writes proxy configuration files under `/etc/nginx/conf.d/` on the remote server, mapping domain headers to the application's active container port.
* **Zero-Config SSL (Certbot):** Automatic generation and renewal of Let's Encrypt TLS certificates. Certbot configures secure HTTPS redirections, strict Content Security Policies, and HSTS headers.

---

## 4. Platform Monitoring & Web Terminal

Real-time infrastructure visibility and direct terminal access:
* **Host Statistics Polling:** A background cron worker logs CPU usage, Memory consumption, Disk volume space, and running container counts from target servers, storing them in PostgreSQL.
* **Interactive Terminal (WebSockets):** Open an interactive SSH terminal directly inside your web browser. Built on `xterm.js` and Fastify WebSocket adapters, it enables remote server maintenance using secure one-time session tokens and custom grid adjustments.

---

## 5. Administrative Control Panel

Governance features for system administrators and platform owners:
* **Platform Overview:** View active platform-wide deployment metrics, overall VPS nodes, active users, and system load.
* **User Lifecycle & Status Controls:** Admins can view registered user profiles, modify roles (e.g., Administrator, User, Moderator), or suspend/disable accounts to block system access.
* **Granular Audit Logs:** A complete log of critical security events (login attempts, registration validations, password updates, and token cancellations).
* **Global Deployment Governance:** Administrators can monitor and terminate active deployments or inspect build streams across all tenant accounts.

---

## 6. Backup & Restore System

Built-in disaster recovery tools managed from the Admin panel:
* **Manual Exports:** Trigger backup exports containing the full PostgreSQL database dump, system configurations, and active deployment states.
* **Automated Retention Cleanup:** Background tasks periodically purge expired backups to manage disk space.
* **One-Click Restore:** Rollback the entire platform state to a previous backup snapshot in the event of hardware failures.

---

## 7. VPS File Manager

An integrated, web-based explorer designed to manage files on target VPS nodes directly from the control panel:
* **Directory Browsing:** Browse directory structures, view metadata, and check unix permissions.
* **Universal File Editor:** Built-in code editor featuring language syntax highlighting (JS/TS, Python, Go, Rust, JSON, YAML, Nginx/system configuration templates), auto-save, toggles for word wrap, and line search.
* **Universal Access Control:** Utilizes a custom binary deny-list approach rather than a strict allow-list, allowing users to safely read and edit configuration, env, and script files without execution issues.
* **File Operations:** Full support for file creation, folder creation, renaming, deletion, copying, moving, and downloading (as single files or archives).
* **Upload & Drag-and-Drop:** Drag-and-drop file/folder uploads and move operations.
* **Integrated Search:** Instant path search for files and folders by name directly within the browser interface.
* **Archive Tools:** Compress multiple items into a single `.zip` file or extract compressed archives.
