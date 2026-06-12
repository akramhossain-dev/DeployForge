# 🔒 SSL_MANAGEMENT.md

DeployForge supports zero-configuration SSL issuance for custom domains by automating Certbot on target servers.

---

## 1. Let's Encrypt & Certbot
*   SSL certificates are issued by Let's Encrypt.
*   Upon domain verification, DeployForge executes `certbot` on the target server via SSH:
    `certbot --nginx -d {domainName} --non-interactive --agree-tos --email {user_email}`
*   Certbot automatically updates the corresponding server block configurations in `/etc/nginx/sites-available/` with SSL settings, references to the private key/certificate paths, and redirects HTTP (port 80) traffic to HTTPS (port 443).

---

## 2. DNS Checking Before Issuance
*   To avoid Let's Encrypt API rate limits caused by failing verification attempts, DeployForge executes a DNS check (`DomainService.verifyDNS`) before executing Certbot.
*   If the domain is not pointing to the VPS IP, the request is rejected with `INVALID_DNS_RECORD` without hitting Let's Encrypt.

---

## 3. Nginx Reloads & Status Sync
*   After Certbot completes certificate issuance, DeployForge triggers a server config test and reloads Nginx.
*   The database `Domain.sslStatus` is updated from `NONE` to `ISSUED`.
*   Any failures (e.g. Certbot timeouts, Nginx errors) are caught, written to the logs, and set the database status to `FAILED`.
