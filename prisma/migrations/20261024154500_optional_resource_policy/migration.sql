ALTER TABLE "Deployment"
ADD COLUMN "resourcePolicyEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "DeploymentRelease"
ADD COLUMN "resourcePolicyEnabled" BOOLEAN NOT NULL DEFAULT false;
