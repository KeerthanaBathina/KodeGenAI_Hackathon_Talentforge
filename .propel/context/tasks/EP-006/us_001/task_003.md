---
id: task_003
us_id: us_001
epic: EP-006
title: "Deliver Candidate Launch Email and Record Audit Event"
status: completed
layer: integration
effort: 4h
priority: high
created: 2026-07-27
---

# TASK-003 — Deliver Candidate Launch Email and Record Audit Event

## Context

**User Story**: US-001 — External Assessment Launch API — POST to Provider and Return Test URL  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 1

After successful launch, the candidate must receive the test link within two minutes and the action must be traceable in `audit_events`.

---

## Objective

Implement post-launch side effects:
- dispatch candidate notification email with test URL
- enforce/send within 2-minute SLA from successful launch
- write launch audit event with actor, application, provider, and outcome

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Notification trigger | Runs only after successful provider launch and session persistence |
| Email payload | Candidate-safe content with launch link and expiration instructions if available |
| Delivery SLA | Queue/start send flow so candidate receives email within 2 minutes |
| Audit event type | `assessment_launch_initiated` (or canonical project equivalent) |
| Audit metadata | Includes `application_id`, `provider_id`, `assessment_session_id`, actor role/id |

---

## Implementation Steps

### Step 1 — Add notification command/event

1. Publish launch-success event or direct command to notification service.
2. Include all required template tokens and trace IDs.
3. Add fallback handling for transient mail transport failure.

### Step 2 — Integrate with email template flow

1. Use configured assessment launch email template.
2. Embed test URL and basic guidance text.
3. Capture provider/session linkage metadata for observability.

### Step 3 — Write audit event record

1. Persist audit entry on successful launch.
2. Include outcome fields and timestamp.
3. Avoid sensitive payload storage in audit body.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Successful launch dispatches email | integration test | Notification job created with correct recipient and link |
| Delivery latency objective | integration/perf check | Email workflow starts within SLA envelope |
| Audit event write | DB assertion test | Launch event row exists with required metadata |
| Mail failure handling | integration test | Failure is observable and retriable without duplicating session |

---

## Dependencies

- TASK-002 successful launch persistence path
- EP-008 email template infrastructure
- EP-DATA audit table and schema availability

## Security Constraints

- Avoid PII overexposure in audit payloads
- Do not log raw session token in plaintext logs

---

## Definition of Done

- [x] Launch success triggers candidate email workflow
- [x] Email payload contains valid test URL and context
- [x] Delivery pipeline supports ≤2 minute initiation SLA
- [x] Launch event is persisted to `audit_events`
- [x] Tests validate notification and audit side effects

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-006 |
| Scenario | 1 |
| FR | FR-044 |
| TR | TR-005.4 |
