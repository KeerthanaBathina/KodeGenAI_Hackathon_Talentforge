---
id: task_001
us_id: us_004
epic: EP-004
title: "Implement Bulk Reject Backend API and Transactional Decision Pipeline"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-001 — Implement Bulk Reject Backend API and Transactional Decision Pipeline

## Context

**User Story**: US-004 — Bulk Reject Action and Real-Time Queue Notifications via WebSocket  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 4

Bulk rejection must process multiple pending-review applications in one request while preserving per-application audit and communication side effects.

---

## Objective

Implement backend bulk reject orchestration so that:
1. one API call rejects multiple selected applications
2. all valid applications transition to `rejected` in a single transactional operation
3. rejection communications are queued per application with shared reason code

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Endpoint | `POST /api/manual-review-queue/bulk-reject` |
| Request body | `applicationIds: string[]`, `reasonCode: string`, `comment?: string` |
| Minimum selection | reject request when `applicationIds.length < 2` |
| Domain eligibility | only `pending_review` applications are mutable |
| Transaction behavior | atomic reject state update + review + audit + communication queue records |
| Response | processed count, rejected IDs, skipped IDs with deterministic reasons |

---

## Implementation Steps

### Step 1 — Add route schema and authorization

1. Add bulk reject route to manual review queue router.
2. Validate payload shape and minimum selected count.
3. Restrict endpoint to authorized HR reviewer/manager roles.

### Step 2 — Implement service-level bulk reject logic

1. Load and validate target applications in a single query.
2. Reject invalid states with structured skip reasons.
3. Persist status transition, review records, and audit events transactionally.

### Step 3 — Queue rejection notifications

1. Resolve rejection template once per batch and apply candidate-specific render context.
2. Create queued communication records for each rejected application.
3. Return deterministic batch summary for frontend refresh behavior.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| valid 5-id bulk reject | integration test | all 5 statuses become `rejected` in one request |
| one selected id | API test | `400` with minimum-selection message |
| non-pending application included | integration test | deterministic skip reason returned |
| communication queue side effect | DB assertion | one queued rejection communication per rejected application |

---

## Dependencies

- EP-004 / US-001 manual review queue routing and decision model
- Existing reason-code validation and rejection template infrastructure

## Security Constraints

- Validate all application IDs server-side; never trust client-side selection state
- Avoid leaking candidate-sensitive fields in batch error responses

---

## Definition of Done

- [x] Backend bulk reject endpoint implemented and role-guarded
- [x] Minimum selection constraint enforced server-side
- [x] Batch rejection updates status and review state correctly
- [x] Rejection communications queued per application in same operation
- [x] Integration tests cover success and failure branches

## Completion Notes

- Added `POST /api/manual-review-queue/bulk-reject` in `manualReviewQueue` route with role authorization (`hr_reviewer`, `hr_manager`) and strict payload validation.
- Implemented transactional `bulkRejectApplications` service flow with deterministic skip reasons (`NOT_FOUND`, `NOT_PENDING_REVIEW`) and per-application side effects (review, queued communication, audit event).
- Bulk response contract now returns only required action summary fields (`processedCount`, `rejectedIds`, `skipped`, `reasonCode`, `correlationId`, `communicationsQueued`) without exposing internal communication IDs.
- Added route integration tests for happy-path, minimum-selection validation, invalid reason code, and unauthorized role handling.
- Added DB-backed service integration tests for status transitions, skip behavior, communication queue side effects, and audit payload assertions.

## Validation Notes

- Route integration tests: `npm --prefix backend run test:integration -- src/routes/__tests__/manualReviewQueue.integration.test.ts` -> passing (18 tests).
- Service integration test suite additions are in place, but executing them in this session requires environment variables (`DATABASE_URL`, `DIRECT_URL`, Redis/Supabase vars) to be configured.

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-004 |
| Scenario | 1, 2, 4 |
| FR | FR-035 |
