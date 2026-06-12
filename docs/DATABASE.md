# 🗄️ DATABASE.md

The database is built on **PostgreSQL** and orchestrated through **Prisma ORM**. It handles multi-tenant isolation, user accounts, target VPS records, custom domains, deployment logs, metrics histories, and security logs.

---

## 1. Schema Design & Entities

### 1.1 Core Accounts & Authentication

#### User
*   `id` (UUID, Primary Key)
*   `email` (String, Unique, Optional)
*   `username` (String, Unique, Optional)
*   `passwordHash` (String, Optional)
*   `name` (String, Optional)
*   `avatarUrl` (String, Optional)
*   `githubId` / `githubUsername` / `githubAvatar` / `githubAccessToken`
*   `googleId` / `googleEmail` / `googleAvatar`
*   `isVerified` (Boolean)
*   `role` (String, e.g. "USER")
*   `status` (String, "ACTIVE" | "SUSPENDED")
*   `provider` / `authProvider` (String)
*   `lastLoginAt` (DateTime)
*   `createdAt` / `updatedAt` (DateTime)

#### UserSession (Active Sessions Tracked)
*   `id` (CUID, PK)
*   `userId` (Relation to User, onDelete: Cascade)
*   `refreshToken` (String, Unique, Hashed)
*   `userAgent` / `device` / `browser` / `os` / `ipAddress` (Strings, Metadata)
*   `lastActivity` (DateTime)
*   `expiresAt` / `createdAt` (DateTime)

#### PasswordResetToken / EmailVerificationToken
*   `id` (CUID, PK)
*   `userId` (Relation to User, onDelete: Cascade)
*   `token` (String, Unique, Hashed)
*   `expiresAt` / `createdAt` (DateTime)
*   `usedAt` (DateTime, Optional)

#### NotificationPreference
*   `id` (CUID, PK)
*   `userId` (String, Unique, Relation to User)
*   `deployNotifications` / `buildNotifications` / `domainNotifications` / `sslNotifications` / `securityAlerts` / `productUpdates` (Booleans)

#### AuditLog (Security Log Events)
*   `id` (CUID, PK)
*   `userId` (Relation to User, onDelete: Cascade, Optional)
*   `action` (String, e.g., "LOGIN_SUCCESS", "PASSWORD_CHANGE")
*   `details` (String)
*   `ipAddress` / `device` / `browser` / `os` / `userAgent` (Strings)
*   `metadata` (JSON String)
*   `createdAt` (DateTime)

---

### 1.2 Remote Infrastructure Management

#### VPS (Virtual Private Server target)
*   `id` (UUID, PK)
*   `userId` (Relation to User)
*   `name` (String)
*   `ipAddress` (String)
*   `port` (Int, Default 22)
*   `username` (String)
*   `authType` (String, "key" | "password")
*   `encryptedPrivateKey` / `encryptedPassword` (Strings, Encrypted secrets)
*   `status` (String, "active" | "inactive" | "failed")
*   `lastCheckedAt` / `createdAt` / `updatedAt` (DateTime)

#### VPSHealth (Historical/Current server status details)
*   `id` (CUID, PK)
*   `vpsId` (Relation to VPS)
*   `cpuUsage` / `memoryUsage` / `diskUsage` (Floats)
*   `uptime` (Int)
*   `dockerInstalled` / `nginxInstalled` (Booleans)
*   `checkedAt` (DateTime)

#### SystemMetrics
*   `id` (UUID, PK)
*   `vpsId` (Relation to VPS)
*   `cpuUsage` / `memoryUsage` / `diskUsage` (Floats)
*   `activeContainers` (Int)
*   `timestamp` (DateTime)

---

### 1.3 Projects & Deployment Engine

#### Project
*   `id` (CUID, PK)
*   `userId` (Relation to User)
*   `name` (String)
*   `repositoryUrl` (String)
*   `branch` (String)
*   `framework` (String, Optional)
*   `createdAt` / `updatedAt` (DateTime)

#### Deployment
*   `id` (UUID, PK)
*   `userId` (Relation to User)
*   `projectId` (Relation to Project)
*   `vpsId` (Relation to VPS)
*   `name` (String, Optional)
*   `status` (String, "PENDING" | "BUILDING" | "RUNNING" | "FAILED" | "STOPPED")
*   `framework` / `type` (Strings, e.g. "STATIC", "SERVER")
*   `port` (Int, Optional)
*   `buildCommand` / `startCommand` (Strings, Optional)
*   `env` (String, Encrypted JSON env variables)
*   `containerId` (String, Optional)
*   `sourceType` (String, "github" | "upload")
*   `repoUrl` / `branch` / `uploadPath` / `commitHash` / `commitMessage` (Strings, Optional)
*   `lastStableVersion` / `domain` / `hostType` / `mode` (Strings, e.g. "production" | "sandbox")
*   `createdAt` / `updatedAt` (DateTime)

#### DeploymentHistory (Rollback snapshots)
*   `id` (UUID, PK)
*   `deploymentId` (Relation to Deployment)
*   `version` (String, commitHash or timestamp)
*   `containerId` / `imageTag` (Strings, Optional)
*   `status` (String)
*   `env` (String, Encrypted env variables snapshot)
*   `createdAt` (DateTime)

#### Domain
*   `id` (UUID, PK)
*   `deploymentId` (Relation to Deployment)
*   `vpsId` (Relation to VPS)
*   `domainName` (String, Unique)
*   `status` (String, "PENDING" | "ACTIVE" | "FAILED")
*   `sslStatus` (String, "NONE" | "ISSUED" | "EXPIRED" | "FAILED")
*   `nginxConfigPath` (String, Optional)
*   `createdAt` / `updatedAt` (DateTime)

#### Log / DeploymentLog
*   `DeploymentLog` (Structured build logs): `id`, `deploymentId`, `type` ("build" | "runtime" | "error"), `level` ("info" | "warn" | "error"), `message`, `createdAt`.
*   `Log` (Generic container logs): `id`, `deploymentId`, `content`, `type`, `createdAt`.

---

## 2. Secrets Management Design

DeployForge does **not** employ a separate `EncryptedKey` table. Secrets are kept directly in the resource tables to maintain referential integrity:
*   `VPS.encryptedPrivateKey` and `VPS.encryptedPassword` hold target SSH credentials.
*   `GitHubAccount.accessToken` holds GitHub connection tokens.
*   `Deployment.env` holds environment variable keys and values.
*   All secrets are encrypted using `packages/security` (AES-256-GCM) and mapped as `iv:authTag:encryptedData`.

---

## 3. Indexes & Constraints

*   **`User(email)` & `User(username)`:** Unique constraints.
*   **`UserSession(refreshToken)`:** Unique.
*   **`Domain(domainName)`:** Unique.
*   **`AuditLog(userId, createdAt)`:** Indexed for fast audit query retrieval.
*   **`Deployment(userId, projectId, vpsId)`:** Indexed for dashboard listing queries.
