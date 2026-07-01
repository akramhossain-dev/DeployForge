# 🔌 DeployForge API Reference

The DeployForge backend is powered by a Fastify REST API and WebSocket gateway.

---

## 1. Global API Configuration

### 1.1 Authentication & CSRF
* **Cookies:** Authentication uses HttpOnly, secure cookies: `accessToken` (JWT) and `refreshToken` (opaque token).
* **CSRF Protection:** Non-safe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a CSRF token.
  1. Retrieve the CSRF token via `GET /auth/csrf` (sets a `csrfToken` cookie).
  2. Send the token value in every mutating request header: `X-CSRF-Token: <token>`.
  3. The backend validates the header against the cookie using timing-safe comparison.

### 1.2 Response Shapes

**Success:**
```json
{ "success": true, "data": { ... } }
```
**Error:**
```json
{
  "success": false,
  "error": { "code": "ERROR_CODE", "message": "Human-readable description" }
}
```

### 1.3 Common Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid access token |
| `FORBIDDEN` | 403 | Authenticated but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource (e.g., email already registered) |
| `VALIDATION_ERROR` | 400 | Invalid request payload |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## 2. Health & System (`/health`, `/live`, `/ready`, `/metrics`)

### `GET /live`
* Liveness probe — returns `200 OK` if the process is running.

### `GET /ready`
* Readiness probe — returns `200 OK` if database and Redis connections are healthy.

### `GET /health`
* Combined health status: returns JSON with API, database, and Redis states.

### `GET /metrics`
* Platform request counters and response-time percentiles.
* **Protected** by `Authorization: Bearer <METRICS_TOKEN>` in production.

---

## 3. Authentication API (`/auth`)

### `GET /auth/csrf`
Retrieve a double-submit CSRF token.
* **Auth:** None | **Rate Limit:** 60/min

### `POST /auth/register`
Register a new user account.
* **Auth:** None | **Rate Limit:** 10/min
* **Body:** `{ email, password, name, termsAccepted }`
* **Response:** `{ success, message, email }`

### `POST /auth/verify-otp`
Verify the email registration OTP.
* **Body:** `{ email, otp }`

### `POST /auth/resend-otp`
Resend the email verification OTP.
* **Body:** `{ email }`

### `POST /auth/login`
Authenticate and create a session.
* **Body:** `{ email, password }`
* **Sets Cookies:** `accessToken`, `refreshToken`

### `POST /auth/refresh`
Rotate tokens using the refresh cookie.
* **Auth:** `refreshToken` cookie | **Sets Cookies:** new `accessToken`, `refreshToken`

### `POST /auth/logout`
Terminate the current session.
* **Auth:** Required

### `GET /auth/me`
Get currently authenticated user details.
* **Auth:** Required | **Rate Limit:** 30/min

### `POST /auth/forgot-password`
Request a password-reset email.
* **Body:** `{ email }`

### `POST /auth/reset-password`
Reset password using token from email.
* **Body:** `{ token, password }`

---

## 4. Profile API (`/profile`)

### `GET /profile`
Get the current user's profile details (name, avatar, GitHub/Google links, verification status).
* **Auth:** Required

### `PUT /profile`
Update profile fields (name, username, avatar).
* **Auth:** Required
* **Body:** `{ name?, username?, avatarUrl? }`

### `PUT /profile/password`
Change the authenticated user's password.
* **Auth:** Required
* **Body:** `{ currentPassword, newPassword }`

---

## 5. Sessions API (`/sessions`)

### `GET /sessions`
List all active sessions for the current user.
* **Auth:** Required
* **Response:** Array of sessions with device, browser, OS, IP, and last activity.

### `DELETE /sessions/:id`
Revoke a specific session by ID.
* **Auth:** Required

### `DELETE /sessions`
Revoke all sessions except the current one.
* **Auth:** Required

---

## 6. VPS Management API (`/vps`)

### `POST /vps/add`
Add a new target VPS.
* **Auth:** Required | **Rate Limit:** 8/10 min
* **Body:** `{ name, ipAddress, port, username, authType, password?, privateKey? }`

### `GET /vps/list`
List all onboarded VPS instances for the current user.
* **Auth:** Required

### `GET /vps/:id`
Get details of a single VPS.
* **Auth:** Required

### `PUT /vps/:id`
Update VPS configuration (name, credentials).
* **Auth:** Required

### `DELETE /vps/:id`
Delete a VPS record.
* **Auth:** Required

### `POST /vps/test-connection`
Validate SSH connectivity to a stored VPS.
* **Auth:** Required
* **Body:** `{ id }`

### `GET /vps/:id/health`
Get the latest health record for a VPS (CPU, RAM, Disk, Docker status).
* **Auth:** Required

### `GET /vps/:id/metrics`
Get historical system metrics for a VPS.
* **Auth:** Required

---

## 7. Deployments API (`/deploy` & `/deployments`)

### `POST /deploy/github`
Deploy from a synced GitHub repository.
* **Auth:** Required
* **Body:** `{ vpsId, projectId, branch, env?, name?, port?, buildCommand?, startCommand?, type? }`

### `POST /deploy/upload`
Deploy via ZIP/tar.gz file upload.
* **Auth:** Required
* **Body:** Multipart form-data with `file`, `vpsId`, `projectId`, `name`, `env?`

### `POST /deploy/rollback/:id`
Rollback to a previous successful deployment version.
* **Auth:** Required

### `GET /deploy/:id/logs`
Get static deployment logs for a deployment.
* **Auth:** Required

### `GET /deployments`
List all deployments for the current user.
* **Auth:** Required

### `GET /deployments/:id`
Get full details of a single deployment including history and sandbox.
* **Auth:** Required

### `DELETE /deployments/:id`
Delete a deployment and remove its container from the VPS.
* **Auth:** Required

### `POST /deployments/:id/stop`
Stop a running deployment container without deleting it.
* **Auth:** Required

### `POST /deployments/:id/restart`
Restart a stopped or failed deployment.
* **Auth:** Required

---

## 8. Domain & SSL Management (`/domain`)

### `POST /domain/attach`
Attach a custom domain to a deployment.
* **Auth:** Required
* **Body:** `{ deploymentId, domainName }`

### `POST /domain/ssl/issue/:domainId`
Issue a Let's Encrypt SSL certificate for an attached domain.
* **Auth:** Required

### `GET /domain/list`
List all domains attached to the user's deployments.
* **Auth:** Required

### `DELETE /domain/:id`
Remove a domain and delete the Nginx config from the VPS.
* **Auth:** Required

---

## 9. GitHub Integration (`/auth/github`)

### `GET /auth/github`
Redirect to GitHub OAuth authorization page.

### `GET /auth/github/callback`
GitHub OAuth callback — exchanges code for token and links account.

### `GET /auth/github/repos`
List synced GitHub repositories for the authenticated user.
* **Auth:** Required

### `POST /auth/github/sync`
Manually sync the GitHub repository list.
* **Auth:** Required

### `POST /auth/github/disconnect`
Disconnect the GitHub OAuth account.
* **Auth:** Required

---

## 10. Google OAuth (`/auth/google`)

### `GET /auth/google`
Redirect to Google OAuth authorization page.

### `GET /auth/google/callback`
Google OAuth callback — exchanges code and creates/links account.

---

## 11. GitHub Webhooks (`/api/webhooks`)

### `POST /api/webhooks/github`
Receives GitHub push/PR webhook events. Validates `X-Hub-Signature-256` against `GITHUB_WEBHOOK_SECRET`.
* **Auth:** Webhook signature verification (not user auth)

---

## 12. Server Monitoring (`/monitor`)

### `GET /monitor/metrics/:vpsId`
Get CPU, RAM, and Disk metrics history for a VPS.
* **Auth:** Required
* **Response:** Array of `{ cpuUsage, memoryUsage, diskUsage, activeContainers, timestamp }`

---

## 13. Notifications (`/notifications`)

### `GET /notifications`
Get paginated notifications for the current user.
* **Auth:** Required
* **Query:** `?page=1&limit=20&unreadOnly=false`

### `PUT /notifications/:id/read`
Mark a single notification as read.
* **Auth:** Required

### `PUT /notifications/read-all`
Mark all notifications as read.
* **Auth:** Required

### `DELETE /notifications/:id`
Delete a notification.
* **Auth:** Required

---

## 14. Alert Settings (`/alert-settings`)

### `GET /alert-settings`
Get the current user's alert rule thresholds.
* **Auth:** Required
* **Response:** `{ cpuThreshold, ramThreshold, diskThreshold, swapThreshold, emailAlerts, browserAlerts, realtimeAlerts }`

### `PUT /alert-settings`
Update alert thresholds and preferences.
* **Auth:** Required
* **Body:** `{ cpuThreshold?, ramThreshold?, diskThreshold?, swapThreshold?, emailAlerts?, browserAlerts?, realtimeAlerts? }`

---

## 15. Sandbox (`/sandbox`)

### `GET /sandbox/:deploymentId`
Get the sandbox pre-flight analysis result for a deployment.
* **Auth:** Required
* **Response:** `{ score, status, issues, estimatedCPU, estimatedRAM, estimatedDisk }`

---

## 16. Web SSH Terminal (`/terminal` & `/ws`)

### `POST /terminal/token`
Generate a one-time token for establishing a WebSocket terminal session.
* **Auth:** Required
* **Body:** `{ vpsId }`
* **Response:** `{ token }` (short-lived, single-use)

### `WS /ws/terminal/:vpsId?token=<token>&cols=<N>&rows=<N>`
Establish an interactive SSH terminal session with the VPS.
* **Auth:** One-time query token from `POST /terminal/token`
* **Protocol:** Binary WebSocket frames forwarded to/from SSH shell.
* **Params:** `cols`, `rows` for initial terminal geometry.

---

## 17. File Manager API (`/file-manager`)

All endpoints require `Auth: Required` and target a specific `:vpsId`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/file-manager/:vpsId/info` | Connection status & home directory |
| `GET` | `/file-manager/:vpsId/list?path=` | List directory contents |
| `GET` | `/file-manager/:vpsId/read?path=` | Read file content |
| `GET` | `/file-manager/:vpsId/properties?path=` | File metadata, size, permissions |
| `GET` | `/file-manager/:vpsId/search?path=&query=&extension=` | Search files by name |
| `GET` | `/file-manager/:vpsId/download?path=` | Download file as binary |
| `POST` | `/file-manager/:vpsId/create` | Create file or folder `{ path, type }` |
| `PUT` | `/file-manager/:vpsId/save` | Save file content `{ path, content }` |
| `PUT` | `/file-manager/:vpsId/rename` | Move/rename `{ oldPath, newPath }` |
| `PUT` | `/file-manager/:vpsId/copy` | Copy `{ srcPath, dstPath }` |
| `DELETE` | `/file-manager/:vpsId/delete` | Bulk delete `{ paths: [] }` |
| `POST` | `/file-manager/:vpsId/upload?path=` | Upload file (multipart `file`) |
| `POST` | `/file-manager/:vpsId/compress` | Zip items `{ parentDir, paths, archiveName }` |
| `POST` | `/file-manager/:vpsId/decompress` | Extract zip `{ zipFilePath, destDir }` |

---

## 18. Admin API (`/admin`)

All admin endpoints require authentication as an `ADMIN` or `SUPER_ADMIN` role via the separate admin session.

### Auth
* `POST /admin/login` — Admin login with email/password.
* `POST /admin/logout` — Terminate admin session.
* `GET /admin/me` — Get current admin profile.

### User Management
* `GET /admin/users` — List all platform users (paginated).
* `GET /admin/users/:id` — Get a specific user's details.
* `PUT /admin/users/:id/role` — Change a user's role.
* `PUT /admin/users/:id/status` — Suspend or activate a user.
* `DELETE /admin/users/:id` — Permanently delete a user account.

### Platform Overview
* `GET /admin/stats` — Platform-wide stats: total users, deployments, VPS nodes, active sessions.

### Deployments
* `GET /admin/deployments` — List all deployments across all users.
* `DELETE /admin/deployments/:id` — Force-delete any deployment.

### Audit Logs
* `GET /admin/audit-logs` — Paginated audit log with filters by user, action, and date.

### Backup & Restore
* `POST /admin/backup` — Trigger a manual database backup.
* `GET /admin/backups` — List available backup files.
* `POST /admin/restore` — Restore from a backup file.

### Contact Messages
* `GET /admin/contact` — List all contact form submissions.
* `PUT /admin/contact/:id` — Update message status.

---

## 19. Public API (`/public`)

### `GET /public/stats`
Publicly accessible platform statistics (total users, deployments, servers — for landing page display).
* **Auth:** None

---

## 20. Projects & Collaboration API (`/projects`)

All routes require authentication (`Auth: Required`) and validate user ownership or membership role.

### `GET /projects`
Retrieve all projects the authenticated user owns or is a collaborator/member of.
* **Response:** Array of projects, including creator metadata, list of project members (with their user profiles and roles), and basic deployment status list.

### `GET /projects/:projectId/members`
Retrieve all active members and pending invitations for a specific project.
* **Response:** `{ members: [...], invites: [...] }`

### `POST /projects/:projectId/invites`
Invite a new collaborator to the project.
* **Role Check:** Only `OWNER` or `ADMIN` can invite.
* **Body:** `{ email, role }` where role must be one of `OWNER`, `ADMIN`, `DEVELOPER`, `VIEWER`.
* **Response:** `{ invite: { id, email, role, token, expiresAt, ... } }`

### `DELETE /projects/:projectId/invites/:inviteId`
Revoke a pending project invitation.
* **Role Check:** Only `OWNER` or `ADMIN`.

### `PATCH /projects/:projectId/members/:memberId`
Update the role of an existing project member.
* **Role Check:** Only `OWNER` or `ADMIN`. Project creator cannot be modified.
* **Body:** `{ role }`

### `DELETE /projects/:projectId/members/:memberId`
Remove a member from the project.
* **Role Check:** Users can remove themselves. `OWNER` or `ADMIN` can remove other members. Project creator cannot be removed.

---

## 21. Project Invitations API (`/invitations`)

For users managing invitations sent to them.

### `GET /invitations`
Retrieve all active, non-expired project invitations sent to the currently authenticated user's email.
* **Auth:** Required

### `POST /invitations/:inviteId/accept`
Accept a project invitation, adding the user as a project member with the invited role.
* **Auth:** Required

### `POST /invitations/:inviteId/decline`
Decline and delete the project invitation.
* **Auth:** Required
