ALTER TABLE "Deployment"
ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'github',
ADD COLUMN IF NOT EXISTS "repoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "branch" TEXT,
ADD COLUMN IF NOT EXISTS "uploadPath" TEXT,
ADD COLUMN IF NOT EXISTS "lastStableVersion" TEXT;

UPDATE "Deployment"
SET
  "sourceType" = CASE
    WHEN "Project"."repositoryUrl" LIKE 'upload://%' THEN 'upload'
    ELSE 'github'
  END,
  "repoUrl" = CASE
    WHEN "Project"."repositoryUrl" LIKE 'upload://%' THEN NULL
    ELSE "Project"."repositoryUrl"
  END,
  "branch" = CASE
    WHEN "Project"."repositoryUrl" LIKE 'upload://%' THEN NULL
    ELSE "Project"."branch"
  END,
  "uploadPath" = CASE
    WHEN "Project"."repositoryUrl" LIKE 'upload://%' THEN "Project"."repositoryUrl"
    ELSE NULL
  END
FROM "Project"
WHERE "Deployment"."projectId" = "Project"."id";

CREATE INDEX IF NOT EXISTS "Deployment_sourceType_idx" ON "Deployment"("sourceType");
