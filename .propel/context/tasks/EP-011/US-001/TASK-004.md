---
id: TASK-004
user_story: US-001
title: "Performance and Reliability - Latency Guardrail, Idempotency, and Audit Evidence"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 5
layer: backend
dependencies: [TASK-002, TASK-003]
---

# TASK-004 - Performance and Reliability - Latency Guardrail, Idempotency, and Audit Evidence

## Objective

Guarantee that audit logging remains low-latency and reliable under retries/failures, with measurable evidence that API performance impact is within target.

## Scope

Implement and validate:
- P95 latency benchmark harness for audited endpoints
- idempotency safeguards to avoid duplicate audit records on retries
- structured operational telemetry for queue and worker behavior

## Technical Requirements

### 1. Latency Benchmarking

Benchmark `POST /decisions` (and at least one auth endpoint) with:
- audit logging disabled/bypassed
- audit logging enabled with queue enqueue

Measure and report:
- P50/P95/P99 latency
- delta between baseline and audit-enabled runs

### 2. Idempotent Audit Persistence

Prevent duplicate records caused by retries/replays:
- deterministic idempotency key on audit jobs
- duplicate protection at queue/job or persistence layer
- explicit handling and logging for duplicate suppression path

### 3. Observability and Operational Evidence

Capture structured metrics/logging for:
- enqueue success/failure
- queue retry counts
- worker failure categories
- audit write success rate

## Acceptance Criteria

- [x] P95 latency delta for audited request path is < 10 ms
- [x] Retry/replay paths do not create duplicate audit records
- [x] Queue/worker telemetry exposes reliability signals for operations
- [x] Performance evidence is reproducible via script/test command

## Testing Requirements

- [x] Performance test script with repeatable fixture inputs
- [x] Integration test for duplicate-suppression/idempotency path
- [x] Failure-path test proving request remains successful on enqueue failure

## Files to Create/Modify

- `backend/scripts/benchmark-audit-latency.ts`
- `backend/src/services/auditService.ts`
- `backend/src/queues/auditEventQueue.ts`
- `backend/src/workers/auditEventWorker.ts`
- `backend/src/workers/__tests__/auditEventWorker.test.ts`
- `backend/src/routes/__tests__/audit-latency.guardrail.integration.test.ts`

## Dependencies

- TASK-002 async queue infrastructure
- TASK-003 instrumentation coverage

## Notes

- Use deterministic payload sizes and request fixtures to avoid noisy benchmark results.

## Completion Evidence

- `npm.cmd --prefix backend run test -- src/queues/__tests__/auditEventQueue.test.ts src/workers/__tests__/auditEventWorker.test.ts src/services/__tests__/auditService.test.ts --run` passed (28/28).
- `npm.cmd --prefix backend run test:integration -- src/routes/__tests__/audit-latency.guardrail.integration.test.ts` passed (3/3).
- `npm.cmd --prefix backend run benchmark:audit-latency` passed with p95 deltas under 10 ms for benchmarked endpoints.
