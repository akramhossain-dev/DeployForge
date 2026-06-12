# 🗺️ ROADMAP.md

This roadmap outlines completed milestones and future plans for DeployForge.

---

## 1. Completed Milestones (Phase 1 - Phase 9)

### 1.1 Core Deployment Engine
*   Docker container build and deploy mechanics with zero-downtime blue-green rollouts.
*   Automatic framework structures detection.
*   Archived file uploads and GitHub repository integration.

### 1.2 Networking & DNS
*   Nginx upstream blocks generation and routing.
*   Certbot SSL issuance for custom domains.
*   Pre-flight DNS `A` records checking.

### 1.3 Account Security & Monitoring
*   Multi-session tracking with device metadata (IP, Browser, OS, Device Class).
*   Database-bound session invalidation check on every request.
*   Audit log recording of security events.
*   Decommissioned the user-facing "Sandbox" UI; sandbox checks are run internally.

---

## 2. Upcoming Milestones (Future Release)

### 2.1 Database & Security Scaling
*   Add indexing for the `AuditLog` table on `userId` and `action` to accelerate query performance.
*   Support TOTP-based Two-Factor Authentication (2FA) for local sign-in flows.

### 2.2 Backup System Implementation
*   Develop backend service tasks to run cron-based VPS backup dumps.
*   Provide S3-compatible object storage sync options for direct backup exports.
*   Add a backups history and download view in the settings dashboard.

### 2.3 Real-Time Alerting
*   Implement Slack, Discord, and Email warning triggers for VPS metric spikes.
*   Notify users if a container enters a crash loop.
