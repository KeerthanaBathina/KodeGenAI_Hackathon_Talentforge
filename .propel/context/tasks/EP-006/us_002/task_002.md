---
id: task_002
us_id: us_002
epic: EP-006
title: "Implement Idempotent Webhook Processing with Session Token Check"
status: completed
layer: backend
effort: 3h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-002 — Implement Idempotent Webhook Processing with Session Token Check

## Context

**User Story**: US-002 — HMAC Webhook Ingestion with Idempotent Score Processing  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 3

Assessment providers use at-least-once delivery guarantees for webhooks, meaning duplicate deliveries are expected and must be handled gracefully. The session token serves as a natural idempotency key to ensure duplicate webhooks do not create duplicate score records or corrupt existing data.

---

## Objective

Implement idempotent webhook processing that:
- Uses `sessionToken` from webhook payload as idempotency key
- Checks for existing completed assessment session before processing
- Returns HTTP 200 on duplicate delivery without modifying data
- Ensures atomic score update with status transition
- Logs duplicate deliveries for observability

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Idempotency key | `sessionToken` from webhook payload |
| Duplicate check | Query `assessment_sessions` for existing session with token and `completed` status |
| Duplicate response | HTTP 200 with `{success: true, duplicate: true}` body |
| First-time processing | Update session score and status atomically in single transaction |
| Race condition handling | Use database-level upsert or transaction isolation to prevent concurrent duplicates |
| Audit trail | Log webhook receipt with duplicate flag for troubleshooting |

---

## Implementation Steps

### Step 1 — Design webhook payload schema

1. Define TypeScript interface for webhook payload:
   ```typescript
   interface AssessmentScoreWebhook {
     sessionToken: string;
     score: number;
     completedAt: string;
     metadata?: Record<string, unknown>;
   }
   ```
2. Add Zod validation schema for webhook request body
3. Validate required fields: `sessionToken`, `score`, `completedAt`
4. Validate score is within expected range (0-100 or provider-specific)

### Step 2 — Implement idempotency check service

1. Create `backend/src/services/webhookIdempotencyService.ts`
2. Add `checkDuplicateWebhook(sessionToken: string)` function
3. Query `assessment_sessions` for existing session with:
   - `sessionToken` matches
   - `status = 'completed'` (already processed)
4. Return boolean indicating if webhook is duplicate

### Step 3 — Implement atomic score update

1. Create `backend/src/services/assessmentScoreService.ts`
2. Add `processWebhookScore()` function with transaction:
   ```typescript
   await prisma.$transaction(async (tx) => {
     const session = await tx.assessmentSession.findUnique({
       where: { sessionToken },
       include: { application: true }
     });
     
     if (!session) {
       throw new NotFoundError('SESSION_NOT_FOUND');
     }
     
     if (session.status === 'completed') {
       return { duplicate: true };
     }
     
     await tx.assessmentSession.update({
       where: { id: session.id },
       data: {
         score: payload.score,
         completedAt: new Date(payload.completedAt),
         status: 'completed',
         metadata: { ...session.metadata, webhookMetadata: payload.metadata }
       }
     });
     
     return { duplicate: false, session };
   });
   ```
3. Ensure transaction isolation level prevents race conditions

### Step 4 — Add duplicate detection logging

1. Log webhook receipt with correlation ID and session token
2. Include `isDuplicate` flag in log structured data
3. Add metrics for duplicate webhook count per provider

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| First webhook processed | Integration test | Score stored, status = completed, HTTP 200 |
| Duplicate webhook ignored | Integration test | No data change, HTTP 200 with duplicate flag |
| Concurrent duplicates handled | Load test with parallel requests | Only one score update, others return duplicate |
| Invalid session token | Unit test | HTTP 404 with SESSION_NOT_FOUND |
| Race condition prevention | Concurrency test | No duplicate score records created |
| Audit trail completeness | Integration test | All webhook receipts logged with duplicate flag |

---

## Dependencies

- TASK-001 (HMAC signature validation) must be complete
- `assessment_sessions` table with `sessionToken` unique constraint
- Prisma transaction support configured

## Security Constraints

- Validate session token format before database query to prevent injection
- Ensure idempotency check cannot be bypassed by attackers
- Rate-limit duplicate webhook attempts per session token

---

## Definition of Done

- [x] Webhook payload schema defined and validated with Zod
- [x] Idempotency check service implemented with session token lookup
- [x] Atomic score update with transaction isolation
- [x] HTTP 200 response on duplicate delivery without data modification
- [x] Duplicate detection logged for observability
- [x] Unit tests cover first-time and duplicate processing
- [x] Integration tests verify idempotency with concurrent requests
- [x] Race condition handling validated with load tests

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-006 |
| Scenario | 3 |
| FR | FR-040 |
| TR | TR-005.5 |
