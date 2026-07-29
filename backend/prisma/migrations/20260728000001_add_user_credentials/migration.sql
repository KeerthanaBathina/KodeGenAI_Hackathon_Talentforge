-- CreateTable: user_credentials
-- Purpose: Store password hashes for internal staff users (admin, recruiter, etc.)
-- This enables password-based authentication in addition to OAuth

CREATE TABLE IF NOT EXISTS "user_credentials" (
    "user_id" UUID NOT NULL PRIMARY KEY,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "user_credentials_user_id_fkey" 
        FOREIGN KEY ("user_id") 
        REFERENCES "users"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS "idx_user_credentials_user_id" ON "user_credentials"("user_id");
