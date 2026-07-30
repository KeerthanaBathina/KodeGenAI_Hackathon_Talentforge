---
id: task_002
us_id: us_002
epic: EP-004
title: "Implement Decision Side Effects: Status Routing, Notifications, and Audit Events"
status: completed
layer: backend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-002 — Implement Decision Side Effects: Status Routing, Notifications, and Audit Events

## Context

**User Story**: US-002 — Shortlist and Reject Decisions with Mandatory Reason Codes  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 3, Scenario 4

Decision persistence must trigger downstream operational effects and audit compliance records.

---

## Objective

Implement reliable decision execution so that:
1. shortlist routes applications to interview scheduling queue and sends shortlist email
2. reject sends `application_rejected` email within 60 seconds
3. every decision is written to `audit_events` with full context

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| State transitions | `pending_review` -> `shortlisted` or `rejected` |
| Shortlist side effect | enqueue interview scheduling workflow |
| Reject side effect | enqueue `application_rejected` email job |
| Email SLA | enqueue and process within 60 seconds target |
| Audit event | `event_type = application_decision`, include `actor_id`, `entity_id`, `reason_code`, timestamp |
| Reliability | transactional write for decision + audit record |

---

## Implementation Steps

### Step 1 — Persist decision and transition status

1. Update application status based on decision.
2. Persist reason code and optional comment with decision metadata.
3. Guard against duplicate or already-finalized decisions.

### Step 2 — Emit side effects by decision type

1. For shortlist, enqueue shortlist notification and interview scheduling handoff.
2. For reject, enqueue `application_rejected` email.
3. Propagate correlation identifiers for traceability.

### Step 3 — Write compliance audit event

1. Create `audit_events` record in same transaction scope where possible.
2. Store actor, entity, event type, reason code, and event timestamp.
3. Ensure failures are observable through structured logs.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Shortlist transition | service/integration test | status becomes `shortlisted`; scheduling handoff created |
| Reject transition | service/integration test | status becomes `rejected`; rejection email queued |
| Email timing objective | queue test with fake timers | email dispatch occurs within 60 seconds |
| Audit record completeness | DB assertion | required `audit_events` fields persisted |

---

## Dependencies

- TASK-001 API contract and validation
- Existing email queue infrastructure
- Existing audit event persistence model

## Security Constraints

- Never include sensitive candidate data in queue payloads beyond template needs
- Log decision events without exposing private comment text in plain logs

---

## Definition of Done

- [x] Shortlist decision transitions status and creates scheduling handoff
- [x] Reject decision transitions status and queues rejection email within 60s objective
- [x] Audit event is written for both decisions with required fields
- [x] Integration tests verify side effects and audit persistence

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-004 |
| Scenario | 1, 3, 4 |
| FR | FR-030, FR-031 |