ALTER TABLE "DeploymentJob"
ADD COLUMN "queueJobId" TEXT;

CREATE UNIQUE INDEX "DeploymentJob_queueJobId_key"
ON "DeploymentJob"("queueJobId");
