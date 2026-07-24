-- US-001 registration + OTP persistence schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CandidateStatus_new'
  ) THEN
    CREATE TYPE "CandidateStatus_new" AS ENUM ('pending', 'pending_verification', 'active', 'anonymized');
  END IF;
END $$;

ALTER TABLE "candidates"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "candidates"
  ALTER COLUMN "status" TYPE "CandidateStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'pending' THEN 'pending_verification'
      ELSE "status"::text
    END
  )::"CandidateStatus_new";

DROP TYPE "CandidateStatus";
ALTER TYPE "CandidateStatus_new" RENAME TO "CandidateStatus";

ALTER TABLE "candidates"
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "consentVersion" SET DEFAULT '1.0',
  ALTER COLUMN "consentTimestamp" SET DEFAULT NOW(),
  ALTER COLUMN "status" SET DEFAULT 'pending_verification'::"CandidateStatus";

ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "candidatePublicId" VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'candidates_candidatePublicId_key'
  ) THEN
    CREATE UNIQUE INDEX "candidates_candidatePublicId_key"
      ON "candidates" ("candidatePublicId");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'OtpChallengePurpose'
  ) THEN
    CREATE TYPE "OtpChallengePurpose" AS ENUM ('registration');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "candidate_credentials" (
  "candidateId" UUID NOT NULL,
  "passwordHash" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "candidate_credentials_pkey" PRIMARY KEY ("candidateId"),
  CONSTRAINT "candidate_credentials_candidateId_fkey"
    FOREIGN KEY ("candidateId")
    REFERENCES "candidates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "candidate_otp_challenges" (
  "id" UUID NOT NULL,
  "candidateId" UUID NOT NULL,
  "purpose" "OtpChallengePurpose" NOT NULL DEFAULT 'registration',
  "otpHash" VARCHAR(128) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "consumedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "candidate_otp_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_otp_challenges_candidateId_fkey"
    FOREIGN KEY ("candidateId")
    REFERENCES "candidates"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_candidate_otp_challenge_lookup"
  ON "candidate_otp_challenges" ("candidateId", "purpose", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "idx_candidate_otp_expires_at"
  ON "candidate_otp_challenges" ("expiresAt");
