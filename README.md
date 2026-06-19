# 🛠️ DeployForge

### The Next-Gen Self-Hosted Deployment Platform

**DeployForge** is a production-grade, self-hosted SaaS orchestrator designed to automate application deployment, monitoring, and maintenance on your own VPS instances. Think of it as your private Vercel or Railway, giving you full control over your infrastructure with the ease of modern DevOps workflows.

---

## 🚀 Key Features

- **Multi-Cloud/VPS**: Deploy to any VPS via SSH.
- **GitHub Integration**: Automated deployments on git push with webhook tracking.
- **Advanced Deployment Engine**: Support for Docker-based builds with framework auto-detection (Next.js, Node.js, Django, etc.).
- **Security First**: AES-256-GCM encryption for secrets, Argon2 hashing, and JWT-based auth.
- **Zero-Config SSL**: Automatic Let's Encrypt certificates via managed Nginx reverse proxy.
- **Real-time Monitoring**: CPU, RAM, and Disk usage tracking with professional charts.
- **Integrated Terminal**: Browser-based SSH terminal for direct server access.

---

## 🏗️ Repository Structure

```text
DeployForge/
├── apps/
│   ├── web/                # Next.js Frontend (shadcn/ui, Tailwind)
│   └── api/                # Fastify Backend (TypeScript)
├── packages/
│   ├── database/           # Prisma database client
│   ├── mail/               # SMTP mail transport
│   ├── vps/                # VPS management and SSH communication
│   ├── security/           # AES-256-GCM & Argon2 utilities
│   └── shared/             # Shared types, constants, and utilities
├── prisma/                 # Database Schema (PostgreSQL)
├── docker/                 # Deployment templates & system configs
├── docs/                   # Full documentation (Phase 0)
├── scripts/                # Setup and maintenance scripts
└── package.json            # Monorepo root configuration (Turbo/pnpm)
```

---

## 📄 Documentation Index

Explore the deep technical architecture and specifications:

1.  **[Architecture](./docs/ARCHITECTURE.md)**: High-level system design and data flow.
2.  **[Technical Specification](./docs/SPECIFICATION.md)**: Core features and technical requirements.
3.  **[Database Schema](./docs/DATABASE.md)**: Logic and ERD for PostgreSQL.
4.  **[API Reference](./docs/API_REFERENCE.md)**: Detailed Fastify endpoint documentation.
5.  **[Security Protocol](./docs/SECURITY.md)**: Encryption, Auth, and Sandboxing.
6.  **[Deployment Engine](./docs/DEPLOYMENT_ENGINE.md)**: How builds and port management work.
7.  **[UI/UX Design](./docs/UI_UX.md)**: Design system, theme, and wireframes.
8.  **[Roadmap](./docs/ROADMAP.md)**: Future features and development phases.
9.  **[Contributing](./docs/CONTRIBUTING.md)**: Guidelines for developers.
10. **[Development Guide](./docs/DEVELOPMENT.md)**: Local setup and environment instructions.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Fastify, TypeScript, BullMQ (Queue)
- **Database**: PostgreSQL, Prisma, Redis (Cache/Queue)
- **Infrastructure**: Docker, Dockerode (Management), SSH2 (Remote Access)
- **Proxy**: Nginx, Certbot (SSL)
- **Security**: JWT, Argon2, AES-256-GCM

---

## ⚖️ License

MIT License - Copyright DeployForge Team
