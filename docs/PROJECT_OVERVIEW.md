# 📋 PROJECT_OVERVIEW.md

## 1. Introduction
DeployForge is a next-generation self-hosted PaaS (Platform-as-a-Service) and DevOps orchestrator. It allows developers to connect their own Virtual Private Servers (VPS) and deploy web applications on them agentlessly via SSH and Docker. DeployForge acts as a private, self-hosted alternative to platforms like Vercel, Railway, or Heroku, keeping users in control of their target infrastructure while offering a modern SaaS dashboard interface.

---

## 2. Core Archetype & Design

*   **Application Type:** Multi-tenant infrastructure management and app deployment orchestration dashboard.
*   **Architecture Pattern:** Control Plane & Data Plane Separation.
    *   **Control Plane:** The central Next.js frontend dashboard and Fastify backend API orchestrator.
    *   **Data Plane:** Agentless target servers (VPS) that run deployed user applications containerized in Docker, fronted by an Nginx reverse proxy with SSL termination.
*   **Communication Style:** SSH-mediated command execution and SFTP uploads. No agent is required to be installed on target servers; DeployForge manages everything via SSH and Docker Remote API port tunneling.

---

## 3. High-Level Feature Architecture

*   **User Accounts & Auth:** Local email-password authentication with secure Argon2id password hashing, email OTP verification, and GitHub OAuth integration. Enforces session tracking and revocation checks on every API request.
*   **VPS Targets Manager:** Target discovery, Docker/Nginx auto-detection, manual health-check triggers, and SSH credentials management (passwords/keys) encrypted via AES-256-GCM.
*   **Project Build & Deploy Pipeline:** GitHub repository sync, webhook triggers, and archive upload deployments (.zip/.tar.gz). Supports dynamic framework detection (Next.js, Node.js, Vite React, Astro, Django, Laravel).
*   **Networking & Custom Domains:** Automatic upstream reverse proxy allocation, custom domain attachment, Let's Encrypt SSL certificate issuance, and verification of DNS records.
*   **Server Monitoring & Metrics:** Scheduled collection of CPU, Memory, Disk usage, and active container metrics, visualizable in dashboard graphs.
*   **Active Session & Audit Logs:** Device, browser, and OS metadata tracking for current logins. A paginated, searchable database audit log of critical security events (logins, password changes, token revokes).
