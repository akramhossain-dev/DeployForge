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
* **Zero-Config SSL & Networking:** Dynamic Nginx reverse proxy routing with automatic Let's Encrypt certificate issuance and renewal via Certbot.
* **Blue-Green Deployments:** Deploys new builds in parallel containers, verifies health, reloads Nginx, and tears down old containers for zero-downtime releases.
* **Instant Rollbacks:** One-click rollback to any previous successful deployment image.
* **Real-time Monitoring & SSH Terminal:** Track server CPU/RAM/Disk metrics and open an interactive web SSH terminal directly in the browser (powered by `xterm.js` + WebSockets).
* **Notification & Alert System:** Configurable per-user alert thresholds for CPU, RAM, Disk, and Swap. In-app and email notifications for deployments, SSL, backups, and server events.
* **Deployment Sandbox:** Pre-flight analysis that scores each deployment configuration, estimates resource usage, and blocks risky deployments before they reach your VPS.
* **VPS File Manager:** Web-based file explorer with a built-in code editor, syntax highlighting, drag-and-drop uploads, archive tools, and path search.
* **Backup & Restore System:** Manual and scheduled database backup exports with one-click restore.
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
└── docs/                     # Comprehensive Project Documentation
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

> See [docs/SETUP.md](docs/SETUP.md) for the full setup guide including production Docker deployment.

---

## 📄 Documentation Directory

| Doc | Description |
|-----|-------------|
| 📋 [Project Overview](docs/PROJECT_OVERVIEW.md) | Vision, Control/Data Plane model, package map |
| 🚀 [Setup & Installation](docs/SETUP.md) | Local dev quickstart, Docker Compose production guide |
| 🔌 [API Reference](docs/API.md) | Full REST endpoint inventory, WebSocket terminal, admin routes |
| 🏗️ [Architecture](docs/ARCHITECTURE.md) | Design diagrams, Blue-Green deployment sequence, monorepo layout |
| 🌟 [Features](docs/FEATURES.md) | All platform features: deployments, env vars, monitoring, alerts, file manager |
| 🔐 [Security](docs/SECURITY.md) | Encryption, CSRF, rate limiting, Docker hardening, metrics protection |

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React 18, Zustand, Tailwind CSS, xterm.js |
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
