# DeployForge Features

## VPS management

- Add, update, test, and remove target VPS connections.
- Bootstrap gateway infrastructure and inspect asynchronous operation status.
- Collect health, system information, live metrics, resource history, and environment inventory.
- Detect and install required runtimes through controlled preparation plans.
- Review installation and deployment logs.

## Deployment engine

- Deploy from GitHub repositories or uploaded archives.
- Detect Node.js, Next.js, Vite, Astro, static sites, Python, and other supported runtime signals.
- Support Dockerfile and policy-constrained Docker Compose projects.
- Apply resource tiers, container hardening, and pre-flight validation.
- Build private candidate releases and perform health checks before traffic switching.
- Start, stop, pause, resume, restart, redeploy, delete, and roll back deployments.
- Preserve release and environment history for operational review.

## Routing and TLS

- Attach custom domains and subdomains to deployments.
- Verify DNS before routing changes.
- Manage Traefik-backed application ingress on target VPS nodes.
- Issue and validate TLS certificates.
- Keep candidate validation isolated from public traffic.

## Environment variables

- Maintain deployment-specific environment files.
- Encrypt sensitive values at rest.
- Track environment history and apply controlled updates.
- Redact secrets from logs and user-facing error output.

## Projects and collaboration

- Group deployments and access under projects.
- Invite members and accept or decline invitations.
- Manage member roles and remove memberships or pending invitations.
- Enforce project-level authorization for shared resources.

## GitHub integration

- Connect or disconnect a GitHub account through OAuth.
- Synchronize repository metadata.
- Create deployment webhooks and process signed webhook deliveries.
- Reject missing signatures and duplicate delivery identifiers.
- Trigger monitored-branch deployment workflows.

## Monitoring and real-time interfaces

- View deployment logs, history, and target VPS metrics.
- Stream deployment logs and status through WebSockets.
- Receive real-time notification updates.
- Open authenticated browser terminal sessions to authorized VPS nodes.
- Configure CPU, memory, disk, swap, SSL, deployment, and backup alerts.

## File manager

- Browse, search, inspect, read, edit, rename, copy, and delete remote files.
- Upload and download individual files or ZIP archives.
- Create files/directories and compress or extract archives.
- Enforce normalized paths and server-side authorization.

## Authentication and account security

- Email/password registration and OTP or email verification.
- Access-token and refresh-session lifecycle.
- Password reset and password change flows.
- Session listing and selective, other-session, or all-session logout.
- GitHub and optional Google OAuth.
- Profile preferences, audit history, and account deletion.

## Administration

- Separate administrator login and authorization model.
- Moderator, administrator, and super-administrator controls.
- Platform overview, user status/role management, deployment and VPS operations.
- GitHub account administration, monitoring, logs, resource policies, and settings.
- Experimental local backup creation, restoration, listing, and pruning for authorized operators.

## Production delivery

- CI validates Prisma generation, tests, lint, typecheck, and Docker builds.
- CD is triggered by immutable release tags.
- Release SHA must belong to `main` and have successful CI.
- Production deployment uses exact-SHA checkout, dedicated migration execution, health waits, serialized deployment concurrency, and optional Slack failure notifications.

## Operational boundaries

- Local Docker volumes are persistent storage, not offsite backups.
- Database migrations are forward operations and are not automatically reversed during application rollback.
- Target-host access depends on SSH availability and correct operator-managed credentials.
- Some backup utilities are intentionally experimental and do not replace a tested disaster-recovery plan.
