-- Step 1: Drop foreign key constraints
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "fk_application_screening_threshold";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "fk_application_scoring_threshold";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "fk_application_approval_policy";
ALTER TABLE "screening_thresholds" DROP CONSTRAINT IF EXISTS "fk_screening_threshold_creator";

-- Step 2: Drop indexes
DROP INDEX IF EXISTS "idx_application_screening_threshold";
DROP INDEX IF EXISTS "idx_application_scoring_threshold";
DROP INDEX IF EXISTS "idx_application_approval_policy";
DROP INDEX IF EXISTS "idx_screening_threshold_creator";

-- Step 3: Drop columns
ALTER TABLE "applications" DROP COLUMN IF EXISTS "screening_threshold_id";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "scoring_threshold_id";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "approval_policy_id";
ALTER TABLE "screening_thresholds" DROP COLUMN IF EXISTS "created_by_id";
