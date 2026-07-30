---
id: task_003
us_id: us_002
epic: EP-006
title: "Build Webhook Endpoint with Score Storage and Stage Progression"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-003 — Build Webhook Endpoint with Score Storage and Stage Progression

## Context

**User Story**: US-002 — HMAC Webhook Ingestion with Idempotent Score Processing  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 1, Scenario 4

The webhook endpoint serves as the integration point between external assessment providers and TalentForge. It must orchestrate HMAC validation, idempotency checking, score storage, and application stage progression in a reliable and auditable manner.

---

## Objective

Implement a production-ready webhook endpoint that:
- Accepts `POST /webhooks/assessment-score` requests from providers
- Orchestrates signature validation and idempotency checking
- Stores assessment scores in `assessment_sessions` table
- Advances application to next stage when assessment completes
- Creates comprehensive audit trail for all webhook processing

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Endpoint path | `POST /webhooks/assessment-score` |
| Authentication | HMAC signature validation (no bearer token required) |
| Content-Type | `application/json` |
| Raw body | Preserved as Buffer for HMAC validation |
| Response codes | 200 (success/duplicate), 400 (validation), 401 (auth), 404 (not found), 500 (server error) |
| Timeout | 30 seconds maximum processing time |
| Audit events | Created for success, duplicate, and failure cases |

---

## Implementation Steps

### Step 1 — Create webhook route

1. Create `backend/src/routes/webhooks.ts` with Express router
2. Add `POST /assessment-score` route handler
3. Apply middleware stack:
   - `express.raw({ type: 'application/json' })` for raw body preservation
   - `validateWebhookSignature` middleware from TASK-001
   - Request correlation ID generation
4. Parse validated JSON payload after signature check

### Step 2 — Implement webhook processing handler

1. Extract webhook payload fields: `sessionToken`, `score`, `completedAt`, `metadata`
2. Validate payload schema with Zod:
   ```typescript
   const AssessmentScoreWebhookSchema = z.object({
     sessionToken: z.string().min(1),
     score: z.number().min(0).max(100),
     completedAt: z.string().datetime(),
     metadata: z.record(z.unknown()).optional(),
   });
   ```
3. Call `checkDuplicateWebhook()` from TASK-002
4. If duplicate, return HTTP 200 with `{success: true, duplicate: true}`
5. If first-time, call `processWebhookScore()` to update session

### Step 3 — Integrate stage progression logic

1. After successful score storage, query application with current stage
2. Check if assessment stage prerequisites are now satisfied
3. Call stage progression service to mark assessment stage complete
4. Make next stage schedulable if assessment was blocking prerequisite
5. Log stage transition with before/after state for audit

### Step 4 — Create comprehensive audit events

1. Create audit event on successful webhook processing:
   - `eventType: 'webhook_received'`
   - `entityType: 'assessment_session'`
   - `entityId: session.id`
   - `payloadJson`: Include score, provider, timestamp, duplicate flag
2. Create audit event on webhook rejection:
   - `eventType: 'webhook_rejected'`
   - Include rejection reason (signature invalid, session not found, etc.)
3. Link audit events to application and provider for traceability

### Step 5 — Add error handling and observability

1. Wrap webhook handler in comprehensive try-catch
2. Map known errors to appropriate HTTP status codes
3. Log errors with correlation ID and provider context
4. Include webhook processing metrics:
   - Processing duration
   - Success/failure rate per provider
   - Duplicate detection rate

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Valid webhook processed | Integration test | Score stored, status updated, HTTP 200 |
| Stage progression triggered | Integration test | Assessment stage completed, next stage schedulable |
| Duplicate webhook handled | Integration test | HTTP 200 with duplicate flag, no data change |
| Invalid signature rejected | Integration test | HTTP 401, no data written |
| Missing session token | Integration test | HTTP 400 with validation error |
| Nonexistent session | Integration test | HTTP 404 with not found error |
| Audit events created | Integration test | Events logged for success and failure |
| Processing timeout | Load test | Returns 500 if exceeds 30 seconds |

---

## Dependencies

- TASK-001 (HMAC validation middleware) must be complete
- TASK-002 (Idempotency service) must be complete
- Stage progression service from EP-005 available
- `audit_events` table with webhook event types

## Security Constraints

- Endpoint must not be accessible without valid HMAC signature
- Sanitize all user-provided metadata before storage
- Rate-limit webhook endpoint per provider (e.g., 100/minute)
- Log suspicious webhook patterns (repeated failures, signature attacks)

---

## Definition of Done

- [x] `POST /webhooks/assessment-score` endpoint implemented
- [x] Middleware stack applied (raw body, HMAC validation, correlation ID)
- [x] Webhook payload validated with Zod schema
- [x] Idempotency check integrated with duplicate detection
- [x] Score storage updates session with completed status
- [x] Stage progression placeholder added (TODO for EP-005 integration)
- [x] Audit events created for all webhook processing outcomes
- [x] Error handling maps errors to appropriate HTTP status codes
- [x] Integration tests cover success, duplicate, and failure scenarios
- [x] Observability metrics instrumented (duration tracking, correlation IDs)

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-006 |
| Scenario | 1, 4 |
| FR | FR-040 |
| TR | TR-005.5 |
