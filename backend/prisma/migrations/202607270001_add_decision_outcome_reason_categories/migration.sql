-- Add new reason code categories for decision outcomes
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'offer_decision';
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'reject_decision';
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'hold_decision';
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'withdraw_decision';

-- Add display_order column to reason_codes table for sorting
ALTER TABLE "reason_codes" ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0;

-- Add description column to reason_codes table
ALTER TABLE "reason_codes" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Rename displayText to label for consistency (if needed)
-- Note: This will be handled by updating the Prisma schema and regenerating the client

-- Create index for reason codes ordered by display_order
CREATE INDEX IF NOT EXISTS "idx_reason_codes_display_order" ON "reason_codes"("category", "displayOrder")
WHERE "active" = true;

-- Decision-outcome reason rows are seeded in a later transaction-safe step.

-- Add pdf_url column to decisions table
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "pdf_url" TEXT;

-- Add index for decisions with PDF URLs
CREATE INDEX IF NOT EXISTS "idx_decisions_pdf_url" ON "decisions"("pdf_url")
WHERE "pdf_url" IS NOT NULL;
