ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'PREFLIGHT';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PREFLIGHT';
ALTER TYPE "DeploymentStatus" ADD VALUE IF NOT EXISTS 'PREFLIGHT_BLOCKED';

ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'WAITING_APPROVAL';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';

CREATE TYPE "PreflightCheckStatus" AS ENUM ('PASS', 'WARNING', 'BLOCKED');

ALTER TABLE "Deployment"
ADD COLUMN "preflightWarningsAccepted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "DeploymentPreflightCheck" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "PreflightCheckStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeploymentPreflightCheck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeploymentPreflightCheck_deploymentId_code_key"
ON "DeploymentPreflightCheck"("deploymentId", "code");

CREATE INDEX "DeploymentPreflightCheck_deploymentId_status_idx"
ON "DeploymentPreflightCheck"("deploymentId", "status");

CREATE INDEX "DeploymentPreflightCheck_createdAt_idx"
ON "DeploymentPreflightCheck"("createdAt");

ALTER TABLE "DeploymentPreflightCheck"
ADD CONSTRAINT "DeploymentPreflightCheck_deploymentId_fkey"
FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
