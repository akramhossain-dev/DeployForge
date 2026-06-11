ALTER TABLE "Deployment"
ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'SERVER';

CREATE INDEX IF NOT EXISTS "Deployment_type_idx" ON "Deployment"("type");

ALTER TABLE "DeploymentHistory"
ALTER COLUMN "containerId" DROP NOT NULL;
