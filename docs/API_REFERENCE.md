# 🔌 API_REFERENCE.md

## 1. Authentication

### `POST /auth/register`
- **Body**: `email`, `password`, `name`
- **Response**: `201` User object (sans password).

### `POST /auth/login`
- **Body**: `email`, `password`
- **Response**: `200` { `accessToken`, `refreshToken`, `user` }

### `GET /auth/github`
- Redirects to GitHub OAuth flow.

---

## 2. VPS Management

### `GET /vps`
- List all managed VPS instances for the current user.

### `POST /vps`
- **Body**: `name`, `ipAddress`, `sshPort`, `username`, `privateKey?`
- **Action**: Verifies connection and starts discovery.

### `GET /vps/:id/health`
- Returns real-time CPU, RAM, and Disk metrics.

---

## 3. Projects & Deployments

### `POST /projects`
- **Body**: `name`, `repositoryUrl`, `branch`, `framework?`.
- **Response**: New project object.

### `POST /projects/:id/deploy`
- **Body**: `vpsId`, `envOverrides?`.
- **Action**: Triggers the BullMQ deployment worker.

### `GET /deployments/:id/logs`
- **Response**: Stream or paginated lines of deployment build logs.

### `POST /deployments/:id/rollback`
- **Action**: Stops the current container and restarts the previously successful one.

---

## 4. GitHub Integration

### `GET /github/repos`
- Lists available repositories from the linked account.

### `POST /github/webhooks/setup`
- **Body**: `projectId`
- **Action**: Adds a webhook to the GitHub repository for push events.

---

## 5. System Status

### `GET /health`
- Basic API health check.

### `GET /stats/global`
- Dashboard metrics (total apps, uptime, active builds).
