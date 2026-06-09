# ⚙️ DEPLOYMENT_ENGINE.md

## 1. Engine Core (Dockerode + SSH)

DeployForge uses a hybrid approach to manage remote servers. It connects over SSH but uses the Docker API to manage containers.

### 1.1 Remote Execution
1.  **SSH Tunneling**: Instead of exposing the Docker daemon port to the public internet, DeployForge creates an SSH tunnel:
    `Local Port 2375 -> SSH Gateway -> Remote Docker Socket (/var/run/docker.sock)`
2.  **Dockerode Integration**: The engine uses the `dockerode` library to interact with the tunneled socket as if it were local.

---

## 2. The Build Process

### 2.1 Framework Detection logic
The engine scans the repository for key files:
- `next.config.js` -> **NEXT.JS**
- `package.json` + `server.js` -> **NODE.JS**
- `manage.py` -> **DJANGO**
- `composer.json` -> **LARAVEL**

### 2.2 Build Strategies
- **Local Builder**: Build the image on the DeployForge Control Plane, then push to a private registry or directly to the target VPS. (Best for consistency).
- **Remote Builder**: Build directly on the target VPS using the available resources. (Best for saving bandwidth).

---

## 3. Port & Resource Management

### 3.1 Dynamic Port Allocation
- DeployForge maintains a map of used ports on each VPS.
- New apps are assigned the next available port in the 3000-4000 range.
- Port conflicts are detected *before* deployment starts by checking active listening sockets via SSH.

### 3.2 Resource Limits
Every container is started with implicit constraints:
- `MemoryLimit`: default 512MB
- `CpuShares`: default 1024
- `RestartPolicy`: `unless-stopped`

---

## 4. Zero-Downtime Strategy

1.  **Blue-Green Prep**: Start the *New* container on a different port.
2.  **Health Check**: Wait for the *New* container to return HTTP 200 on its internal port.
3.  **Handoff**: Update Nginx upstream to point to the *New* port.
4.  **Cleanup**: Stop and remove the *Old* container after a 30-second drain period.

---

## 5. Deployment Sandbox

The **Sandbox** validates the environment before deployment:
- **Port Check**: Is the designated port free?
- **Disk Check**: Is there enough space for the new image?
- **Registry Check**: Are the credentials for pulling images valid?
- **Env Check**: Are all required environment variables provided?
