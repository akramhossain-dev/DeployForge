ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "domain" TEXT;
ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "hostType" TEXT NOT NULL DEFAULT 'ip';

CREATE INDEX IF NOT EXISTS "Deployment_domain_idx" ON "Deployment"("domain");
CREATE INDEX IF NOT EXISTS "Deployment_hostType_idx" ON "Deployment"("hostType");
