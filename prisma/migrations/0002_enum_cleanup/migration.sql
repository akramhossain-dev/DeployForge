-- DeployForge Migration 0002: Enum Cleanup
--
-- Changes:
--   1. Remove legacy `ssh_key` value from VPSAuthType enum
--   2. Add ContactMessageStatus enum, migrate ContactMessage.status from TEXT to enum
--
-- HOW TO APPLY:
--   pnpm db:migrate

-- ============================================================================
-- PART 1: Remove `ssh_key` from VPSAuthType
-- PostgreSQL cannot auto-cast a column that has a column DEFAULT tied to the
-- old enum type. We must DROP DEFAULT first, swap types, then restore it.
-- ============================================================================

-- Step 1a: Drop the column default (it's tied to the old enum type object)
ALTER TABLE "VPS" ALTER COLUMN "authType" DROP DEFAULT;

-- Step 1b: Rename old enum so we can create a replacement with the same name
ALTER TYPE "VPSAuthType" RENAME TO "VPSAuthType_old";

-- Step 1c: Convert any legacy `ssh_key` rows → `key` before dropping the value
UPDATE "VPS" SET "authType" = 'key'::"VPSAuthType_old" WHERE "authType" = 'ssh_key'::"VPSAuthType_old";

-- Step 1d: Create the new clean enum WITHOUT `ssh_key`
CREATE TYPE "VPSAuthType" AS ENUM ('key', 'password');

-- Step 1e: Migrate the column to the new enum type (text cast is safe after Step 1c)
ALTER TABLE "VPS"
  ALTER COLUMN "authType" TYPE "VPSAuthType"
  USING "authType"::text::"VPSAuthType";

-- Step 1f: Restore the column default using the NEW enum type
ALTER TABLE "VPS" ALTER COLUMN "authType" SET DEFAULT 'key'::"VPSAuthType";

-- Step 1g: Drop the old enum — no longer referenced
DROP TYPE "VPSAuthType_old";

-- ============================================================================
-- PART 2: Add ContactMessageStatus enum, migrate ContactMessage.status column
-- Same pattern: drop default, alter type, restore default.
-- ============================================================================

-- Step 2a: Create the new enum
CREATE TYPE "ContactMessageStatus" AS ENUM ('new', 'read', 'replied', 'archived');

-- Step 2b: Drop the text default
ALTER TABLE "ContactMessage" ALTER COLUMN "status" DROP DEFAULT;

-- Step 2c: Migrate column from TEXT to enum (unknown values fall back to 'new')
ALTER TABLE "ContactMessage"
  ALTER COLUMN "status" TYPE "ContactMessageStatus"
  USING (
    CASE
      WHEN "status" IN ('new', 'read', 'replied', 'archived') THEN "status"::"ContactMessageStatus"
      ELSE 'new'::"ContactMessageStatus"
    END
  );

-- Step 2d: Restore the default using the new enum type
ALTER TABLE "ContactMessage"
  ALTER COLUMN "status" SET DEFAULT 'new'::"ContactMessageStatus";
