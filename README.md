# 🛠️ DeployForge

### The Next-Gen Self-Hosted Deployment Platform

**DeployForge** is a production-grade, self-hosted Platform-as-a-Service (PaaS) orchestrator designed to automate application building, deployment, and monitoring on your own target Virtual Private Servers (VPS). Think of it as a private, self-hosted Vercel or Railway, keeping you in full control of your costs and infrastructure while enjoying a modern developer experience (DX).

```
 ┌──────────────┐      ┌─────────────┐      ┌─────────────┐
 │  Commit Push │ ───► │ DeployForge │ ───► │  Target VPS │
 │  (GitHub WS) │      │ (Control)   │      │ (App Runs)  │
 └──────────────┘      └─────────────┘      └─────────────┘
```

---

## 🚀 Key Features

* **Agentless SSH Orchestration:** Connect any standard Ubuntu server. DeployForge communicates entirely over secure SSH connections—no proprietary agents or daemons required.
* **Automated Git Workflows:** Sync with GitHub via OAuth. Pushing code to your branches triggers automated build pipelines via webhooks.
* **Multi-Framework Build Engine:** Automatically detects and configures runtimes for Next.js, Node.js, Vite React/Vue, Astro, Python Django/FastAPI, and static HTML apps.
* **Zero-Config SSL & Networking:** Dynamic Nginx reverse proxy routing. Automatic Let's Encrypt certificate issuance and renewal via Certbot.
* **Blue-Green Deployments:** Deploys new builds in parallel, verifies container health, reloads Nginx dynamically, and tears down old containers for zero-downtime releases.
* **Real-time Monitoring & SSH Terminal:** Track server resources (CPU, Memory, Disk) and open an interactive web SSH terminal session directly in the browser.
* **Backup & Restore System:** Manual and scheduled backup exports with database dumps, configurations, and one-click restore capabilities.
* **Enterprise Security Controls:** AES-256-GCM encryption for credentials, Argon2id password hashing, double-submit cookie CSRF prevention, Helmet headers protection, and Docker sandbox profiles.

---

## 🏗️ Repository Structure

DeployForge is managed as a high-performance monorepo using Turborepo and `pnpm`:

```text
DeployForge/
├── apps/
│   ├── api/                  # Fastify REST & WebSocket Backend
│   └── web/                  # Next.js App Router Frontend Dashboard
├── packages/
│   ├── database/             # Shared Prisma Client & PostgreSQL Client
│   ├── mail/                 # SMTP Transporter & Verification Templates
│   ├── security/             # AES-256-GCM Encryption & Argon2id Hashing
│   ├── shared/               # Shared Schemas, Types, and Utilities
│   └── vps/                  # SSH Connection Pools & SFTP Transfers
├── prisma/                   # Database Schemas & Migrations
└── docs/                     # Comprehensive Project Documentation
```

---

## 📄 Documentation Directory

For deep technical specifications, design patterns, and guides, explore our documentation:

* 📋 **[Project Overview](docs/PROJECT_OVERVIEW.md):** Vision, architecture model, Control/Data Plane separation, and package blueprints.
* 🚀 **[Setup & Installation Guide](docs/SETUP.md):** Local development quickstart, Docker Compose configurations, and production deployment scripts.
* 🔌 **[API Specifications](docs/API.md):** Full REST endpoint inventory, query parameters, request payloads, response schemas, and WebSocket terminal handshakes.
* 🏗️ **[Architectural Design](docs/ARCHITECTURE.md):** Technical design diagrams, module communications, and Blue-Green zero-downtime sequence flows.
* 🌟 **[Platform Features](docs/FEATURES.md):** In-depth guides on VPS target onboarding, deployment strategies, network routing, custom domains, and backup management.
* 🔐 **[Security Protocol](docs/SECURITY.md):** Cryptographic implementations, session tracking, token rotations, CSRF, and Docker security isolation.

---

## 🛠️ Technology Stack

* **Frontend:** Next.js 14, Zustand State Manager, Tailwind CSS, shadcn/ui components
* **Backend:** Fastify API, BullMQ Worker Pools, ioredis Client
* **Database & Cache:** PostgreSQL DB, Prisma ORM, Redis Cache & Queue Broker
* **Infrastructure:** SSH2 (Remote connections), SFTP (File Transfers), Docker (Sandboxes)
* **Web Proxy:** Nginx, Certbot (SSL certificates)
* **Security Primitives:** JWT (Access tokens), Argon2id (Credential hashing), AES-256-GCM (Secrets encryption)

---

## 🤝 Contributing

Contributions are welcome! Please read the guidelines in [CONTRIBUTING.md](CONTRIBUTING.md) to get started on submitting features, fixes, or documentation enhancements.

---

## ⚖️ License

Distributed under the MIT License. See [LICENSE](LICENSE) for more details.
