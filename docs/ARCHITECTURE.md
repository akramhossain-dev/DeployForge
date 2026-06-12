# 🏗️ ARCHITECTURE.md

## 1. System Overview
DeployForge is structured around a Control Plane (DeployForge API & Next.js dashboard) and a Data Plane (User VPS instances). The Control Plane handles authentication, user settings, metadata storage, repository syncing, and build orchestration. The Data Plane hosts the actual running application containers and routes domain names through Nginx.

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
        Queue -->|SSH Command / Tunnel| VPS1[User VPS 1]
        VPS1 -->|Docker| Containers[App Containers]
        VPS1 -->|Nginx| Proxy[Reverse Proxy + SSL]
    end
```

---

## 2. Component Architecture

### 2.1 Control Plane
- **Next.js Web App (`apps/web`):** Built with React 18, Tailwind CSS, and lucide icons. Handles the visual presentation layer.
- **Fastify API Server (`apps/api`):** Built with Fastify. Houses the core orchestration engines in its `src/services` directory:
  - `auth.service.ts` / `account.service.ts`: Handles secure authentication, active user session tables verification, password changes, and paginated security logging.
  - `vps.service.ts` / `monitoring.service.ts`: Performs SSH credential validation, target discovery, and asynchronous metrics polling.
  - `deployment.service.ts` / `sandbox.service.ts`: Runs framework detection, allocates ports, scores package builds, and triggers container deployments.
  - `domain.service.ts` / `rollback.service.ts`: Updates domain routes on target servers, runs DNS checks, and handles container reversion on failure.
- **BullMQ Workers:** Processes background tasks asynchronously (e.g. executing deployment scripts, running health checks).
- **Redis:** Serves as the BullMQ broker and caching layer.
- **Prisma & PostgreSQL:** Database store for schemas including Users, Sessions, Projects, Deployments, Domains, VPS, SystemMetrics, and Security Logs.

### 2.2 Data Plane
- **Agentless Orchestration:** DeployForge communicates with remote VPS hosts over secure SSH connections using the `ssh2` library. No custom daemon or agent is installed on the user's host.
- **Docker API & Containers:** The control plane executes Docker commands over the SSH channel to build, run, pause, resume, and stop containers.
- **Nginx & SSL Configuration:** DeployForge generates upstream block configurations on the remote Nginx instance and coordinates Certbot Let's Encrypt certificates over SSH.

---

## 3. Communication Flows

### 3.1 Deployment Flow
1. **Trigger:** A GitHub webhook event (push) or manual deployment request.
2. **Queueing:** API queues a task in BullMQ.
3. **Build & Prepare:** The worker detects the application framework, configures environment variables, and builds a Docker image.
4. **Startup & Handoff (Blue-Green):** The worker runs the container on a new port, checks health, updates Nginx reverse proxy blocks, and stops the old container.
5. **SSL Provisioning:** If custom domains are attached, Certbot issues SSL configuration blocks on Nginx.

### 3.2 Metrics Collection Flow
1. **Poller Scheduler:** Periodic cron checks.
2. **Collection:** Connects to each active VPS over SSH, running `df`, `top`, or `docker stats` commands.
3. **Database Sink:** Saves metrics snapshots in PostgreSQL for visualization.
