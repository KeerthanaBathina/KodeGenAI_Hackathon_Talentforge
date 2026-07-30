-- US-003 TASK-001: GDPR erasure request and retention metadata foundation

DO $$
BEGIN
  CREATE TYPE "GdprErasureRequestStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "candidates"
  ADD COLUMN IF NOT EXISTS "anonymised_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "anonymisation_version" VARCHAR(32);

CREATE TABLE IF NOT EXISTS "gdpr_erasure_requests" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "candidate_id" UUID NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "due_at" TIMESTAMPTZ NOT NULL,
  "status" "GdprErasureRequestStatus" NOT NULL DEFAULT 'pending',
  "processed_at" TIMESTAMPTZ,
  "failure_reason" TEXT,
  "request_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "chk_gdpr_erasure_due_after_requested" CHECK ("due_at" >= "requested_at")
);

CREATE INDEX IF NOT EXISTS "idx_gdpr_erasure_candidate_status_requested"
  ON "gdpr_erasure_requests"("candidate_id", "status", "requested_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_gdpr_erasure_status_due"
  ON "gdpr_erasure_requests"("status", "due_at");

CREATE UNIQUE INDEX IF NOT EXISTS "uq_gdpr_erasure_candidate_pending"
  ON "gdpr_erasure_requests"("candidate_id")
  WHERE "status" = 'pending';

CREATE TABLE IF NOT EXISTS "audit_archive_index" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "source_window_start" TIMESTAMPTZ NOT NULL,
  "source_window_end" TIMESTAMPTZ NOT NULL,
  "row_count" INTEGER NOT NULL,
  "storage_path" VARCHAR(1024) NOT NULL,
  "checksum" VARCHAR(128) NOT NULL,
  "hash_algorithm" VARCHAR(32) NOT NULL DEFAULT 'sha256',
  "archived_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "chk_audit_archive_row_count_non_negative" CHECK ("row_count" >= 0),
  CONSTRAINT "chk_audit_archive_window" CHECK ("source_window_end" >= "source_window_start")
);

CREATE INDEX IF NOT EXISTS "idx_audit_archive_window"
  ON "audit_archive_index"("source_window_start", "source_window_end");

CREATE INDEX IF NOT EXISTS "idx_audit_archive_archived_at"
  ON "audit_archive_index"("archived_at" DESC);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_audit_archive_storage_path"
  ON "audit_archive_index"("storage_path");
