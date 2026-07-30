# Audit Read Model Contract

This document defines the shared query and payload-output contract for audit log list and export APIs.

## Shared Query Filters

Both list and export endpoints must use `AuditLogQuerySchema` from `backend/src/services/auditLogQuerySchema.ts`.

Supported filters:
- `actorEmail`: normalized lowercase actor email search through `actor` relation
- `eventTypes`: multi-select list from comma-delimited or repeated query params
- `entityType`
- `entityId`
- `from`: inclusive lower bound for `createdAt`
- `to`: inclusive upper bound for `createdAt`
- `page`: default `1`
- `pageSize`: default `50`, maximum `200`

## Deterministic Ordering

Query ordering must always be:
1. `createdAt DESC`
2. `id DESC`

This ordering is shared by list and export to prevent record drift across pages and repeated exports.

## Index Strategy

The audit read path depends on the following indexes:
- `idx_audit_events_created_id` for chronological scans
- `idx_audit_events_event_created_id` for event-type filtered scans
- `idx_audit_events_entity_created_id` for entity-type/entity-id filtered scans
- `idx_audit_events_actor_created_id` for actor-id filtered scans

Actor email filters use the audit event actor relation (`audit_events.actorId -> users.id`) with the existing unique index on `users.email`.

## Payload Exposure Guardrails

Viewer and CSV output must not expose secrets from `payload`.

Redaction rules:
- redact keys that match sensitive patterns such as `password`, `token`, `secret`, `authorization`, `cookie`, `apiKey`, and similar variants
- apply redaction recursively for nested objects and arrays
- replace sensitive values with `[REDACTED]`

Serialization rules:
- viewer payloads return sanitized structured data
- CSV payloads serialize sanitized values with deterministic key ordering
- `null` or `undefined` payload values serialize to an empty string for CSV
