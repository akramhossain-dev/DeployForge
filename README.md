# 🛠️ DeployForge

### The Next-Gen Self-Hosted Deployment Platform

**DeployForge** is a production-grade, self-hosted Platform-as-a-Service (PaaS) orchestrator designed to automate application building, deployment, and monitoring on your own Virtual Private Servers (VPS). Think of it as a private, self-hosted Vercel or Railway — keeping you in full control of your costs and infrastructure while enjoying a modern developer experience.

```
 ┌──────────────┐      ┌─────────────┐      ┌─────────────┐
 │  Commit Push │ ───► │ DeployForge │ ───► │  Target VPS │
 │  (GitHub WS) │      │ (Control)   │      │ (App Runs)  │
 └──────────────┘      └─────────────┘      └─────────────┘
```

---

## 🚀 Key Features

* **Agentless SSH Orchestration:** Connect any standard Ubuntu server. DeployForge communicates entirely over secure SSH — no proprietary agents or daemons required.
* **Automated Git Workflows:** Sync with GitHub via OAuth. Pushing to monitored branches triggers automated build pipelines via webhooks.
* **Multi-Framework Build Engine:** Automatically detects and configures runtimes for Next.js, Node.js, Vite (React/Vue), Astro, SvelteKit, Python Django/FastAPI, and static HTML.
* **Environment Variable Management:** Multi-file, tabbed environment editor with AES-256-GCM encryption at rest.
* **Verified TLS & Networking:** Stable Traefik file-provider routes with asynchronous ACME issuance and real SNI certificate verification.
* **Blue-Green Deployments:** Builds immutable candidates on a private validation network, probes them through Traefik, atomically switches the route, and preserves the prior release for rollback.
* **Safe Rollbacks:** Re-validates a retained release before traffic is switched; stateful Compose dependency changes require a maintenance workflow.
* **Real-time Monitoring & SSH Terminal:** Track server CPU/RAM/Disk metrics and open an interactive web SSH terminal directly in the browser (powered by `xterm.js` + WebSockets).
* **Notification & Alert System:** Configurable per-user alert thresholds for CPU, RAM, Disk, and Swap. In-app and email notifications for deployments, SSL, backups, and server events.
* **Deployment Sandbox:** Pre-flight analysis that scores each deployment configuration, estimates resource usage, and blocks risky deployments before they reach your VPS.
* **VPS File Manager:** Web-based file explorer with a built-in code editor, syntax highlighting, drag-and-drop uploads, archive tools, and path search.
* **Experimental Local Backup Tools:** Internal manual export/restore helpers only; no scheduled, offsite, continuous-backup, or disaster-recovery guarantee.
* **Enterprise Security Controls:** AES-256-GCM encryption, Argon2id password hashing, double-submit CSRF, Helmet headers, admin brute-force lockout, prototype pollution protection, and Docker sandbox profiles.

---

## 🏗️ Repository Structure

DeployForge is managed as a high-performance monorepo using Turborepo and `pnpm`:

```text
DeployForge/
├── apps/
│   ├── api/                  # Fastify REST & WebSocket Backend
│   └── web/                  # Next.js App Router Frontend Dashboard
├── packages/
│   ├── database/             # Shared Prisma Client & PostgreSQL Schema
│   ├── mail/                 # SMTP Transporter & Email Templates
│   ├── security/             # AES-256-GCM Encryption & Argon2id Hashing
│   ├── shared/               # Shared Schemas, Types, and Utilities
│   └── vps/                  # SSH Connection Pools & SFTP Transfers
├── prisma/                   # Database Schema & Migrations
├── docker/                   # Dockerfiles & Nginx configuration
└── docs/                     # Project and production documentation
```

---

## ⚡ Quick Start (Local Development)

```bash
# 1. Clone and install
git clone https://github.com/akramhossain-dev/DeployForge.git
cd DeployForge
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your database, Redis, GitHub OAuth, and SMTP credentials

# 3. Initialize database
pnpm db:push && pnpm db:generate

# 4. Start development servers
pnpm dev
```

* **Web Dashboard:** `http://localhost:3000`
* **API Server:** `http://localhost:3001`

---

## 📚 Documentation

| Guide | Purpose |
| --- | --- |
| [Project Overview](docs/PROJECT_OVERVIEW.md) | Product goals, workflows, repository map, and system boundaries |
| [Features](docs/FEATURES.md) | Supported platform capabilities and operational boundaries |
| [Architecture](docs/ARCHITECTURE.md) | Services, networks, deployment flow, storage, and recovery model |
| [API Reference](docs/API.md) | API conventions, authentication, and route groups |
| [Setup](docs/SETUP.md) | Local development and production deployment instructions |
| [Security](docs/SECURITY.md) | Application, host, container, release, and backup controls |

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Zustand 5, Tailwind CSS 4, xterm.js 6 |
| **Backend** | Fastify, BullMQ, ioredis |
| **Database & Cache** | PostgreSQL 16, Prisma ORM, Redis 7 |
| **Infrastructure** | SSH2, SFTP, Docker Engine, Nginx, Certbot |
| **Monorepo** | Turborepo, pnpm workspaces |
| **Security** | JWT, Argon2id, AES-256-GCM, HMAC-SHA256 |
| **CI** | GitHub Actions (lint, typecheck, build) |

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for workflow guidelines, coding standards, and pull request requirements.

---

## ⚖️ License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
