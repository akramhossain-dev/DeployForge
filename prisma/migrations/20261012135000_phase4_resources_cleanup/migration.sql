CREATE TYPE "ResourceTier" AS ENUM ('STATIC', 'SERVER', 'FULLSTACK');
CREATE TYPE "CapacityReservationStatus" AS ENUM ('RESERVED', 'RELEASED');

ALTER TABLE "AdminActivity" ADD COLUMN "metadata" JSONB;

ALTER TABLE "Deployment"
  ADD COLUMN "requestedResourceTier" "ResourceTier",
  ADD COLUMN "resourceTier" "ResourceTier" NOT NULL DEFAULT 'SERVER',
  ADD COLUMN "workspacePath" TEXT,
  ADD COLUMN "cpuLimitMillis" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "memoryLimitMiB" INTEGER NOT NULL DEFAULT 1024,
  ADD COLUMN "pidsLimit" INTEGER NOT NULL DEFAULT 256,
  ADD COLUMN "storageLimitMiB" INTEGER NOT NULL DEFAULT 5120;

UPDATE "Deployment" SET
  "resourceTier" = CASE WHEN "type" = 'STATIC' THEN 'STATIC'::"ResourceTier" WHEN "type" = 'FULLSTACK' THEN 'FULLSTACK'::"ResourceTier" ELSE 'SERVER'::"ResourceTier" END,
  "cpuLimitMillis" = CASE WHEN "type" = 'STATIC' THEN 250 WHEN "type" = 'FULLSTACK' THEN 2000 ELSE 1000 END,
  "memoryLimitMiB" = CASE WHEN "type" = 'STATIC' THEN 256 WHEN "type" = 'FULLSTACK' THEN 2048 ELSE 1024 END,
  "pidsLimit" = CASE WHEN "type" = 'STATIC' THEN 128 WHEN "type" = 'FULLSTACK' THEN 512 ELSE 256 END;

ALTER TABLE "DeploymentRelease"
  ADD COLUMN "resourceTier" "ResourceTier" NOT NULL DEFAULT 'SERVER',
  ADD COLUMN "cpuLimitMillis" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "memoryLimitMiB" INTEGER NOT NULL DEFAULT 1024,
  ADD COLUMN "pidsLimit" INTEGER NOT NULL DEFAULT 256,
  ADD COLUMN "storageLimitMiB" INTEGER NOT NULL DEFAULT 5120,
  ADD COLUMN "retentionPinnedAt" TIMESTAMP(3),
  ADD COLUMN "retentionPinReason" TEXT,
  ADD COLUMN "purgedAt" TIMESTAMP(3),
  ADD COLUMN "purgeError" TEXT;

UPDATE "DeploymentRelease" SET
  "resourceTier" = CASE WHEN "kind" = 'STATIC' THEN 'STATIC'::"ResourceTier" WHEN "kind" = 'COMPOSE' THEN 'FULLSTACK'::"ResourceTier" ELSE 'SERVER'::"ResourceTier" END,
  "cpuLimitMillis" = CASE WHEN "kind" = 'STATIC' THEN 250 WHEN "kind" = 'COMPOSE' THEN 2000 ELSE 1000 END,
  "memoryLimitMiB" = CASE WHEN "kind" = 'STATIC' THEN 256 WHEN "kind" = 'COMPOSE' THEN 2048 ELSE 1024 END,
  "pidsLimit" = CASE WHEN "kind" = 'STATIC' THEN 128 WHEN "kind" = 'COMPOSE' THEN 512 ELSE 256 END;

CREATE TABLE "ProjectResourcePolicy" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "resourceTier" "ResourceTier",
  "cpuLimitMillis" INTEGER,
  "memoryLimitMiB" INTEGER,
  "pidsLimit" INTEGER,
  "storageLimitMiB" INTEGER,
  "updatedByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectResourcePolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CapacityReservation" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "vpsId" TEXT NOT NULL,
  "status" "CapacityReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "cpuMillis" INTEGER NOT NULL,
  "memoryMiB" INTEGER NOT NULL,
  "storageMiB" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapacityReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectResourcePolicy_projectId_key" ON "ProjectResourcePolicy"("projectId");
CREATE INDEX "ProjectResourcePolicy_updatedByAdminId_idx" ON "ProjectResourcePolicy"("updatedByAdminId");
CREATE UNIQUE INDEX "CapacityReservation_deploymentId_key" ON "CapacityReservation"("deploymentId");
CREATE INDEX "CapacityReservation_vpsId_status_idx" ON "CapacityReservation"("vpsId", "status");
CREATE INDEX "CapacityReservation_projectId_status_idx" ON "CapacityReservation"("projectId", "status");
CREATE INDEX "CapacityReservation_status_expiresAt_idx" ON "CapacityReservation"("status", "expiresAt");
CREATE INDEX "DeploymentRelease_purgedAt_idx" ON "DeploymentRelease"("purgedAt");
CREATE INDEX "DeploymentRelease_retentionPinnedAt_idx" ON "DeploymentRelease"("retentionPinnedAt");

ALTER TABLE "ProjectResourcePolicy" ADD CONSTRAINT "ProjectResourcePolicy_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_vpsId_fkey" FOREIGN KEY ("vpsId") REFERENCES "VPS"("id") ON DELETE CASCADE ON UPDATE CASCADE;
