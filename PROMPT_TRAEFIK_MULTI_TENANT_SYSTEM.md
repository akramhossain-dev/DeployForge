# Master AI Agent Prompt: Multi-Site Single-VPS Architecture (Traefik + Docker)

> **Instructions for the User**: Copy and paste the entire prompt below into any AI agent (Antigravity, Claude, Cursor, ChatGPT, Gemini, Copilot) when you want it to build, refactor, or verify a multi-tenant single-VPS deployment system.

---

```markdown
# Role & Mission
You are an expert Cloud Infrastructure & Systems Architect. Your mission is to implement a robust, production-grade Multi-Tenant / Multi-Site Deployment Engine for Linux VPS nodes using Docker, a shared external bridge network (`deployforge-net`), and a centralized Traefik v3 reverse proxy gateway.

---

## 1. Architectural Problem to Solve
In standard single-VPS deployment systems, attempting to host multiple distinct web applications on one VPS often fails due to:
1. **Port Collisions**: Projects trying to bind the same host ports (e.g. `-p 3000:3000` or `80:80`).
2. **Reverse Proxy Configuration Fragility**: Writing file-based Nginx `.conf` files where one syntax error breaks `nginx -t` and takes down reloads for all sites globally.
3. **SSL / Certbot In-Place Mutations**: `certbot --nginx` modifying configuration files in-place, leading to duplicate port 80/443 server blocks and reload failures.
4. **No-Domain Host Conflicts**: Multiple projects without custom domains colliding over `server_name <vps-ip>` on port 80.

---

## 2. Target System Architecture
You must implement a modern, label-driven PaaS architecture:

1. **VPS Ingress Gateway (Bootstrap Phase - Runs Once)**:
   - Verify/install Docker Engine and Docker Compose.
   - Create a persistent external Docker bridge network:
     `docker network create --driver bridge deployforge-net` (Subnet: `172.28.0.0/16`).
   - Run a persistent **Traefik v3** container (`deployforge-traefik`) listening on host ports `80` and `443`, with `/var/run/docker.sock` mounted and persistent ACME storage (`/etc/deployforge/traefik/acme/acme.json`, permissions `600`).
   - Traefik dynamically discovers backends using Docker labels and manages Let's Encrypt SSL automatically via HTTP-01 challenges.

2. **Container Runtime & Isolation (Zero Host Port Mappings)**:
   - **Never map host ports** (No `-p hostPort:appPort`).
   - Every deployed project container attaches to `--network deployforge-net`.
   - Traefik routes inbound HTTP/HTTPS traffic to the container using Docker container labels.
   - Internal ports (e.g. port 3000 for Node/Next.js, port 8000 for Python, port 80 for static Nginx) communicate directly over the virtual bridge network.

3. **Domain & Routing Strategy**:
   - **Custom Domain**: When a domain like `app.mycompany.com` is configured, route via:
     `traefik.http.routers.<router-name>.rule=Host(\`app.mycompany.com\`)`
   - **No Custom Domain (Magic DNS Fallback)**: Automatically assign a wildcard DNS hostname:
     `http://<project-slug>-<deployment-short-id>.<vps-ip>.sslip.io`
     (Because `sslip.io` resolves any embedded IP back to that IP automatically, Traefik receives valid HTTP Host headers and generates real Let's Encrypt certificates with zero manual DNS setup).

4. **Docker Compose Multi-Service Stacks**:
   - Generate a dynamic `docker-compose.deployforge.yml` override file that attaches the web/frontend service to `deployforge-net` and injects Traefik routing labels.
   - Databases (Postgres, MySQL, Redis) remain private on the compose default network and are never exposed to the host or internet.

5. **Static Site Hosting**:
   - Build static artifacts (dist/build/out) into `/home/<user>/deployforge/projects/<projectId>/static/<deploymentId>`.
   - Spin up a lightweight `nginx:alpine` micro-container mounting the static files, attached to `deployforge-net` with Traefik labels.

---

## 3. Core Implementation Checklist

### A. VPS Bootstrap Service
Implement a method `bootstrapVPS(ssh, vps)`:
- [ ] Create `/etc/deployforge/traefik/acme/acme.json` with `chmod 600`.
- [ ] Run `docker network create deployforge-net || true`.
- [ ] Launch `deployforge-traefik` if not already running:
  ```bash
  docker run -d \
    --name deployforge-traefik \
    --restart always \
    --network deployforge-net \
    -p 80:80 \
    -p 443:443 \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v /etc/deployforge/traefik/acme/acme.json:/acme.json \
    traefik:v3.1 \
    --global.sendAnonymousUsage=false \
    --api.dashboard=false \
    --providers.docker=true \
    --providers.docker.exposedbydefault=false \
    --providers.docker.network=deployforge-net \
    --entrypoints.web.address=:80 \
    --entrypoints.web.http.redirections.entrypoint.to=websecure \
    --entrypoints.web.http.redirections.entrypoint.scheme=https \
    --entrypoints.websecure.address=:443 \
    --certificatesresolvers.letsencrypt.acme.httpchallenge=true \
    --certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web \
    --certificatesresolvers.letsencrypt.acme.email=${ACME_EMAIL} \
    --certificatesresolvers.letsencrypt.acme.storage=/acme.json
  ```

### B. Deployment Service Execution
- [ ] Remove host port allocation logic (`getAvailablePort`, 3000-9000 port checking).
- [ ] Remove file-based Nginx `.conf` generation and reload commands.
- [ ] Update `deployContainer`:
  ```bash
  docker create \
    --name df-${projectId}-${deploymentId} \
    --restart unless-stopped \
    --network deployforge-net \
    --label "traefik.enable=true" \
    --label "traefik.http.routers.df-${projectId}.rule=Host(\`${effectiveDomain}\`)" \
    --label "traefik.http.routers.df-${projectId}.entrypoints=websecure" \
    --label "traefik.http.routers.df-${projectId}.tls=true" \
    --label "traefik.http.routers.df-${projectId}.tls.certresolver=letsencrypt" \
    --label "traefik.http.services.df-${projectId}.loadbalancer.server.port=${appPort}" \
    ${imageTag}
  ```
- [ ] Update `deployCompose`:
  - Dynamically write `docker-compose.deployforge.yml` declaring `deployforge-net` as external.
  - Inject labels onto the detected ingress service.
  - Run `docker compose -p df_${projectId} -f docker-compose.yml -f docker-compose.deployforge.yml up -d`.

### C. Domain & SSL Service
- [ ] Remove `certbot --nginx` CLI commands.
- [ ] Domain attachment updates the container's Traefik `Host(...)` label rule.
- [ ] Traefik automatically handles certificate issuance and auto-renewal.

---

## 4. Verification & Validation Steps
1. Deploy **Project A** on VPS (e.g. Next.js app listening on port 3000).
2. Deploy **Project B** on the same VPS (e.g. Fastify API also listening on port 3000).
3. Verify both projects run simultaneously without `PORT_IN_USE` errors.
4. Verify HTTPS routing works for both unique hostnames.
5. Stop/restart Project A and verify Project B suffers zero dropped packets or downtime.
```
