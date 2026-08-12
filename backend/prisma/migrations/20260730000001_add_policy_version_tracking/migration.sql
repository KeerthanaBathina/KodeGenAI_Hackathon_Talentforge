-- Step 1: Add policy version reference columns to applications table
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "screeningThresholdId" UUID;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "scoringThresholdId" UUID;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "approvalPolicyId" UUID;

-- Step 2: Add creator tracking to screening_thresholds
ALTER TABLE "screening_thresholds" ADD COLUMN IF NOT EXISTS "createdById" UUID;

-- Step 3: Add foreign key constraints
ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_screening_threshold"
  FOREIGN KEY ("screeningThresholdId")
  REFERENCES "screening_thresholds"("id")
  ON DELETE SET NULL;

ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_scoring_threshold"
  FOREIGN KEY ("scoringThresholdId")
  REFERENCES "scoring_thresholds"("id")
  ON DELETE SET NULL;

ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_approval_policy"
  FOREIGN KEY ("approvalPolicyId")
  REFERENCES "approval_policies"("id")
  ON DELETE SET NULL;

ALTER TABLE "screening_thresholds"
  ADD CONSTRAINT "fk_screening_threshold_creator"
  FOREIGN KEY ("createdById")
  REFERENCES "users"("id")
  ON DELETE SET NULL;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_application_screening_threshold"
  ON "applications"("screeningThresholdId");

CREATE INDEX IF NOT EXISTS "idx_application_scoring_threshold"
  ON "applications"("scoringThresholdId");

CREATE INDEX IF NOT EXISTS "idx_application_approval_policy"
  ON "applications"("approvalPolicyId");

CREATE INDEX IF NOT EXISTS "idx_screening_threshold_creator"
  ON "screening_thresholds"("createdById");

-- Step 5: Backfill existing applications with current thresholds
-- Backfill screening thresholds (uses submission date to find effective version)
UPDATE "applications" a
SET "screeningThresholdId" = (
  SELECT st.id
  FROM "screening_thresholds" st
  WHERE st."effective_from" <= COALESCE(a."submittedAt", a."createdAt")
  ORDER BY st."effective_from" DESC
  LIMIT 1
)
WHERE "screeningThresholdId" IS NULL;

-- Backfill scoring thresholds (requires job family lookup via requisition)
UPDATE "applications" a
SET "scoringThresholdId" = (
  SELECT sct.id
  FROM "scoring_thresholds" sct
  JOIN "requisitions" r ON r."jobFamilyId" = sct."jobFamilyId"
  WHERE a."requisitionId" = r.id
    AND sct."effectiveFrom" <= COALESCE(a."submittedAt", a."createdAt")
  ORDER BY sct."effectiveFrom" DESC
  LIMIT 1
)
WHERE "scoringThresholdId" IS NULL;

-- Backfill approval policies (uses compensation context if available)
-- Note: This assumes application has compensation context (can be NULL if not tracked)
UPDATE "applications" a
SET "approvalPolicyId" = (
  SELECT ap.id
  FROM "approval_policies" ap
  WHERE ap."effectiveFrom" <= COALESCE(a."submittedAt", a."createdAt")
    AND ap."active" = true
  ORDER BY ap."effectiveFrom" DESC
  LIMIT 1
)
WHERE "approvalPolicyId" IS NULL;

-- Step 6: Add comment documentation
COMMENT ON COLUMN "applications"."screeningThresholdId" IS 'References the screening threshold version used when this application was screened. Ensures in-flight applications are not affected by policy changes.';
COMMENT ON COLUMN "applications"."scoringThresholdId" IS 'References the scoring threshold version used when this application was scored. Ensures in-flight applications are not affected by policy changes.';
COMMENT ON COLUMN "applications"."approvalPolicyId" IS 'References the approval policy version used when this application reached the approval stage. Ensures in-flight applications are not affected by policy changes.';
