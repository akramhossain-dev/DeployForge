# 🗄️ DATABASE.md

## 1. Schema Overview (Prisma/PostgreSQL)

The database is designed to handle multi-tenant isolation and complex deployment relationships.

### 1.1 Core Entities

#### User
- `id`, `email`, `passwordHash`, `name`, `githubId`, `avatarUrl`.
- `createdAt`, `updatedAt`.

#### VPS (Virtual Private Server)
- `id`, `userId` (Owner)
- `name`, `ipAddress`, `sshPort`, `username`.
- `sshKeyId` (Relation to EncryptedKey)
- `status` (ONLINE, OFFLINE, PROVISIONING)
- `osInfo`, `dockerVersion`, `nginxVersion`.

#### Project
- `id`, `userId`
- `name`, `description`.
- `repositoryUrl`, `branch`, `githubRepoId`.
- `framework` (NEXTJS, NODEJS, etc.)
- `buildCommand`, `startCommand`.

#### Deployment
- `id`, `projectId`, `vpsId`
- `commitHash`, `commitMessage`.
- `status` (QUEUED, BUILDING, DEPLOYING, SUCCESS, FAILED, ROLLBACK)
- `port`, `envVariables` (Encrypted JSON).
- `logPath` (Link to S3 or local storage).

#### Domain
- `id`, `projectId`.
- `hostname`, `sslEnabled`, `isMain`.

#### EncryptedKey
- `id`, `userId`.
- `type` (SSH_PRIVATE, GITHUB_TOKEN, ENV_SECRET)
- `encryptedContent` (AES-256-GCM)
- `iv`, `tag`.

---

## 2. Relationships

- **User 1 : N VPS**: A user can own multiple servers.
- **User 1 : N Project**: A user can manage multiple applications.
- **Project 1 : N Deployment**: History of builds for an app.
- **Project 1 : N Domain**: Multiple aliases/domains for one app.
- **VPS 1 : N Deployment**: Multiple apps running on one server.

---

## 3. Data Integrity & Security

- **Soft Deletes**: Use `deletedAt` for Projects and VPS to prevent accidental data loss.
- **Secrets Management**: No secret data is stored in the `Project` or `Deployment` table directly. All go through the `EncryptedKey` vault mechanism.
- **Indexes**:
  - Unique index on `Deployment(vpsId, port)` to prevent conflicts.
  - Index on `Deployment(status)` for queue optimization.
  - Index on `Project(userId)` for dashboard performance.
