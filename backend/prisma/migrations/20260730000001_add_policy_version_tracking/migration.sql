-- Step 1: Add policy version reference columns to applications table
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "screening_threshold_id" UUID;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "scoring_threshold_id" UUID;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "approval_policy_id" UUID;

-- Step 2: Add creator tracking to screening_thresholds
ALTER TABLE "screening_thresholds" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;

-- Step 3: Add foreign key constraints
ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_screening_threshold"
  FOREIGN KEY ("screening_threshold_id")
  REFERENCES "screening_thresholds"("id")
  ON DELETE SET NULL;

ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_scoring_threshold"
  FOREIGN KEY ("scoring_threshold_id")
  REFERENCES "scoring_thresholds"("id")
  ON DELETE SET NULL;

ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_approval_policy"
  FOREIGN KEY ("approval_policy_id")
  REFERENCES "approval_policies"("id")
  ON DELETE SET NULL;

ALTER TABLE "screening_thresholds"
  ADD CONSTRAINT "fk_screening_threshold_creator"
  FOREIGN KEY ("created_by_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_application_screening_threshold"
  ON "applications"("screening_threshold_id");

CREATE INDEX IF NOT EXISTS "idx_application_scoring_threshold"
  ON "applications"("scoring_threshold_id");

CREATE INDEX IF NOT EXISTS "idx_application_approval_policy"
  ON "applications"("approval_policy_id");

CREATE INDEX IF NOT EXISTS "idx_screening_threshold_creator"
  ON "screening_thresholds"("created_by_id");

-- Step 5: Backfill existing applications with current thresholds
-- Backfill screening thresholds (uses submission date to find effective version)
UPDATE "applications" a
SET "screening_threshold_id" = (
  SELECT st.id
  FROM "screening_thresholds" st
  WHERE st.effective_from <= COALESCE(a.submitted_at, a.created_at)
  ORDER BY st.effective_from DESC
  LIMIT 1
)
WHERE "screening_threshold_id" IS NULL;

-- Backfill scoring thresholds (requires job family lookup via requisition)
UPDATE "applications" a
SET "scoring_threshold_id" = (
  SELECT sct.id
  FROM "scoring_thresholds" sct
  JOIN "requisitions" r ON r.job_family_id = sct.job_family_id
  WHERE a.requisition_id = r.id
    AND sct.effective_from <= COALESCE(a.submitted_at, a.created_at)
  ORDER BY sct.effective_from DESC
  LIMIT 1
)
WHERE "scoring_threshold_id" IS NULL;

-- Backfill approval policies (uses compensation context if available)
-- Note: This assumes application has compensation context (can be NULL if not tracked)
UPDATE "applications" a
SET "approval_policy_id" = (
  SELECT ap.id
  FROM "approval_policies" ap
  WHERE ap.effective_from <= COALESCE(a.submitted_at, a.created_at)
    AND ap.active = true
  ORDER BY ap.effective_from DESC
  LIMIT 1
)
WHERE "approval_policy_id" IS NULL;

-- Step 6: Add comment documentation
COMMENT ON COLUMN "applications"."screening_threshold_id" IS 'References the screening threshold version used when this application was screened. Ensures in-flight applications are not affected by policy changes.';
COMMENT ON COLUMN "applications"."scoring_threshold_id" IS 'References the scoring threshold version used when this application was scored. Ensures in-flight applications are not affected by policy changes.';
COMMENT ON COLUMN "applications"."approval_policy_id" IS 'References the approval policy version used when this application reached the approval stage. Ensures in-flight applications are not affected by policy changes.';
