# 🔌 DeployForge API Reference

The DeployForge backend is powered by a Fastify REST API and WebSocket gateway. 

---

## 1. Global API Configuration

### 1.1 Authentication & CSRF
* **Cookies:** Authentication uses HttpOnly, secure cookies: `accessToken` (JWT) and `refreshToken` (opaque token).
* **CSRF Protection:** Non-safe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a CSRF token.
  1. Retrieve the CSRF token from the `GET /auth/csrf` endpoint (which sets a `csrfToken` cookie).
  2. Send the token value in the request header: `X-CSRF-Token: <token>`.
  3. The backend validates the header against the cookie using timing-safe comparisons.

### 1.2 Response Shapes

#### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "context": "Additional debug information (optional)"
  }
}
```

---

## 2. Authentication API (`/auth`)

### `GET /auth/csrf`
* **Description:** Retrieve a double-submit CSRF token.
* **Authentication:** None
* **Rate Limit:** 60 requests / minute
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "csrfToken": "ce4b985f..." }
  }
  ```

### `POST /auth/register`
* **Description:** Register a new user account.
* **Authentication:** None
* **Rate Limit:** 10 requests / minute
* **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "Jane Doe",
    "termsAccepted": true
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Registration successful. Please verify your email.",
    "email": "user@example.com"
  }
  ```

### `POST /auth/verify-otp`
* **Description:** Verify the registration OTP token.
* **Authentication:** None
* **Rate Limit:** 10 requests / minute
* **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "otp": "123456"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Email verified successfully"
  }
  ```

### `POST /auth/login`
* **Description:** Authenticate and create a session.
* **Authentication:** None
* **Rate Limit:** 10 requests / minute
* **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword123"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "user": { "id": "uuid", "email": "user@example.com", "name": "Jane Doe" }
  }
  ```
* **Cookies Set:** `accessToken`, `refreshToken`

### `POST /auth/refresh`
* **Description:** Rotate tokens using refresh token.
* **Authentication:** HttpOnly `refreshToken` cookie required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Session refreshed"
  }
  ```
* **Cookies Set:** New `accessToken`, new `refreshToken` (rotated)

### `POST /auth/logout`
* **Description:** Terminate the current session.
* **Authentication:** Required (Valid Access Token)
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### `GET /auth/me`
* **Description:** Fetch currently authenticated user details.
* **Authentication:** Required
* **Rate Limit:** 30 requests / minute
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "user": { "id": "uuid", "email": "user@example.com", "role": "USER" }
  }
  ```

---

## 3. VPS Management API (`/vps`)

### `POST /vps/add`
* **Description:** Add a new target server (VPS).
* **Authentication:** Required
* **Rate Limit:** 8 requests / 10 minutes
* **Request Body:**
  ```json
  {
    "name": "Production VPS 1",
    "ipAddress": "192.168.1.50",
    "port": 22,
    "username": "root",
    "authType": "key",
    "password": "optionalpassword",
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n..."
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "id": "vps_uuid", "name": "Production VPS 1", "ipAddress": "192.168.1.50" }
  }
  ```

### `POST /vps/test-connection`
* **Description:** Validate SSH connectivity to a stored or unsaved VPS config.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "id": "vps_uuid"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Connection succeeded"
  }
  ```

### `GET /vps/list`
* **Description:** List all onboarded VPS instances.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [ { "id": "vps_uuid", "name": "Prod Server", "status": "CONNECTED" } ]
  }
  ```

### `DELETE /vps/:id`
* **Description:** Delete a VPS instance from database.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "VPS deleted successfully"
  }
  ```

---

## 4. Deployments API (`/deploy` & `/deployments`)

### `POST /deploy/github`
* **Description:** Deploy an application from a synchronized GitHub repository.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "projectId": "project_uuid",
    "branch": "main",
    "env": {
      "PORT": "3000",
      "NODE_ENV": "production"
    }
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "id": "deployment_uuid", "status": "QUEUED" }
  }
  ```

### `POST /deploy/upload`
* **Description:** Deploy via archive file (.zip, .tar.gz) upload.
* **Authentication:** Required (Form-Data containing `file` and `projectId`)
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "id": "deployment_uuid", "status": "QUEUED" }
  }
  ```

### `POST /deploy/rollback/:id`
* **Description:** Rollback project to a previous successful deployment.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Rollback scheduled successfully",
    "data": { "id": "new_deployment_uuid" }
  }
  ```

### `GET /deploy/:id/logs`
* **Description:** Fetch static deployment logs.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [ { "createdAt": "timestamp", "message": "Cloning repository..." } ]
  }
  ```

---

## 5. Domain & SSL Management API (`/domain`)

### `POST /domain/attach`
* **Description:** Link a domain to a project deployment.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "projectId": "project_uuid",
    "domainName": "app.customdomain.com"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "id": "domain_uuid", "domainName": "app.customdomain.com", "verified": false }
  }
  ```

### `POST /domain/ssl/issue/:domainId`
* **Description:** Issue Let's Encrypt SSL certificate for domain.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "SSL certificate issued and proxy configured successfully"
  }
  ```

---

## 6. Server Monitoring API (`/monitor`)

### `GET /monitor/metrics/:vpsId`
* **Description:** Get CPU, RAM, and Disk metrics history for VPS.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      { "cpuUsage": 12.5, "ramUsage": 64.2, "diskUsage": 45.1, "createdAt": "timestamp" }
    ]
  }
  ```

---

## 7. Web SSH Terminal Gateway (WebSockets)

### `WS /terminal/:vpsId`
* **Description:** Establish an interactive shell terminal with the remote VPS.
* **Authentication:** Handshake validated via one-time query token: `?token=<temp_token>`
* **Parameters:** `cols`, `rows` for terminal geometry.

---

## 8. File Manager API (`/file-manager`)

Provides target VPS filesystem exploration, uploads, downloads, edits, search, and zip utilities.

### `GET /file-manager/:vpsId/info`
* **Description:** Get connection health state and target user's home directory path.
* **Authentication:** Required
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "isConnected": true, "homeDir": "/home/ubuntu" }
  }
  ```

### `GET /file-manager/:vpsId/list`
* **Description:** List directory files and folders.
* **Authentication:** Required
* **Query Parameters:** `path` (Defaults to `~`)
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "path": "/home/ubuntu/project",
      "entries": [
        { "name": "src", "path": "/home/ubuntu/project/src", "type": "directory", "size": 4096, "modified": "timestamp", "permissions": "drwxr-xr-x", "extension": "", "mimeType": "" }
      ]
    }
  }
  ```

### `GET /file-manager/:vpsId/read`
* **Description:** Read a file's textual or previewable content.
* **Authentication:** Required
* **Query Parameters:** `path`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "content": "file text content...",
      "encoding": "utf8"
    }
  }
  ```

### `GET /file-manager/:vpsId/properties`
* **Description:** Get metadata, sizing, counts, and permissions of a path.
* **Authentication:** Required
* **Query Parameters:** `path`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "path": "/home/ubuntu/file.txt",
      "name": "file.txt",
      "type": "file",
      "size": 124,
      "modified": "timestamp",
      "permissions": "-rw-r--r--",
      "owner": "ubuntu",
      "group": "ubuntu"
    }
  }
  ```

### `GET /file-manager/:vpsId/search`
* **Description:** Find files and directories by name.
* **Authentication:** Required
* **Query Parameters:** `path` (root path to search), `query` (search term), `extension` (optional extension filter)
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      { "name": "index.ts", "path": "/home/ubuntu/project/src/index.ts", "type": "file", "size": 1024, "modified": "timestamp" }
    ]
  }
  ```

### `GET /file-manager/:vpsId/download`
* **Description:** Download single file content.
* **Authentication:** Required
* **Query Parameters:** `path`
* **Response `200 OK`:** Base64 or raw file stream response.

### `POST /file-manager/:vpsId/create`
* **Description:** Create a new empty file or folder.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "path": "/home/ubuntu/project/newfile.js",
    "type": "file"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "File created" }
  }
  ```

### `PUT /file-manager/:vpsId/save`
* **Description:** Save edits to a text file.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "path": "/home/ubuntu/project/newfile.js",
    "content": "const x = 10;"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "File saved" }
  }
  ```

### `PUT /file-manager/:vpsId/rename`
* **Description:** Move or rename a file or folder.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "oldPath": "/home/ubuntu/project/old.js",
    "newPath": "/home/ubuntu/project/new.js"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "Renamed successfully" }
  }
  ```

### `PUT /file-manager/:vpsId/copy`
* **Description:** Copy a file or folder.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "srcPath": "/home/ubuntu/project/source.js",
    "dstPath": "/home/ubuntu/project/copy.js"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "Copied successfully" }
  }
  ```

### `DELETE /file-manager/:vpsId/delete`
* **Description:** Delete files or directories in bulk.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "paths": ["/home/ubuntu/project/temp.js"]
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "Deleted", "errors": [] }
  }
  ```

### `POST /file-manager/:vpsId/upload`
* **Description:** Upload a file to the target directory.
* **Authentication:** Required
* **Query Parameters:** `path` (target directory)
* **Request Body:** Multipart `form-data` containing `file`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "Uploaded", "filename": "uploaded.jpg" }
  }
  ```

### `POST /file-manager/:vpsId/compress`
* **Description:** Compress items to a zip archive on remote VPS.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "parentDir": "/home/ubuntu/project",
    "paths": ["/home/ubuntu/project/src", "/home/ubuntu/project/package.json"],
    "archiveName": "backup.zip"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "Files compressed successfully" }
  }
  ```

### `POST /file-manager/:vpsId/decompress`
* **Description:** Extract zip archive.
* **Authentication:** Required
* **Request Body:**
  ```json
  {
    "zipFilePath": "/home/ubuntu/project/backup.zip",
    "destDir": "/home/ubuntu/project/extracted"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": { "message": "Archive decompressed successfully" }
  }
  ```
