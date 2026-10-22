ALTER TABLE "DeploymentRelease"
  ADD COLUMN "purgeRetryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "purgeNextRetryAt" TIMESTAMP(3);

CREATE INDEX "DeploymentRelease_purgeNextRetryAt_idx" ON "DeploymentRelease"("purgeNextRetryAt");
