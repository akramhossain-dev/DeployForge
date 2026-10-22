# DeployForge API Reference

The Fastify API listens on `PORT` (`3001` by default). In the production Compose stack, Nginx proxies API and WebSocket traffic through the public HTTPS origin.

## Conventions

### Authentication

Protected routes require a valid user or administrator session. Browser state-changing requests also require the CSRF token issued by `GET /auth/csrf`. GitHub webhooks use their HMAC signature instead of a user session.

WebSocket routes use the socket-token flow or an authenticated session as implemented by the route. Tokens must not be placed in logs or persisted by clients.

### Response and error shape

Most successful HTTP operations return:

```json
{
  "success": true,
  "data": {}
}
```

Errors use a stable code, message, and request correlation identifier:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe client message",
    "requestId": "request-id"
  }
}
```

Validation and authorization failures use 4xx responses. Unexpected internal failures are sanitized before returning HTTP 500.

## Health and system

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/live`, `/health`, `/liveness` | API process liveness. |
| `GET` | `/ready`, `/readiness` | PostgreSQL and Redis readiness; returns 503 when unavailable. |
| `GET` | `/metrics` | Application metrics; bearer token required when `METRICS_TOKEN` is set. |

The same handlers are also available under `/api/live`, `/api/health`, `/api/liveness`, `/api/ready`, `/api/readiness`, and `/api/metrics`.

## Authentication, profile, and sessions

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/auth/csrf` | Issue CSRF token/cookie. |
| `POST` | `/auth/register` | Create a user registration. |
| `POST` | `/auth/verify-otp` | Verify registration OTP. |
| `POST` | `/auth/login` | Create an authenticated session. |
| `POST` | `/auth/refresh` | Rotate/refresh the session. |
| `POST` | `/auth/logout` | End the current session. |
| `GET` | `/auth/me` | Return the current user. |
| `GET` | `/auth/socket-token` | Issue a short-lived WebSocket token. |
| `POST` | `/auth/forgot-password` | Request password reset. |
| `POST` | `/auth/reset-password` | Complete password reset. |
| `POST` | `/auth/send-verification` | Send an email verification message. |
| `POST` | `/auth/verify-email` | Verify an email token. |
| `GET`, `PATCH` | `/profile` | Read or update the current profile. |
| `POST` | `/profile/change-password` | Change password. |
| `GET`, `PATCH` | `/profile/preferences` | Read or update preferences. |
| `GET` | `/profile/audit-logs` | List account audit events. |
| `DELETE` | `/profile` | Delete the current account. |
| `GET` | `/sessions` | List active sessions. |
| `DELETE` | `/sessions/:id` | Revoke one session. |
| `DELETE` | `/sessions/logout-others` | Revoke all sessions except the current one. |
| `DELETE` | `/sessions/logout-all` | Revoke all sessions. |

## OAuth and GitHub

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/auth/github` | Begin GitHub login. |
| `GET` | `/auth/github/connect` | Begin GitHub connection for an authenticated user. |
| `GET` | `/auth/github/callback` | GitHub OAuth callback. |
| `GET` | `/auth/github/profile` | Connected GitHub profile. |
| `GET` | `/auth/github/repos` | List synchronized repositories. |
| `POST` | `/auth/github/repos/sync` | Synchronize repositories. |
| `POST` | `/auth/github/webhooks/create` | Create repository webhook. |
| `DELETE` | `/auth/github/disconnect` | Disconnect GitHub. |
| `GET` | `/auth/google` | Begin Google login. |
| `GET` | `/auth/google/callback` | Google OAuth callback. |
| `POST` | `/api/webhooks/github` | Receive signed GitHub webhook deliveries. |

## VPS and runtime management

All VPS routes are under `/vps` unless shown otherwise.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/vps/add` | Add a target VPS. |
| `POST` | `/vps/test-connection` | Test supplied connection details. |
| `GET` | `/vps/list` | List accessible VPS records. |
| `GET`, `PATCH`, `DELETE` | `/vps/:id` | Read, update, or remove a VPS. |
| `GET` | `/vps/:id/health` | Stored health records. |
| `POST` | `/vps/:id/health-check` | Trigger health collection. |
| `POST` | `/vps/:id/bootstrap` | Queue gateway/bootstrap preparation. |
| `GET` | `/vps/:id/operations/:operationId` | Read operation status. |
| `GET` | `/vps/:id/info` | System information. |
| `GET` | `/vps/:id/live-metrics` | Current resource metrics. |
| `GET` | `/vps/:id/environment` | Runtime/environment inventory. |
| `POST` | `/vps/:id/install-runtime` | Install a selected runtime. |
| `GET` | `/vps/:id/installation-logs` | Runtime installation logs. |
| `GET` | `/vps/:id/history` | Historical resource usage. |
| `POST` | `/runtime/:vpsId/prepare` | Prepare required deployment runtimes. |
| `GET` | `/runtime/:vpsId/preflight` | Runtime readiness plan. |
| `GET` | `/runtime/runtimes` | Supported runtime catalog. |

## Deployments

Deployment creation and legacy lifecycle routes use `/deploy`; project/release management uses `/deployments`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/deploy/github` | Create deployment from GitHub. |
| `POST` | `/deploy/upload` | Create deployment from archive upload. |
| `GET` | `/deploy/list` | List deployments. |
| `GET` | `/deploy/:id/logs` | Read deployment logs. |
| `GET` | `/deploy/:id/logs/stream` | WebSocket log stream. |
| `GET` | `/deploy/status/:id` | Deployment status. |
| `POST` | `/deploy/rollback/:id` | Roll back a deployment. |
| `POST` | `/deploy/:id/start`, `/deploy/:id/stop` | Legacy lifecycle actions. |
| `GET` | `/deployments` | List project deployments. |
| `GET` | `/deployments/analytics` | Deployment analytics. |
| `GET` | `/deployments/:id` | Deployment detail and releases. |
| `GET`, `PUT` | `/deployments/:id/env` | Read or update environment files. |
| `GET` | `/deployments/:id/env/history` | Environment revision history. |
| `POST` | `/deployments/:id/redeploy` | Build another release. |
| `POST` | `/deployments/:id/rollback` | Activate a retained release. |
| `POST` | `/deployments/:id/restart`, `/start`, `/stop`, `/pause`, `/resume` | Lifecycle actions. |
| `DELETE` | `/deployments/:id` | Delete a deployment through its cleanup policy. |
| `POST` | `/sandbox/analyze/:deploymentId` | Run pre-flight analysis. |
| `GET` | `/sandbox/:deploymentId/result` | Read analysis result. |
| `POST` | `/sandbox/validate-deploy/:deploymentId` | Validate sandbox deployment. |

## Domains and monitoring

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/domain/attach` | Attach a domain. |
| `DELETE` | `/domain/remove/:domainId` | Remove a domain. |
| `POST` | `/domain/ssl/issue/:domainId` | Issue TLS certificate. |
| `POST` | `/domain/auto-https/:domainId` | Configure automatic HTTPS. |
| `GET` | `/domain/list` | List domains. |
| `GET` | `/domain/subdomains/:deploymentId` | List deployment subdomains. |
| `GET` | `/domain/verify-dns/:domainName` | Verify DNS resolution. |
| `GET` | `/monitor/logs/:deploymentId` | Deployment logs. |
| `GET` | `/monitor/metrics/:vpsId` | VPS metrics. |
| `POST` | `/monitor/metrics/:vpsId/collect` | Trigger metric collection. |
| `GET` | `/monitor/history/:deploymentId` | Deployment history. |
| `POST` | `/monitor/rollback/:deploymentId` | Monitoring rollback action. |

## Projects and invitations

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/projects` | List accessible projects. |
| `GET` | `/projects/:projectId/members` | Project membership. |
| `POST` | `/projects/:projectId/invites` | Invite a member. |
| `DELETE` | `/projects/:projectId/invites/:inviteId` | Cancel invitation. |
| `PATCH`, `DELETE` | `/projects/:projectId/members/:memberId` | Change role or remove member. |
| `GET` | `/invitations` | List received invitations. |
| `POST` | `/invitations/:inviteId/accept` | Accept invitation. |
| `POST` | `/invitations/:inviteId/decline` | Decline invitation. |

## Notifications and alert settings

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/notifications` | Paginated notifications. |
| `GET` | `/notifications/unread-count`, `/recent` | Notification summaries. |
| `PATCH` | `/notifications/:id/read`, `/read-all` | Mark notifications read. |
| `DELETE` | `/notifications/:id`, `/all` | Delete one or all notifications. |
| `GET`, `PATCH` | `/alert-settings` | Read or update alert thresholds/channels. |

## File manager

Routes are scoped by `/file-manager/:vpsId`:

- `GET /info`, `/list`, `/read`, `/properties`, `/search`, `/download`, `/download-zip`
- `POST /create`, `/upload`, `/compress`, `/decompress`
- `PUT /save`, `/rename`, `/copy`
- `DELETE /delete`

Path normalization and VPS authorization are enforced server-side. Clients must not assume arbitrary filesystem access.

## WebSockets

| Path | Description |
| --- | --- |
| `WS /terminal/:vpsId` | Interactive SSH terminal. |
| `WS /ws/deployments/:id/logs` | Live deployment logs. |
| `WS /ws/deployments/:id/status` | Live deployment state. |
| `WS /ws/notifications` | Real-time user notifications. |

## Administration and public endpoints

- `POST /contact` submits the public contact form.
- `GET /public/stats` returns public platform statistics.
- `/admin/login`, `/logout`, and `/me` manage the separate administrator session.
- `/admin/users`, `/platform-users`, `/projects/:projectId/resource-policy`, `/deployments`, `/vps`, `/github/accounts`, `/monitoring`, `/logs`, `/settings`, and `/backups` expose role-gated administration operations.

Administrator routes enforce moderator, administrator, or super-administrator access per operation. Destructive administration calls must not be exposed to ordinary user sessions.
