# DeployForge Project Overview

DeployForge is a self-hosted deployment control plane for running applications on operator-owned virtual private servers. It connects to target servers over SSH, builds and validates application releases, manages routing and TLS, and exposes deployment, monitoring, administration, and collaboration workflows through a web dashboard.

## Product goals

- Keep application workloads and infrastructure under the operator's control.
- Provide repeatable deployments without installing a proprietary agent on each VPS.
- Validate builds and candidate releases before switching production traffic.
- Centralize server access, environment variables, domains, logs, monitoring, and release history.
- Apply strict tenant, project, and administrator authorization boundaries.
- Keep production delivery auditable through CI-gated immutable release tags.

## Platform model

### Control plane

The DeployForge installation is the control plane. Its main services are:

- `web`: Next.js dashboard and public product pages.
- `api`: Fastify REST and WebSocket server.
- `worker`: asynchronous deployment and infrastructure jobs.
- `postgres`: users, projects, deployments, releases, audit records, and encrypted configuration.
- `redis`: queues, distributed locks, caches, sessions, and real-time coordination.
- `nginx`: production HTTP/TLS entry point.

The control plane is deployed with Docker Compose. PostgreSQL and Redis use persistent volumes; application containers are rebuilt from the selected release.

### Data plane

Target VPS nodes are the data plane. DeployForge uses stored encrypted SSH credentials to inspect and prepare the host, build containers, create isolated Docker networks, validate candidate releases, configure ingress, collect metrics, and perform controlled lifecycle operations.

No DeployForge agent is installed on a target VPS. The target must provide SSH and the required container/runtime tooling.

## Main workflows

1. A user connects a GitHub account or uploads an application archive.
2. A project and deployment are assigned to a target VPS.
3. DeployForge detects the application runtime and validates resource and Compose policy.
4. The worker builds an immutable candidate release on the target server.
5. Health checks run before the release becomes active.
6. The ingress route switches to the validated release.
7. Release history and the previous runtime remain available for controlled rollback.

DeployForge also supports server bootstrap, runtime preparation, environment history, domain verification, real-time logs, notifications, team invitations, file management, and administrative operations.

## Repository map

```text
DeployForge/
├── apps/
│   ├── api/                 Fastify API, workers, queues, and deployment engine
│   └── web/                 Next.js dashboard and public interface
├── packages/
│   ├── database/            Prisma client
│   ├── mail/                SMTP transport and templates
│   ├── security/            Password, token, and encryption helpers
│   ├── shared/              Shared schemas, types, and validation
│   └── vps/                 SSH and SFTP utilities
├── prisma/                  Database schema and migrations
├── docker/                  Production images and Nginx configuration
├── docs/                    Project and production documentation
└── .github/workflows/       CI and tagged production delivery
```

## Documentation

- [FEATURES.md](FEATURES.md): supported product capabilities.
- [ARCHITECTURE.md](ARCHITECTURE.md): services, networks, data, and deployment flows.
- [API.md](API.md): API conventions and route inventory.
- [SETUP.md](SETUP.md): local setup, production deployment, releases, and operations.
- [SECURITY.md](SECURITY.md): application, host, secrets, and deployment controls.

Contribution workflow and coding standards remain in the root [CONTRIBUTING.md](../CONTRIBUTING.md).
