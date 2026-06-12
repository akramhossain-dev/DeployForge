# 🔌 API_REFERENCE.md

DeployForge backend routes support both base routes and `/api/*` prefixes (e.g. `/auth/login` and `/api/auth/login`). All authenticated requests must provide a signed JWT Bearer Token in the `Authorization` header.

---

## 1. Authentication (`/auth` or `/api/auth`)

### `POST /register`
- **Body:** `{ email, password, name, termsAccepted: true }`
- **Response:** `200` `{ success: true, message: string, email: string }` (Returns a development OTP if SMTP is disabled)

### `POST /verify-otp`
- **Body:** `{ email, otp }`
- **Response:** `200` `{ message: 'Email verified successfully' }`

### `POST /login`
- **Body:** `{ email, password }`
- **Response:** `200` `{ user, accessToken, refreshToken }`

### `POST /refresh`
- **Body:** `{ refreshToken }`
- **Response:** `200` `{ accessToken, refreshToken }`

### `POST /logout`
- **Body:** `{ refreshToken }`
- **Response:** `200` `{ message: 'Logged out successfully' }`

### `GET /me`
- **Auth:** Required
- **Response:** `200` `{ user: User }`

### `POST /forgot-password`
- **Body:** `{ email }`
- **Response:** `200` `{ success: true, message: string }`

### `POST /reset-password`
- **Body:** `{ token, password }`
- **Response:** `200` `{ success: true, message: string }`

### `POST /send-verification`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: string }`

### `POST /verify-email`
- **Body:** `{ token }`
- **Response:** `200` `{ success: true, message: string }`

---

## 2. Active Session Management (`/sessions` or `/api/sessions`)

### `GET /`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: UserSession[] }`

### `DELETE /:id`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'Session revoked' }`

### `DELETE /logout-others`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'All other sessions revoked' }`

### `DELETE /logout-all`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'All sessions revoked' }`

---

## 3. VPS Management (`/vps`)

### `POST /add`
- **Auth:** Required
- **Body:** `{ name, ipAddress, port: 22, username: 'root', authType: 'key'|'password', password?, privateKey? }`
- **Response:** `200` `{ success: true, data: VPS }`

### `POST /test-connection`
- **Auth:** Required
- **Body:** `{ id }` (UUID of stored server) OR raw connection fields.
- **Response:** `200` `{ success: true, message: 'Connection succeeded' }`

### `GET /list`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: VPS[] }`

### `GET /:id`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: VPS }`

### `PATCH /:id`
- **Auth:** Required
- **Body:** `{ name?, ipAddress?, port?, username?, authType?, password?, privateKey? }`
- **Response:** `200` `{ success: true, data: VPS }`

### `DELETE /:id`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'VPS deleted' }`

### `GET /:id/health`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: VPSHealth[] }`

### `POST /:id/health-check`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: VPSHealth }`

---

## 4. Projects & Deployments (`/deployments` or `/api/deployments`)

### `GET /`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: Deployment[] }`

### `GET /:id`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: Deployment }`

### `POST /:id/rollback`
- **Auth:** Required
- **Body:** `{ historyId? }`
- **Response:** `200` `{ success: true, data: { success: true, version } }`

### `POST /:id/restart`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'Deployment restarted' }`

### `POST /:id/start` / `POST /:id/stop` / `POST /:id/pause` / `POST /:id/resume`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: string }`

### `DELETE /:id`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'Deployment deleted' }`

---

## 5. Deployment Core Job Triggers (`/deploy` or `/api/deploy`)

### `POST /github`
- **Auth:** Required
- **Body:** `{ projectId?, repositoryId?, vpsId, branch: 'main', environment?, autoDeploy?, domainName?, env?, mode: 'production'|'sandbox' }`
- **Response:** `200` `{ success: true, data: Deployment }`

### `POST /upload`
- **Auth:** Required
- **Headers:** `Content-Type: multipart/form-data`
- **Fields:** `file` (binary archive), `vpsId`, `projectId?`, `name?`, `domainName?`, `env?` (JSON string), `mode?` ("production" | "sandbox")
- **Response:** `200` `{ success: true, data: Deployment }`

### `GET /list`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: Deployment[] }`

### `GET /:id/logs`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: DeploymentLog[] }`

### `GET /status/:id`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: Deployment }`

### `GET /:id/logs/stream` (WebSocket)
- **Query:** `token=<jwt_token>`
- **Event Outputs:** `deployment:log`, `deployment:error`

---

## 6. Domain Routing (`/domain`)

### `POST /attach`
- **Auth:** Required
- **Body:** `{ deploymentId, domainName }`
- **Response:** `200` `{ success: true, data: Domain }`

### `POST /ssl/issue/:domainId`
- **Auth:** Required
- **Response:** `200` `{ success: true, message: 'SSL issuance triggered' }`

### `GET /list`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: Domain[] }`

### `GET /verify-dns/:domainName`
- **Auth:** Required
- **Query:** `vpsIp=<ip_address>`
- **Response:** `200` `{ success: true, isValid: boolean }`

---

## 7. Profile & Settings (`/profile` or `/api/profile`)

### `GET /`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: Profile }`

### `PATCH /`
- **Auth:** Required
- **Body:** `{ name }`
- **Response:** `200` `{ success: true, data: Profile }`

### `POST /change-password`
- **Auth:** Required
- **Body:** `{ currentPassword?, newPassword }`
- **Response:** `200` `{ success: true, message: 'Password updated successfully' }`

### `GET /preferences` / `PATCH /preferences`
- **Auth:** Required
- **Response:** `200` `{ success: true, data: NotificationPreference }`

### `GET /audit-logs`
- **Auth:** Required
- **Query:** `page?`, `limit?`, `search?`, `category?`
- **Response:** `200` `{ success: true, logs: AuditLog[], pagination: { total, page, limit, pages } }`

### `DELETE /`
- **Auth:** Required
- **Body:** `{ passwordConfirm }`
- **Response:** `200` `{ success: true, message: 'Account deleted successfully' }`
