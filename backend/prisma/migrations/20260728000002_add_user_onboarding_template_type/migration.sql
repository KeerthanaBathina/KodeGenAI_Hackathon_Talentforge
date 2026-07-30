-- AlterEnum: Add user_onboarding to TemplateType enum
-- This enables user onboarding email templates in the template system

-- Step 1: Add new enum value
ALTER TYPE "TemplateType" ADD VALUE IF NOT EXISTS 'user_onboarding';

-- Note: This migration is safe to run multiple times due to IF NOT EXISTS clause
-- The new template type will be used for sending onboarding emails with temporary passwords
