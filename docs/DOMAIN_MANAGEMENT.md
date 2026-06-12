# 🌐 DOMAIN_MANAGEMENT.md

DeployForge automates domain routing by managing Nginx configurations on user VPS targets.

---

## 1. Nginx Reverse Proxy Mappings
*   When a user deploys a container, it runs on an ephemeral port (e.g., `3001`, `3002`).
*   To expose the deployment, DeployForge creates an Nginx server block configuration file in:
    `/etc/nginx/sites-available/df-{deploymentId}`
*   It configures Nginx to listen on port `80` (and `443` if SSL is active) and proxy incoming headers/requests to `http://127.0.0.1:{containerPort}`.
*   DeployForge links the configuration to `/etc/nginx/sites-enabled/` and tests/reloads Nginx:
    `nginx -t && systemctl reload nginx`

---

## 2. DNS Record Verification
Before mapping custom domains, users must point their domain's DNS `A` record to the target VPS IP address.
*   The `DomainService.verifyDNS` method queries the target hostname against the public DNS resolution tables.
*   If the DNS check returns an IP address matching the VPS IP address, DNS verification passes.
*   This prevents routing configuration errors and avoids Certbot rate-limit blocks during SSL setup.

---

## 3. Ephemeral Port Mappings
*   **Static Sites:** For static deployments, Nginx is configured to serve the build output files directly from the deployment directory on the VPS (mapped under `/site/{deploymentId}/` or the custom domain path).
*   **Server Sites:** Server-based applications are mapped through an active listening port.
*   **Conflict Prevention:** Port mappings are verified via netstat queries before configuring the Nginx upstream targets.
