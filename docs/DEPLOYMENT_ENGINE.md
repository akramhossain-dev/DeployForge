# ⚙️ DEPLOYMENT_ENGINE.md

DeployForge uses a hybrid container orchestration engine. It connects to target VPS nodes over SSH and manages container state by issuing shell commands or tunneling communication to the remote Docker daemon.

---

## 1. Engine Core (Docker & SSH)
*   **Agentless Shell Execution:** The backend runs commands on target nodes over an SSH channel established by the `SSHService` wrapper class.
*   **File Transfer:** Upload-based deployments transfer ZIP/TAR archives from the Control Plane to target servers via SFTP, unpack them, and build the Docker image locally on the VPS.
*   **Dockerode Integration:** Connects to target Docker daemons over an SSH-tunneled socket `/var/run/docker.sock` to control container lifecycles programmatically.

---

## 2. The Build Process

### 2.1 Framework Detection Logic
When code is retrieved, the engine scans root configurations to identify the application type:
*   `next.config.js` or `next.config.mjs` -> **NEXT.JS**
*   `package.json` + `server.js` -> **NODE.JS (Express/Fastify)**
*   `package.json` + `astro.config.mjs` -> **ASTRO (Static)**
*   `package.json` + `vite.config.ts` / `vite.config.js` -> **VITE_REACT / VITE (Static)**
*   `manage.py` -> **DJANGO (Python)**
*   `composer.json` -> **LARAVEL (PHP)**

### 2.2 Containerization & Nixpacks
*   If a custom `Dockerfile` exists in the repository, the engine builds the image directly.
*   If no `Dockerfile` is present, it uses **Nixpacks** (or equivalent builder images) to analyze dependencies and automatically generate the container configuration.

---

## 3. Port & Resource Management

### 3.1 Dynamic Port Allocation
*   DeployForge scans target servers to map active listening sockets.
*   New containers are assigned the next free port starting from the `3000-4000` range.
*   Potential port conflicts are checked via SSH before container startup is triggered.

### 3.2 Resource Constraints
Containers are ran with resource limits:
*   **Memory limits:** Default constraints set to `512MB` unless configured otherwise.
*   **CPU Shares:** Default limits map to standard allocations.
*   **Restart policies:** Configured to `unless-stopped` to survive server restarts.

---

## 4. Zero-Downtime Strategy (Blue-Green)
1.  **Parallel Startup:** The *new* container version is started on an alternate free port.
2.  **Health Verification:** The control plane queries the *new* container's internal port to verify it returns HTTP `200`.
3.  **Proxy Switch:** Nginx configuration blocks are rewritten to forward requests to the *new* container port, and Nginx is reloaded.
4.  **Draining & Clean:** The *old* container is kept active for a brief draining window, then stopped and deleted.
