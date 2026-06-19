-- Backfill columns that exist in the Prisma schema but may be absent on drifted local databases.
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Keep relation backfills migration-safe before adding foreign keys.
DELETE FROM "RefreshTokenReplay"
WHERE "userId" NOT IN (SELECT "id" FROM "User")
   OR "sessionId" NOT IN (SELECT "id" FROM "Session");

-- Foreign key consistency for rotated refresh-token replay records.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RefreshTokenReplay_userId_fkey'
    ) THEN
        ALTER TABLE "RefreshTokenReplay"
        ADD CONSTRAINT "RefreshTokenReplay_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RefreshTokenReplay_sessionId_fkey'
    ) THEN
        ALTER TABLE "RefreshTokenReplay"
        ADD CONSTRAINT "RefreshTokenReplay_sessionId_fkey"
        FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Query-path indexes used by auth, admin, monitoring, deployment, and audit screens.
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE INDEX IF NOT EXISTS "User_provider_idx" ON "User"("provider");
CREATE INDEX IF NOT EXISTS "User_authProvider_idx" ON "User"("authProvider");
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX IF NOT EXISTS "User_updatedAt_idx" ON "User"("updatedAt");
CREATE INDEX IF NOT EXISTS "User_lastLoginAt_idx" ON "User"("lastLoginAt");

CREATE INDEX IF NOT EXISTS "Session_userId_lastActivity_idx" ON "Session"("userId", "lastActivity");
CREATE INDEX IF NOT EXISTS "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

CREATE INDEX IF NOT EXISTS "RefreshTokenReplay_userId_expiresAt_idx" ON "RefreshTokenReplay"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "RefreshTokenReplay_sessionId_expiresAt_idx" ON "RefreshTokenReplay"("sessionId", "expiresAt");

CREATE INDEX IF NOT EXISTS "GitHubAccount_connectedAt_idx" ON "GitHubAccount"("connectedAt");
CREATE INDEX IF NOT EXISTS "GitHubAccount_updatedAt_idx" ON "GitHubAccount"("updatedAt");
CREATE INDEX IF NOT EXISTS "Repository_githubAccountId_fullName_idx" ON "Repository"("githubAccountId", "fullName");
CREATE INDEX IF NOT EXISTS "Repository_updatedAt_idx" ON "Repository"("updatedAt");

CREATE INDEX IF NOT EXISTS "WebhookEvent_repoId_event_idx" ON "WebhookEvent"("repoId", "event");
CREATE INDEX IF NOT EXISTS "WebhookEvent_status_createdAt_idx" ON "WebhookEvent"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "VPS_userId_status_idx" ON "VPS"("userId", "status");
CREATE INDEX IF NOT EXISTS "VPS_updatedAt_idx" ON "VPS"("updatedAt");
CREATE INDEX IF NOT EXISTS "Project_userId_repositoryUrl_idx" ON "Project"("userId", "repositoryUrl");
CREATE INDEX IF NOT EXISTS "Project_updatedAt_idx" ON "Project"("updatedAt");

CREATE INDEX IF NOT EXISTS "Deployment_userId_status_idx" ON "Deployment"("userId", "status");
CREATE INDEX IF NOT EXISTS "Deployment_userId_status_createdAt_idx" ON "Deployment"("userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "Deployment_projectId_status_idx" ON "Deployment"("projectId", "status");
CREATE INDEX IF NOT EXISTS "Deployment_vpsId_status_idx" ON "Deployment"("vpsId", "status");

CREATE INDEX IF NOT EXISTS "DeploymentJob_deploymentId_status_idx" ON "DeploymentJob"("deploymentId", "status");
CREATE INDEX IF NOT EXISTS "DeploymentJob_updatedAt_idx" ON "DeploymentJob"("updatedAt");
CREATE INDEX IF NOT EXISTS "Domain_deploymentId_status_idx" ON "Domain"("deploymentId", "status");
CREATE INDEX IF NOT EXISTS "Domain_vpsId_status_idx" ON "Domain"("vpsId", "status");
CREATE INDEX IF NOT EXISTS "DeploymentSandbox_deploymentId_status_idx" ON "DeploymentSandbox"("deploymentId", "status");
CREATE INDEX IF NOT EXISTS "DeploymentHistory_deploymentId_status_idx" ON "DeploymentHistory"("deploymentId", "status");
CREATE INDEX IF NOT EXISTS "DeploymentLog_deploymentId_createdAt_idx" ON "DeploymentLog"("deploymentId", "createdAt");
CREATE INDEX IF NOT EXISTS "DeploymentLog_level_createdAt_idx" ON "DeploymentLog"("level", "createdAt");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId", "expiresAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

DROP TYPE IF EXISTS "NotificationType";
DROP TYPE IF EXISTS "BackupStatus";
DROP TYPE IF EXISTS "RollbackStatus";
