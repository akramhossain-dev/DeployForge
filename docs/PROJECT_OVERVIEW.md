# 📋 Project Overview — DeployForge

DeployForge is a next-generation, self-hosted Platform-as-a-Service (PaaS) and DevOps orchestration platform. Designed to bridge the gap between complex raw cloud infrastructure and developer-friendly workflows, DeployForge allows you to transform any standard Ubuntu Virtual Private Server (VPS) into a fully managed, automated application hosting platform—equivalent to having a private Vercel, Railway, or Heroku.

---

## 1. Core Vision & Objectives

* **Full Infrastructure Ownership:** Host your web apps, databases, and cron workers on your own hardware without paying cloud platform premiums.
* **Modern Developer Experience (DX):** Push to GitHub to trigger automated build pipelines, check container health, stream live logs, and attach domains with one click.
* **Production-Grade Architecture:** Decouple core platform logic (Control Plane) from user running environments (Data Plane) using secure agentless SSH orchestration and Docker isolation.
* **Security & Isolation:** Enforce industry standards like AES-256-GCM for host secrets, Argon2id for authentication, strict Content Security Policies (CSP), double-submit cookie CSRF protection, and Docker sandbox profiles (`no-new-privileges` and dropped kernel capabilities).

---

## 2. Platform Architecture Model

DeployForge uses a **Control Plane & Data Plane Separation** model:

```
┌──────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                       │
│                                                          │
│  ┌─────────────────┐       ┌──────────────────────────┐  │
│  │   Next.js App   │ ◄───► │  Fastify API Orchestrator│  │
│  │  (Dashboard UI) │       │      (apps/api)          │  │
│  └─────────────────┘       └──────┬─────────────┬─────┘  │
│                                   │             │        │
│                                   ▼             ▼        │
│                              ┌──────────┐  ┌──────────┐  │
│                              │PostgreSQL│  │  Redis   │  │
│                              └──────────┘  └────┬─────┘  │
│                                                 │        │
│                                                 ▼        │
│                                            ┌──────────┐  │
│                                            │  BullMQ  │  │
│                                            │  Worker  │  │
│                                            └────┬─────┘  │
└─────────────────────────────────────────────────┼────────┘
                                                  │
                                   SSH SSH Tunnel │ (Agentless)
                                                  ▼
┌──────────────────────────────────────────────────────────┐
│                DATA PLANE (Target VPS Hosts)             │
│                                                          │
│     ┌──────────────────────────────────────────────┐     │
│     │               Nginx Reverse Proxy            │     │
│     │          (SSL via Let's Encrypt Certbot)     │     │
│     └──────────────────────┬───────────────────────┘     │
│                            │ (Internal Port mapping)     │
│                            ▼                             │
│     ┌──────────────────────────────────────────────┐     │
│     │             Docker Container Sandbox         │     │
│     │ ┌───────────────┐ ┌───────────────┐          │     │
│     │ │ App Container │ │ App Container │ ...      │     │
│     │ └───────────────┘ └───────────────┘          │     │
│     └──────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

### 2.1 The Control Plane (Central Orchestrator)
The central engine coordinates cluster configuration, stores meta-state, syncs git integrations, monitors server load, and schedules deployment tasks.
* **Dashboard App (`apps/web`):** A Next.js single-page application configured with clean styling and micro-animations. Contains distinct portals for standard users and platform administrators.
* **Orchestrator Backend (`apps/api`):** A Fastify server processing domain validation, VPS health verification, project builds, and terminal sessions.
* **Workers & Cache (`Redis` & `BullMQ`):** Fastify publishes async tasks (like server setups, application builds, and metrics polls) to BullMQ queues processed by isolated background threads.
* **Metadata Store (`PostgreSQL` + `Prisma`):** Houses user accounts, active sessions, VPS credentials, webhook events, deployment history, custom domains, and security logs.

### 2.2 The Data Plane (Application Target Servers)
The remote environments where user applications run and interface with the public web.
* **Agentless Design:** Target VPS nodes do not run any custom daemon. All container provisioning, health validations, log streams, and web proxy changes are executed remotely over secure SSH channels.
* **Docker Sandboxed Runtimes:** Every application is containerized under an unprivileged user space. Containers are hardened with strict capability dropping and prevent privilege escalation.
* **Traffic Routing (Nginx & Certbot):** A central Nginx instance on each target VPS manages public ports `80` & `443`, mapping incoming custom domains to active internal container ports. SSL certificates are issued and renewed automatically via Certbot.

---

## 3. Core Packages Map

The repository is built as a highly structured Turborepo monorepo:
* **`packages/security`:** Pure cryptographic routines. Manages user passwords via Argon2id, creates and checks JWTs, generates random OTPs, and encrypts server credentials using AES-256-GCM.
* **`packages/vps`:** Coordinates secure remote shell operations. Establishes SSH connection pools, handles command logging, stream management, and folder transfers.
* **`packages/database`:** Configures and exports the shared Prisma client and PostgreSQL schema.
* **`packages/mail`:** Manages transactional notifications, verification emails, and OTP deliveries.
* **`packages/shared`:** Houses API contracts, input validation schemas, unified errors, and shared utility functions.
