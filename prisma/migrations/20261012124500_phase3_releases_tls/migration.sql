ALTER TYPE "SSLStatus" ADD VALUE IF NOT EXISTS 'PENDING';

CREATE TYPE "ReleaseKind" AS ENUM ('STATIC', 'CONTAINER', 'COMPOSE');
CREATE TYPE "ReleaseStatus" AS ENUM ('BUILDING', 'CANDIDATE', 'READY', 'ACTIVATING', 'ACTIVE', 'SUPERSEDED', 'FAILED');
CREATE TYPE "ReadinessStatus" AS ENUM ('UNKNOWN', 'PENDING', 'PASSED', 'FAILED');

ALTER TABLE "Project"
  ADD COLUMN "activeReleaseId" TEXT,
  ADD COLUMN "candidateReleaseId" TEXT;

ALTER TABLE "Domain"
  ADD COLUMN "sslVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "sslExpiresAt" TIMESTAMP(3),
  ADD COLUMN "sslIssuer" TEXT,
  ADD COLUMN "sslError" TEXT,
  ADD COLUMN "sslRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sslNextRetryAt" TIMESTAMP(3);

CREATE TABLE "DeploymentRelease" (
  "id" TEXT NOT NULL,
  "deploymentId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "vpsId" TEXT NOT NULL,
  "kind" "ReleaseKind" NOT NULL,
  "status" "ReleaseStatus" NOT NULL DEFAULT 'BUILDING',
  "version" TEXT NOT NULL,
  "runtimeRef" TEXT,
  "containerId" TEXT,
  "imageTag" TEXT,
  "artifactPath" TEXT,
  "manifestPath" TEXT,
  "composeService" TEXT,
  "composePort" INTEGER,
  "ingressPort" INTEGER NOT NULL,
  "env" TEXT,
  "readinessStatus" "ReadinessStatus" NOT NULL DEFAULT 'UNKNOWN',
  "readinessCheckedAt" TIMESTAMP(3),
  "readinessError" TEXT,
  "activationReason" TEXT NOT NULL DEFAULT 'DEPLOY',
  "activatedAt" TIMESTAMP(3),
  "supersededAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeploymentRelease_pkey" PRIMARY KEY ("id")
);

INSERT INTO "DeploymentRelease" (
  "id", "deploymentId", "projectId", "vpsId", "kind", "status", "version",
  "runtimeRef", "containerId", "imageTag", "artifactPath", "composeService",
  "composePort", "ingressPort", "env", "readinessStatus", "createdAt", "updatedAt"
)
SELECT
  h."id", h."deploymentId", d."projectId", d."vpsId",
  CASE
    WHEN d."framework" = 'DOCKER_COMPOSE' THEN 'COMPOSE'::"ReleaseKind"
    WHEN d."type" = 'STATIC' THEN 'STATIC'::"ReleaseKind"
    ELSE 'CONTAINER'::"ReleaseKind"
  END,
  'SUPERSEDED'::"ReleaseStatus", h."version", h."containerId", h."containerId", h."imageTag",
  CASE WHEN d."type" = 'STATIC' THEN '/home/' || v."username" || '/deployforge/projects/' || d."projectId" || '/static/' || h."version" ELSE NULL END,
  d."composeService", d."composePort",
  CASE WHEN d."type" = 'STATIC' THEN 80 ELSE COALESCE(d."composePort", 3000) END,
  h."env", 'UNKNOWN'::"ReadinessStatus", h."createdAt", h."createdAt"
FROM "DeploymentHistory" h
JOIN "Deployment" d ON d."id" = h."deploymentId"
JOIN "VPS" v ON v."id" = d."vpsId";

WITH ranked AS (
  SELECT r."id", r."projectId",
         row_number() OVER (PARTITION BY r."projectId" ORDER BY r."createdAt" DESC) AS rank
  FROM "DeploymentRelease" r
  JOIN "Deployment" d ON d."id" = r."deploymentId"
  WHERE d."status" IN ('RUNNING', 'ROLLED_BACK')
)
UPDATE "DeploymentRelease" r
SET "status" = 'ACTIVE', "activatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE r."id" = ranked."id" AND ranked.rank = 1;

UPDATE "Project" p
SET "activeReleaseId" = active_release."id"
FROM (
  SELECT DISTINCT ON ("projectId") "projectId", "id"
  FROM "DeploymentRelease"
  WHERE "status" = 'ACTIVE'
  ORDER BY "projectId", "createdAt" DESC
) active_release
WHERE p."id" = active_release."projectId";

CREATE UNIQUE INDEX "Project_activeReleaseId_key" ON "Project"("activeReleaseId");
CREATE UNIQUE INDEX "Project_candidateReleaseId_key" ON "Project"("candidateReleaseId");
CREATE INDEX "DeploymentRelease_deploymentId_createdAt_idx" ON "DeploymentRelease"("deploymentId", "createdAt");
CREATE INDEX "DeploymentRelease_projectId_status_idx" ON "DeploymentRelease"("projectId", "status");
CREATE INDEX "DeploymentRelease_vpsId_status_idx" ON "DeploymentRelease"("vpsId", "status");
CREATE INDEX "DeploymentRelease_status_idx" ON "DeploymentRelease"("status");
CREATE UNIQUE INDEX "DeploymentRelease_one_active_per_project"
  ON "DeploymentRelease"("projectId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "DeploymentRelease_one_candidate_per_project"
  ON "DeploymentRelease"("projectId") WHERE "status" IN ('CANDIDATE', 'READY', 'ACTIVATING');

ALTER TABLE "DeploymentRelease"
  ADD CONSTRAINT "DeploymentRelease_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DeploymentRelease_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "DeploymentRelease_vpsId_fkey" FOREIGN KEY ("vpsId") REFERENCES "VPS"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_activeReleaseId_fkey" FOREIGN KEY ("activeReleaseId") REFERENCES "DeploymentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Project_candidateReleaseId_fkey" FOREIGN KEY ("candidateReleaseId") REFERENCES "DeploymentRelease"("id") ON DELETE SET NULL ON UPDATE CASCADE;
