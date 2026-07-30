---
id: TASK-001
user_story: US-001
title: "Backend Foundation - Audit Event Taxonomy and Context Contract"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 4
layer: backend
dependencies: []
---

# TASK-001 - Backend Foundation - Audit Event Taxonomy and Context Contract

## Objective

Define and standardize a canonical audit event taxonomy and payload contract so all platform actions write consistent, compliance-grade audit records.

## Scope

Create the foundation for:
- canonical event naming (`domain.action` format)
- required audit metadata fields
- reusable context extraction from request/session state
- mapping strategy for existing legacy event names

## Technical Requirements

### 1. Canonical Event Taxonomy

Define and export 20+ event types grouped by domain:
- `auth.*` (login success/failure, logout, reset flows)
- `decision.*` (shortlist, reject, hold, withdraw)
- `communication.*` (queued, sent, failed, retried)
- `config.*` (threshold/policy updates)
- `upload.*` (resume upload, bulk import)
- `security.*` (signature failures, abuse/rate-limit events)

### 2. Required Audit Contract

Enforce required fields across all write paths:
- `event_type`
- `entity_type`
- `entity_id`
- `actor_id` (nullable for anonymous/system events)
- `ip_address`
- `user_agent`
- `payload_json`
- `created_at` (DB timestamp)

### 3. Request Context Builder

Provide reusable helper(s) to construct audit context from requests:
- resolve actor identity
- normalize IP and user-agent
- support service-level events without HTTP request object

### 4. Legacy Compatibility

Document migration strategy for existing non-canonical event names (for example, uppercase constants) and introduce compatibility mapping where needed.

## Acceptance Criteria

- [x] 20+ canonical event types are defined and documented
- [x] Required audit fields are consistently enforced by typed contract
- [x] Shared context builder is available for routes/services/middleware
- [x] Legacy event naming compatibility strategy is documented

## Testing Requirements

- [x] Unit tests validate event type constants and context extraction
- [x] Contract tests validate required-field enforcement and payload schema consistency

## Files to Create/Modify

- `backend/src/constants/auditEventTypes.ts`
- `backend/src/services/auditService.ts`
- `backend/src/services/auditContextService.ts` (or equivalent helper)
- `backend/src/services/__tests__/auditEventTypes.test.ts`
- `backend/src/services/__tests__/auditContextService.test.ts`
- `docs/ops/audit-event-taxonomy.md`

## Dependencies

- EP-DATA / US-003 immutable `audit_events` table and trigger

## Notes

- Keep taxonomy stable and additive to prevent breaking downstream compliance reporting.
