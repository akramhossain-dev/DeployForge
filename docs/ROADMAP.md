# 🗺️ ROADMAP.md

## Phase 0: Documentation & Architecture (Current)
- [x] Define System Architecture
- [x] Design UI/UX System
- [x] Specify Database Schema
- [x] Document API & Security Protocols

## Phase 1: Core Infrastructure
- [ ] Initialize Monorepo (Turbo/pnpm)
- [ ] Setup Fastify + Prisma + PostgreSQL
- [ ] Implement AES-256-GCM Secret Vault
- [ ] Basic Next.js Frontend with dark theme

## Phase 2: VPS & SSH Orchestration
- [ ] SSH Key Management system
- [ ] Server Discovery & Health Check logic
- [ ] Dockeride remote socket implementation
- [ ] Auto-installation of Docker/Nginx on remote VPS

## Phase 3: Deployment Engine
- [ ] GitHub OAuth & Repo Sync
- [ ] Build Pipeline (Framework detection + Docker build)
- [ ] Nginx Dynamic Config Generator
- [ ] Let's Encrypt / Certbot integration

## Phase 4: Monitoring & Advanced Features
- [ ] Real-time metrics dashboard (Socket.io/SSE)
- [ ] Browser SSH Terminal integration (xterm.js)
- [ ] Multi-tenant isolation & RBAC
- [ ] Rollback system implementation

## Phase 5: Scaling & Polish
- [ ] S3 storage for deployment logs
- [ ] Custom Domain Management UI
- [ ] Mobile App / PWA support
- [ ] Global Search & Command Palette
