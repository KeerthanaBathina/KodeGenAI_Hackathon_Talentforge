-- Add manual_review_reason to applications
ALTER TABLE "applications" ADD COLUMN "manual_review_reason" VARCHAR(100);

-- Add index for manual review queue queries
CREATE INDEX "idx_applications_manual_review_queue" ON "applications"("status", "created_at")
WHERE "status" = 'pending_review';

-- Add index for confidence-based queries (confidence field already exists)
CREATE INDEX "idx_screenings_low_confidence" ON "screenings"("confidence")
WHERE "confidence" < 0.5;
