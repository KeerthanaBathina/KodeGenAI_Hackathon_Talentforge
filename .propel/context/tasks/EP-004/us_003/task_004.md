---
id: task_004
us_id: us_003
epic: EP-004
title: "Implement Override API, Audit Persistence, and Path Visibility Contract"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-004 — Implement Override API, Audit Persistence, and Path Visibility Contract

## Context

**User Story**: US-003 — Automatic Path Classification (Fresher vs. Experienced) with Recruiter Override  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 3, Scenario 4

Override operations must be secure, validated, and fully auditable.

---

## Objective

Implement backend override flow so that:
1. recruiter can override path with justification >= 20 chars
2. path is updated safely with authorization checks
3. audit trail records original/new path and justification context

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Endpoint | authenticated recruiter/HR path override route |
| Request body | `newPath`, `justification` (min 20) |
| Validation | disallow no-op override and invalid path transitions |
| Audit event | include `original_path`, `new_path`, `justification`, `actor_id`, timestamp |
| Data contract | expose path as read-only value in application detail responses |

---

## Implementation Steps

### Step 1 — Add override service and route

1. Add route/schema for override request.
2. Enforce role-based access and payload validation.
3. Call service method to update application path.

### Step 2 — Persist override and audit event

1. Read existing path and reject no-op changes.
2. Update `applications.path` and metadata.
3. Create `audit_events` record in same transaction.

### Step 3 — Expose path in read model

1. Ensure application detail/queue response includes current path as read-only field.
2. Keep mutation path limited to shortlist classification and explicit override action.
3. Add logs with actor, app id, original/new path, correlation id.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| short justification | API test | 400 validation failure |
| override valid request | integration test | path updated and response reflects new path |
| no-op override | API/integration test | rejected with deterministic error |
| audit persistence | DB assertion | audit payload includes original/new path + justification |

---

## Dependencies

- TASK-001/TASK-002 classification data model
- TASK-003 frontend payload contract

## Security Constraints

- Restrict override endpoint to authorized recruiter roles
- Avoid storing justification in plaintext logs; keep it in audit payload only

---

## Definition of Done

- [x] Override API validates min-20 justification and role authorization
- [x] Application path override persists correctly and rejects no-op overrides
- [x] Audit event captures full override context
- [x] Read endpoints expose path as read-only output field

## Completion Notes

- Added `POST /api/manual-review-queue/:id/path-override` with role gating and Zod validation.
- Override persistence and `audit_events` write execute in one transaction with deterministic domain errors (`PATH_NOT_SET`, `NO_OP_OVERRIDE`, `JUSTIFICATION_TOO_SHORT`).
- Path is exposed as read-only output in manual review queue payloads, decision response payloads, and application tracking detail payloads.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-004 |
| Scenario | 3, 4 |
| FR | FR-033 |
