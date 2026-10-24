-- Correlate the initiating HTTP request with queued deployment work and traces.
ALTER TABLE "Deployment" ADD COLUMN "correlationId" TEXT;
CREATE INDEX "Deployment_correlationId_idx" ON "Deployment"("correlationId");
