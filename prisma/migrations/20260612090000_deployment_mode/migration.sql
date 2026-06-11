ALTER TABLE "Deployment" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'production';

CREATE INDEX IF NOT EXISTS "Deployment_mode_idx" ON "Deployment"("mode");
