---
id: TASK-002
user_story: US-001
title: "Infrastructure - Async Audit Logging Queue and Worker"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 6
layer: backend
dependencies: [TASK-001]
---

# TASK-002 - Infrastructure - Async Audit Logging Queue and Worker

## Objective

Implement fire-and-forget asynchronous audit logging using BullMQ to minimize request latency while preserving reliable audit persistence.

## Scope

Build:
- dedicated audit event queue
- worker that persists queued events to `audit_events`
- retry and dead-letter handling
- integration with existing worker startup and observability patterns

## Technical Requirements

### 1. Queue Definition

Create `auditEventQueue` with:
- explicit job payload contract
- retry policy and backoff
- dedupe/idempotency key support for replays
- non-blocking enqueue API for request paths

### 2. Worker Persistence

Create `auditEventWorker` that:
- consumes queue jobs
- writes events through `auditService`/Prisma
- handles transient vs permanent failures
- records structured error logs on failures

### 3. Fail-Open Application Behavior

If enqueue fails:
- request path continues (no user-facing failure for audit-path errors)
- operational errors are logged and observable
- optional fallback direct-write behavior is explicitly defined

### 4. Worker Registration and Runtime

Integrate with worker bootstrap:
- register new worker in worker startup path
- ensure graceful shutdown hooks handle audit worker

## Acceptance Criteria

- [x] Audit events are enqueued asynchronously from request paths
- [x] Worker persists queued events to `audit_events`
- [x] Retry and failure handling is deterministic and observable
- [x] Request path remains non-blocking on audit pipeline issues

## Testing Requirements

- [x] Queue unit tests for payload validation and retry options
- [x] Worker tests for success/failure/retry branches
- [x] Integration test verifying queued event is persisted

## Files to Create/Modify

- `backend/src/queues/auditEventQueue.ts`
- `backend/src/workers/auditEventWorker.ts`
- `backend/src/services/auditService.ts`
- `backend/src/startWorkers.ts`
- `backend/src/queues/__tests__/auditEventQueue.test.ts`
- `backend/src/workers/__tests__/auditEventWorker.test.ts`

## Dependencies

- TASK-001 taxonomy and audit contract

## Notes

- Queue defaults should be tuned for reliability-first behavior with bounded retries.
