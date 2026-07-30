---
id: TASK-005
user_story: US-001
title: "Testing - End-to-End Audit Coverage Matrix and CI Regression Group"
status: done
priority: high
assigned_to: qa-team
estimated_hours: 5
layer: testing
dependencies: [TASK-001, TASK-002, TASK-003, TASK-004]
---

# TASK-005 - Testing - End-to-End Audit Coverage Matrix and CI Regression Group

## Objective

Deliver comprehensive automated validation that every required action type writes complete audit records and that performance/reliability guarantees hold in regression runs.

## Scope

Validate end-to-end:
- auth event logging
- decision event logging with reason context
- config change old/new capture
- communication and upload event logging
- async reliability and latency guardrails

## Technical Requirements

### 1. Coverage Matrix Tests

Add/extend integration tests for each required event family:
- `auth.*`
- `decision.*`
- `communication.*`
- `config.*`
- `upload.*`

### 2. Payload Completeness Assertions

For each validated event, assert presence of:
- `actor_id` (or explicit null/system semantics)
- `ip_address`
- `user_agent`
- `entity_type`
- `entity_id`
- expected payload fields (for example, `reason_code_id`, `oldValue`, `newValue`)

### 3. Deterministic Time and Ordering

Use deterministic fixtures for:
- timestamps
- timezone assumptions
- ordering checks in test assertions

### 4. CI Regression Grouping

Ensure new tests are part of CI-relevant suites:
- backend unit
- backend integration
- performance guardrail command

## Acceptance Criteria

- [x] All US-001 acceptance scenarios are covered by automated tests
- [x] Audit record completeness is asserted for each event family
- [x] Send/skip/retry reliability behavior is deterministic in tests
- [x] CI-relevant groups include new audit regression coverage

## Testing Requirements

- [x] Backend unit + integration tests
- [x] Worker and queue behavior tests
- [x] Performance guardrail regression test/script

## Files to Create/Modify

- `backend/src/routes/__tests__/audit-auth.integration.test.ts`
- `backend/src/routes/__tests__/audit-decisions.integration.test.ts`
- `backend/src/routes/__tests__/audit-config.integration.test.ts`
- `backend/src/routes/__tests__/audit-communications.integration.test.ts`
- `backend/src/routes/__tests__/audit-uploads.integration.test.ts`
- `backend/src/services/__tests__/auditService.integration.test.ts`
- `backend/src/db/__tests__/auditImmutability.integration.test.ts`
- `backend/package.json` (test script grouping if needed)

## Dependencies

- TASK-001 through TASK-004

## Notes

- Reuse existing audit verification helpers to avoid duplicated assertion logic.

## Completion Evidence

- `npm.cmd --prefix backend run test:audit:unit` passed (48/48).
- `npm.cmd --prefix backend run test:audit:integration` passed (19/19, 4 DB-gated skips when `DATABASE_URL` is not configured).
- `npm.cmd --prefix backend run benchmark:audit-latency` passed (`p95` delta remained below 10 ms for both benchmarked endpoints).
- `npm.cmd --prefix backend run test:audit:regression` passed end-to-end (unit + integration + benchmark).
