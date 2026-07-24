-- Additive schema change for US-003
ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "userAgent" VARCHAR(512);

-- Ensure createdAt is timestamptz for immutable event chronology
ALTER TABLE "audit_events"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ;

-- Trigger function that blocks mutation attempts
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_AUDIT_RECORD'
    USING ERRCODE = '23001',
          HINT = 'audit_events is append-only: UPDATE and DELETE are prohibited';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON "audit_events";

CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE
  ON "audit_events"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_admin_select ON "audit_events";
DROP POLICY IF EXISTS audit_events_candidate_select ON "audit_events";
DROP POLICY IF EXISTS audit_events_hr_manager_select ON "audit_events";
DROP POLICY IF EXISTS audit_events_service_insert ON "audit_events";

CREATE POLICY audit_events_admin_select ON "audit_events"
  FOR SELECT
  USING (auth.role() = 'admin');

CREATE POLICY audit_events_candidate_select ON "audit_events"
  FOR SELECT
  USING (
    auth.role() = 'candidate'
    AND "actorId" = auth.uid()
  );

CREATE POLICY audit_events_hr_manager_select ON "audit_events"
  FOR SELECT
  USING (
    auth.role() = 'hr_manager'
    AND "actorId" = auth.uid()
  );

CREATE POLICY audit_events_service_insert ON "audit_events"
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
