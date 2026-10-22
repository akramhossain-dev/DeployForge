# DeployForge Security

DeployForge is a privileged control plane: it stores infrastructure credentials,
opens remote sessions, and deploys workloads to target VPS hosts. Security depends
on application controls, host hardening, secret management, and disciplined release
operations working together.

## Identity and sessions

- User passwords are hashed with Argon2id.
- Access and refresh tokens have separate lifecycles; refresh sessions can be revoked.
- Registration, verification, and password-reset tokens are short-lived and single-purpose.
- Administrator authentication uses separate routes, secrets, roles, and lockout controls.
- Keep `JWT_SECRET`, `ADMIN_JWT_SECRET`, and `ADMIN_SECRET` independent and randomly generated.
- Revoke active sessions after password, role, or account-security changes.

## Request security

- Double-submit CSRF protection covers state-changing browser requests.
- Helmet security headers and endpoint-specific rate limits reduce common web attacks.
- Request schemas validate external input before it reaches service code.
- Prototype-pollution defenses reject dangerous object keys.
- Unexpected server errors return a sanitized response with a request ID; secrets and stack
  traces must stay out of client responses.
- GitHub webhooks require signature verification. Delivery IDs are recorded to prevent replay.

## Data protection

- Sensitive application values are encrypted with AES-256-GCM before database storage.
- `ENCRYPTION_KEY` must be exactly 64 hexadecimal characters and stored outside source control.
- `MASTER_KEY` and application authentication secrets must be generated independently.
- Logs and API responses must redact passwords, tokens, private keys, connection strings, and
  decrypted environment values.
- PostgreSQL is the source of truth. Back up both the database and the encryption key, but keep
  them in separate security domains.
- Never replace an encryption key until existing encrypted records have a tested re-encryption
  procedure.

## Project and tenant isolation

- Project membership and role checks must precede access to deployments, variables, domains,
  logs, and GitHub configuration.
- VPS, terminal, file-manager, deployment, and domain operations must verify resource ownership.
- Administrator privileges are platform-wide and must not be granted as a shortcut for normal
  project access.
- Review audit records after authentication, administrator, VPS, domain, secret, or deployment
  changes.

## SSH and remote execution

- Store SSH credentials encrypted and prefer dedicated deployment keys over personal keys.
- Normalize remote paths, reject traversal, and quote shell arguments before remote execution.
- Distributed locks must prevent concurrent operations from mutating the same deployment target.
- Candidate releases must pass health checks before traffic is switched.
- Untrusted Compose definitions must reject privileged mode, host networking, host bind mounts,
  Docker socket access, device mappings, added capabilities, and unmanaged external networks.

## Host baseline

- Keep the host OS, Docker Engine, and Compose plugin supported and patched.
- Permit only the required SSH port and public ports `80`/`443` through the firewall.
- Disable password-based SSH login after key access is verified.
- Use a restricted deployment user; do not share personal SSH keys with CI.
- Enable time synchronization and monitor authentication and system logs.
- Set production `.env` permissions to `0600` and restrict ownership to the deployment account.

## Secret handling

- Keep deployment credentials in the GitHub `production` environment, not repository variables or workflow source.
- Use independent random values for database, Redis, JWT, admin, encryption, webhook, OAuth, SMTP, and metrics credentials.
- Never print `.env`, private keys, tokens, database URLs, or decrypted values in CI output.
- Rotate a secret immediately after suspected disclosure.

## Network and container controls

The Compose stack separates traffic into these networks:

- `deployforge_internal`: internal PostgreSQL, Redis, migration, API, and worker traffic.
- `deployforge_proxy`: Nginx access to API and web without exposing those services directly on the host.
- `deployforge_dev`: compatibility network for local tooling; do not publish its internal service ports on the production firewall.

API, worker, and web containers run with a read-only root filesystem, dropped Linux capabilities, and `no-new-privileges`. Writable data is limited to declared volumes and temporary filesystems.

Only Nginx publishes host ports in the production profile. Do not add public PostgreSQL, Redis, API, or web port mappings for convenience.

DeployForge-managed application containers must remain attached only to the networks and storage
declared by the validated deployment configuration.

## TLS and domains

- Require HTTPS for production application and API URLs.
- Keep DNS under an account protected by MFA.
- Monitor certificate renewal and expiry.
- Validate Nginx configuration with `nginx -t` before reload.
- Keep OAuth callback URLs on the exact production HTTPS origin.

## GitHub deployment protection

- Protect `main` and require CI before merge.
- Add reviewers to the GitHub `production` environment for controlled releases.
- Configure `DEPLOY_HOST_FINGERPRINT` to pin the production host key.
- Use a deploy key with only the repository access it needs.
- Publish immutable annotated release tags; never force-update a production tag.
- Review database migrations for backward compatibility before tagging a release.

## Metrics and operational access

- Protect metrics endpoints with a strong `METRICS_TOKEN` bearer token.
- Use a dedicated SMTP credential or application password.
- Set `GOOGLE_OAUTH_ENABLED=false` when Google login is not configured.
- Review rate-limit and administrator lockout values against expected traffic.

## Backup security

- Encrypt backups before offsite transfer.
- Restrict backup files to the operator account.
- Keep database backups and encryption keys in separate security domains.
- Test recovery regularly; an untested backup is not a recovery plan.
- Never delete Docker volumes during routine image cleanup.

## Production checklist

- Required secrets are unique, valid, and absent from the repository and CI logs.
- HTTPS is enforced and certificates renew successfully.
- OAuth callback URLs exactly match the production HTTPS origin.
- `METRICS_TOKEN`, webhook signing, CSRF protection, and rate limits are enabled.
- PostgreSQL, Redis, API, worker, and web ports are not publicly exposed.
- The production host key is pinned with `DEPLOY_HOST_FINGERPRINT`.
- A recent encrypted backup and a tested recovery procedure exist.
- CI passed for the exact release SHA and the immutable tag points to `main`.

## Pre-release checklist

- CI passed for the exact release SHA.
- The tag points to a commit on `main`.
- Production secrets and OAuth callbacks are valid.
- A recent verified database backup exists.
- Compose validation and image builds pass.
- Database migrations were reviewed for backward compatibility.
- `/live` and `/ready` return HTTP 200 after deployment.
- HTTPS and certificate validity are confirmed externally.
