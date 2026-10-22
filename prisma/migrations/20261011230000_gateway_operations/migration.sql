CREATE TYPE "VPSGatewayStatus" AS ENUM ('UNKNOWN', 'PROVISIONING', 'READY', 'DEGRADED', 'FAILED');

CREATE TYPE "VPSOperationStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED');

ALTER TABLE "VPS" ADD COLUMN     "gatewayCheckedAt" TIMESTAMP(3),
ADD COLUMN     "gatewayError" TEXT,
ADD COLUMN     "gatewayStatus" "VPSGatewayStatus" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "gatewayVersion" TEXT;

ALTER TABLE "Deployment" ADD COLUMN     "composePort" INTEGER,
ADD COLUMN     "composeService" TEXT;

CREATE TABLE "VPSOperation" (
    "id" TEXT NOT NULL,
    "vpsId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "acmeEmail" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GATEWAY_BOOTSTRAP',
    "status" "VPSOperationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VPSOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VPSOperation_vpsId_createdAt_idx" ON "VPSOperation"("vpsId", "createdAt");

CREATE INDEX "VPSOperation_vpsId_status_idx" ON "VPSOperation"("vpsId", "status");

CREATE INDEX "VPSOperation_requestedById_idx" ON "VPSOperation"("requestedById");

ALTER TABLE "VPSOperation" ADD CONSTRAINT "VPSOperation_vpsId_fkey" FOREIGN KEY ("vpsId") REFERENCES "VPS"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VPSOperation" ADD CONSTRAINT "VPSOperation_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
