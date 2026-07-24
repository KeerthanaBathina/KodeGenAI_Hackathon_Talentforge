-- US-003: AI Screening Score Computation with Configurable Thresholds
-- Migration: Add screening system components

-- Step 1: Add parsedData to resumes table
ALTER TABLE "resumes" 
ADD COLUMN IF NOT EXISTS "parsed_data" JSONB;

COMMENT ON COLUMN "resumes"."parsed_data" IS 'Parsed resume content from spaCy NER extraction (skills, experience_years, education, employers)';

-- Step 2: Add screening-related fields to requisitions table
ALTER TABLE "requisitions"
ADD COLUMN IF NOT EXISTS "required_skills" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "preferred_skills" TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "min_experience_years" INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS "education_level" VARCHAR(50);

COMMENT ON COLUMN "requisitions"."required_skills" IS 'Required skills for candidate screening';
COMMENT ON COLUMN "requisitions"."preferred_skills" IS 'Preferred skills for candidate screening';
COMMENT ON COLUMN "requisitions"."min_experience_years" IS 'Minimum years of experience required';
COMMENT ON COLUMN "requisitions"."education_level" IS 'Required education level (high_school, bachelors, masters, phd)';

-- Step 3: Add recommendation and threshold_version to screenings table
ALTER TABLE "screenings"
ADD COLUMN IF NOT EXISTS "recommendation" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "threshold_version" INTEGER,
ADD COLUMN IF NOT EXISTS "screened_at" TIMESTAMPTZ DEFAULT NOW();

-- Rename factorsJson to factors for consistency
ALTER TABLE "screenings" 
RENAME COLUMN "factors_json" TO "factors";

COMMENT ON COLUMN "screenings"."recommendation" IS 'Screening recommendation: shortlist, manual_review, or reject';
COMMENT ON COLUMN "screenings"."threshold_version" IS 'Version of threshold configuration used for this screening';
COMMENT ON COLUMN "screenings"."screened_at" IS 'Timestamp when screening was performed';

-- Step 4: Create screening_thresholds table (simplified, not tied to job_families)
CREATE TABLE IF NOT EXISTS "screening_thresholds" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shortlist_threshold" INTEGER NOT NULL CHECK (shortlist_threshold >= 0 AND shortlist_threshold <= 100),
  "borderline_min" INTEGER NOT NULL CHECK (borderline_min >= 0 AND borderline_min <= 100),
  "borderline_max" INTEGER NOT NULL CHECK (borderline_max >= 0 AND borderline_max <= 100),
  "reject_threshold" INTEGER NOT NULL CHECK (reject_threshold >= 0 AND reject_threshold <= 100),
  "version" INTEGER NOT NULL DEFAULT 1,
  "effective_from" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "check_threshold_ordering" CHECK (
    reject_threshold < borderline_min AND 
    borderline_max < shortlist_threshold
  )
);

COMMENT ON TABLE "screening_thresholds" IS 'Configurable thresholds for AI screening recommendations';
COMMENT ON COLUMN "screening_thresholds"."shortlist_threshold" IS 'Minimum score for automatic shortlist (e.g., 75)';
COMMENT ON COLUMN "screening_thresholds"."borderline_min" IS 'Minimum score for manual review range (e.g., 40)';
COMMENT ON COLUMN "screening_thresholds"."borderline_max" IS 'Maximum score for manual review range (e.g., 74)';
COMMENT ON COLUMN "screening_thresholds"."reject_threshold" IS 'Maximum score for automatic rejection (e.g., 39)';
COMMENT ON COLUMN "screening_thresholds"."version" IS 'Threshold version number for audit trail';

-- Create index for efficient active threshold lookups
CREATE INDEX IF NOT EXISTS "idx_screening_thresholds_effective" 
ON "screening_thresholds"("effective_from" DESC);

-- Step 5: Insert default threshold configuration
INSERT INTO "screening_thresholds" (
  "shortlist_threshold",
  "borderline_min",
  "borderline_max",
  "reject_threshold",
  "version",
  "effective_from"
) VALUES (
  75,  -- shortlist at 75+
  40,  -- borderline starts at 40
  74,  -- borderline ends at 74
  39,  -- reject at 39 or below
  1,   -- initial version
  '2026-07-24 00:00:00+00'
) ON CONFLICT DO NOTHING;

-- Step 6: Add application status enum values for screening
-- Note: ApplicationStatus enum already includes screening-related statuses
-- (screening, pending_review, shortlisted, rejected)

-- Step 7: Create indexes for screening queries
CREATE INDEX IF NOT EXISTS "idx_screenings_recommendation" 
ON "screenings"("recommendation");

CREATE INDEX IF NOT EXISTS "idx_screenings_screened_at" 
ON "screenings"("screened_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_applications_screening_status" 
ON "applications"("status") 
WHERE "status" IN ('screening', 'pending_review', 'shortlisted', 'screening_rejected');

-- Step 8: Enable Row-Level Security for screening_thresholds
ALTER TABLE "screening_thresholds" ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read thresholds
CREATE POLICY "screening_thresholds_read_policy" 
ON "screening_thresholds"
FOR SELECT
USING (true);

-- Policy: Only admins can insert/update thresholds
CREATE POLICY "screening_thresholds_write_policy" 
ON "screening_thresholds"
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM "users" 
    WHERE "users"."id" = current_setting('app.current_user_id', true)::uuid 
    AND "users"."role" = 'admin'
  )
);
