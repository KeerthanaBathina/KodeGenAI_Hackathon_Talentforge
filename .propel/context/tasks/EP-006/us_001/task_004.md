---
id: task_004
us_id: us_001
epic: EP-006
title: "Add Retry, Backoff, and Launch Failure Escalation"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-27
---

# TASK-004 — Add Retry, Backoff, and Launch Failure Escalation

## Context

**User Story**: US-001 — External Assessment Launch API — POST to Provider and Return Test URL  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 2

Provider outages are expected. The launch flow requires deterministic retry behavior and clear recruiter alerting when retries are exhausted.

---

## Objective

Implement resilient failure handling for provider launch calls:
- retry on retryable errors (including HTTP 503)
- retry up to 3 attempts with 30-second intervals
- mark assessment launch as failed after exhaustion and notify recruiter

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Retryable conditions | HTTP 503, network timeout, and temporary transport failures |
| Retry policy | Maximum 3 attempts total with 30-second interval between attempts |
| Final failure status | `launch_failed` on exhaustion |
| Failure notification | Recruiter alert with actionable retry/support message |
| Observability | Structured attempt logs with correlation ID and attempt index |

---

## Implementation Steps

### Step 1 — Implement retry orchestration

1. Wrap provider launch call with retry policy.
2. Apply fixed 30-second delay between attempts.
3. Stop retrying for non-retryable errors (4xx contract failures, auth failures).

### Step 2 — Persist final failure state

1. On retry exhaustion, update/create launch record state as `launch_failed`.
2. Record terminal failure reason code.
3. Ensure no partial success state remains.

### Step 3 — Recruiter alert and audit logging

1. Trigger recruiter-facing failure notification.
2. Record launch failure event in `audit_events`.
3. Include attempt count and correlation data.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| HTTP 503 simulation | integration test | Exactly 3 attempts, each spaced 30 seconds |
| Non-retryable 4xx | integration test | No retry loop; immediate failure response |
| Retry exhaustion | integration test | Status set to `launch_failed` and recruiter alerted |
| Audit failure event | DB assertion | Failure event exists with attempt metadata |

---

## Dependencies

- TASK-002 launch adapter
- Notification channel for recruiter alerts

## Security Constraints

- Do not leak provider internal errors directly to end users
- Apply rate limits to prevent abuse of launch endpoint

---

## Definition of Done

- [x] Retry policy implemented for retryable provider failures
- [x] 3-attempt/30-second retry behavior verified
- [x] Exhausted failures set status to `launch_failed`
- [x] Recruiter alerted after terminal failure
- [x] Audit event written for failed launch path

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-006 |
| Scenario | 2 |
| FR | FR-044 |
| TR | TR-005.4 |
