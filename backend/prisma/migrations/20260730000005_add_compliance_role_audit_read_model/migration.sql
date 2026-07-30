-- US-002 TASK-001: Compliance role and audit read-model index readiness

-- 1) Compliance role foundation
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'compliance';

-- 2) Deterministic audit read ordering + filtered access paths
DROP INDEX IF EXISTS "idx_audit_events_entity";
DROP INDEX IF EXISTS "idx_audit_events_actor";

CREATE INDEX IF NOT EXISTS "idx_audit_events_created_id"
  ON "audit_events"("createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_events_event_created_id"
  ON "audit_events"("eventType", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_events_entity_created_id"
  ON "audit_events"("entityType", "entityId", "createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_audit_events_actor_created_id"
  ON "audit_events"("actorId", "createdAt" DESC, "id" DESC);
