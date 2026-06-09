# 🏗️ ARCHITECTURE.md

## 1. System Overview

DeployForge is designed as a distributed orchestration platform. It separates the Control Plane (DeployForge API & Dashboard) from the Data Plane (User VPS instances).

### High-Level Diagram

```mermaid
graph TD
    User((User)) -->|HTTPS| WebApp[Next.js Frontend]
    WebApp -->|API| API[Fastify Backend]
    
    subgraph Control Plane
        API --> DB[(PostgreSQL)]
        API --> Cache[(Redis)]
        API --> Queue[BullMQ Workers]
    end
    
    subgraph Integration
        API <--> GitHub[GitHub API/Webhooks]
    end
    
    subgraph Data Plane (User VPS)
        Queue -->|SSH/Dockerode| VPS1[User VPS 1]
        Queue -->|SSH/Dockerode| VPS2[User VPS 2]
        VPS1 -->|Docker| Containers[App Containers]
        VPS1 -->|Nginx| Proxy[Reverse Proxy + SSL]
    end
```

---

## 2. Component Architecture

### 2.1 Control Plane (The Brain)
- **Fastify API**: Handles all business logic, authentication, and orchestration commands.
- **BullMQ Workers**: Handles asynchronous tasks like building Docker images, deploying to remote servers, and health checks.
- **Prisma/PostgreSQL**: Stores user data, VPS credentials (encrypted), deployment history, and application state.
- **Redis**: Acts as the message broker for BullMQ and session cache.

### 2.2 Data Plane (The Muscle)
- **Agentless Architecture**: DeployForge communicates with target VPS instances over SSH. No agent installation is required on the user's server, only Docker and Nginx (which DeployForge can auto-install).
- **Dockerode**: Used to interact with the Docker Remote API (over SSH tunnel) to manage container lifecycles.
- **Nginx Manager**: Dynamically updates upstream configurations for new deployments and handles SSL termination.

---

## 3. Communication Flows

### 3.1 Deployment Flow
1. **Trigger**: GitHub Webhook or manual "Deploy" click.
2. **Queueing**: API creates a job in BullMQ.
3. **Execution**:
    - Worker pulls the latest code (via SSH or GitHub API).
    - Worker builds a Docker image (either locally or on target VPS).
    - Worker pushes/starts the container on the target VPS.
    - Worker verifies health check.
4. **Proxy Update**: Worker updates Nginx config on the VPS to point the domain to the new container port.
5. **SSL**: If configured, Certbot is triggered to issue/renew certificates.

### 3.2 Monitoring Flow
1. **Scheduler**: A cron job triggers every minute.
2. **Collection**: Worker connects to each VPS via SSH.
3. **Execution**: Runs lightweight commands (`docker stats`, `df`, `top`) to collect metrics.
4. **Storage**: Metrics are stored in PostgreSQL/Redis for dashboard visualization.

---

## 4. Key Design Patterns

- **Monorepo (Turbo/pnpm)**: Unified codebase for apps and shared packages.
- **Security-by-Design**: Encryption of all sensitive data at rest and in transit.
- **Event-Driven**: Extensive use of BullMQ for non-blocking operations.
- **Modular Packages**: Shared logic for GitHub, VPS, and Deployment to ensure reusability.
