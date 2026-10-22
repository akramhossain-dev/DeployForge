# DeployForge Architecture

## System topology

```text
Browser
   |
 HTTPS
   v
Nginx ----> Web
   |
   +------> API ----> PostgreSQL
              |----> Redis/BullMQ ----> Worker
              |                         |
              +-------------------------+
                         SSH/SFTP
                            |
                     Target VPS nodes
```

The control plane and target VPS nodes are separate trust zones. Control-plane state is stored in PostgreSQL and Redis. Application builds and runtimes execute on the selected target VPS.

## Control-plane services

| Service | Responsibility |
| --- | --- |
| `nginx` | Public ports 80/443, ACME challenge handling, TLS termination, API/WebSocket proxying, and web routing. |
| `web` | Next.js dashboard, authentication UI, administration, deployments, domains, monitoring, terminal, and file manager. |
| `api` | HTTP/WebSocket endpoints, authorization, validation, persistence, orchestration, and audit logging. |
| `worker` | BullMQ jobs for deployments and long-running infrastructure operations. |
| `migrate` | One-shot Prisma migration image used before application restart. |
| `postgres` | Durable relational state and release history. |
| `redis` | Queue transport, distributed deployment locks, session/cache data, and event coordination. |

## Compose networks and storage

- `deployforge_internal` is an internal network for database, Redis, migration, API, and worker traffic.
- `deployforge_proxy` connects Nginx to API and web without publishing their ports on the host.
- `deployforge_dev` supports local tooling and compatibility; production firewalls must not expose its internal services.
- `postgres_data`, `redis_data`, `backup_data`, `certbot_webroot`, and `certbot_certs` are persistent volumes.

API, worker, and web use read-only root filesystems, dropped Linux capabilities, `no-new-privileges`, and explicitly declared writable volumes or temporary filesystems.

## Application layers

### API

Fastify registers route modules by domain: authentication, profile, sessions, VPS management, deployments, projects, domains, monitoring, runtime preparation, terminal, file manager, notifications, alerts, webhooks, and administration.

Business logic lives under `apps/api/src/services`. Deployment execution is split into detection, build, Compose policy, validation, release, routing, rollback, resource policy, and maintenance services. The worker consumes queued jobs without duplicating HTTP request handling.

### Web

The Next.js App Router separates public, authenticated, and administrator surfaces. Shared API hooks and clients handle session-aware requests, while WebSocket connections provide live deployment status, logs, notifications, and terminal traffic.

### Shared packages

Workspace packages keep Prisma access, SSH/SFTP, cryptography, mail, and shared validation independent from API and UI route code. Turbo coordinates dependency-aware build, typecheck, test, and lint tasks.

## Deployment flow

1. Validate the request, project access, target server, configuration, and resource policy.
2. Acquire a distributed project/deployment lock.
3. Prepare the workspace and obtain source code or uploaded content.
4. Detect runtime, framework, package manager, build command, start command, and application port.
5. Build a release or sanitize a user-provided Compose definition.
6. Create a private candidate network and candidate runtime.
7. Probe candidate health without sending public traffic.
8. Persist release metadata and atomically update the ingress route.
9. Mark the release active and retain the previous release for rollback.
10. Emit logs, status events, notifications, and audit records.

Failures before route switching leave the active release unchanged. Failures after a routing operation invoke the deployment error and recovery path.

## Production release flow

The GitHub CD workflow runs only for `v*.*.*` tags. It verifies that the tagged SHA belongs to `main` and has a successful completed CI push run. The VPS then fetches the exact tag, verifies its SHA, validates Compose, builds images, starts PostgreSQL/Redis, runs the migration container, and restarts API/worker/web with health waits.

Nginx and Certbot use the Compose `production` profile and persist certificates independently from routine application releases.

## Health and observability

- `/live`, `/health`, and `/liveness` verify that the API process responds.
- `/ready` and `/readiness` check PostgreSQL and Redis dependencies.
- `/metrics` exposes application metrics and supports bearer-token protection.
- Deployment logs are persisted and streamed over WebSockets.
- VPS health, live metrics, history, and environment scans are available through dedicated routes.

## Data and recovery boundaries

PostgreSQL is the source of truth for platform state. Redis is operational coordination state and must not be treated as the only copy of durable data. Docker volumes survive application image replacement but are not offsite backups. Production recovery therefore requires verified PostgreSQL backups, protected encryption keys, and tested restore procedures.
