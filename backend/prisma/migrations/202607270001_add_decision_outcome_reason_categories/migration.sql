-- Add new reason code categories for decision outcomes
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'offer_decision';
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'reject_decision';
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'hold_decision';
ALTER TYPE "ReasonCodeCategory" ADD VALUE IF NOT EXISTS 'withdraw_decision';

-- Add display_order column to reason_codes table for sorting
ALTER TABLE "reason_codes" ADD COLUMN IF NOT EXISTS "display_order" INTEGER NOT NULL DEFAULT 0;

-- Add description column to reason_codes table
ALTER TABLE "reason_codes" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Rename displayText to label for consistency (if needed)
-- Note: This will be handled by updating the Prisma schema and regenerating the client

-- Create index for reason codes ordered by display_order
CREATE INDEX IF NOT EXISTS "idx_reason_codes_display_order" ON "reason_codes"("category", "display_order")
WHERE "active" = true;

-- Insert decision-related reason codes
-- Offer decision reasons
INSERT INTO "reason_codes" ("category", "code", "display_text", "description", "display_order", "active") VALUES
('offer_decision', 'top_candidate', 'Top Candidate', 'Best overall candidate for the role', 1, true),
('offer_decision', 'exceptional_fit', 'Exceptional Cultural Fit', 'Outstanding alignment with team values', 2, true),
('offer_decision', 'unique_skills', 'Unique Skill Set', 'Rare or highly valuable skills', 3, true)
ON CONFLICT (category, code) DO NOTHING;

-- Reject decision reasons
INSERT INTO "reason_codes" ("category", "code", "display_text", "description", "display_order", "active") VALUES
('reject_decision', 'skills_gap', 'Skills Gap', 'Candidate lacks required technical skills', 1, true),
('reject_decision', 'experience_insufficient', 'Insufficient Experience', 'Years of experience below requirements', 2, true),
('reject_decision', 'culture_fit', 'Cultural Fit Concerns', 'Team fit or values alignment issues', 3, true),
('reject_decision', 'salary_expectations', 'Salary Expectations Misaligned', 'Compensation requirements not aligned', 4, true),
('reject_decision', 'better_candidate', 'Stronger Candidate Selected', 'Another candidate was better qualified', 5, true),
('reject_decision', 'failed_assessment', 'Failed Technical Assessment', 'Did not meet technical assessment threshold', 6, true),
('reject_decision', 'availability', 'Availability Constraints', 'Start date or schedule conflicts', 7, true)
ON CONFLICT (category, code) DO NOTHING;

-- Hold decision reasons
INSERT INTO "reason_codes" ("category", "code", "display_text", "description", "display_order", "active") VALUES
('hold_decision', 'budget_review', 'Budget Under Review', 'Position funding pending approval', 1, true),
('hold_decision', 'req_freeze', 'Requisition Freeze', 'Hiring temporarily paused', 2, true),
('hold_decision', 'awaiting_feedback', 'Awaiting Additional Feedback', 'Need input from additional stakeholders', 3, true),
('hold_decision', 'candidate_request', 'Candidate Requested Delay', 'Candidate asked to pause process', 4, true)
ON CONFLICT (category, code) DO NOTHING;

-- Withdraw decision reasons
INSERT INTO "reason_codes" ("category", "code", "display_text", "description", "display_order", "active") VALUES
('withdraw_decision', 'candidate_declined', 'Candidate Declined Offer', 'Candidate rejected the offer', 1, true),
('withdraw_decision', 'candidate_withdrew', 'Candidate Withdrew', 'Candidate withdrew from process', 2, true),
('withdraw_decision', 'position_filled', 'Position Already Filled', 'Role filled by another candidate', 3, true),
('withdraw_decision', 'req_cancelled', 'Requisition Cancelled', 'Position no longer open', 4, true)
ON CONFLICT (category, code) DO NOTHING;

-- Add pdf_url column to decisions table
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "pdf_url" TEXT;

-- Add index for decisions with PDF URLs
CREATE INDEX IF NOT EXISTS "idx_decisions_pdf_url" ON "decisions"("pdf_url")
WHERE "pdf_url" IS NOT NULL;
