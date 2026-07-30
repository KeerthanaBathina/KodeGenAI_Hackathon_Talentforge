-- US-003 TASK-003: allow controlled audit row purge after successful archival export
-- Deletes remain blocked by default; archival workflow must set app.audit_archive_purge=true

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.audit_archive_purge', true) = 'true' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'IMMUTABLE_AUDIT_RECORD'
    USING ERRCODE = '23001',
          HINT = 'audit_events is append-only: UPDATE is prohibited and DELETE requires archive purge bypass';
  RETURN NULL;
END;
$$;
