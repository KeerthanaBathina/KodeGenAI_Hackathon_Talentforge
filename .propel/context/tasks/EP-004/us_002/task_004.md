---
id: task_004
us_id: us_002
epic: EP-004
title: "Wire End-to-End Decision Flow Across Queue, Notifications, and Scheduling Handoff"
status: completed
layer: integration
effort: 3h
priority: high
created: 2026-07-25
---

# TASK-004 — Wire End-to-End Decision Flow Across Queue, Notifications, and Scheduling Handoff

## Context

**User Story**: US-002 — Shortlist and Reject Decisions with Mandatory Reason Codes  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 3, Scenario 4

US-002 behaviors span API, queue UI state, async notification infrastructure, and audit persistence.

---

## Objective

Ensure shortlist/reject decision flow is fully integrated:
1. UI submits valid decision payload and updates queue state
2. backend side effects are observable (email queue + scheduling handoff)
3. audit trail can be verified with deterministic correlation data

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Queue update behavior | decided applications no longer appear as pending review |
| Response contract | decision response includes updated status and decision metadata |
| Side-effect observability | queue/job records include application and correlation identifiers |
| Audit traceability | `audit_events` queryable by `entity_id` and `event_type` |

---

## Implementation Steps

### Step 1 — Integrate frontend submit with backend response handling

1. Refresh affected queue row or table after successful decision.
2. Prevent duplicate submissions while request is in flight.
3. Surface actionable error feedback on failure.

### Step 2 — Add integration assertions for downstream effects

1. Verify shortlist creates interview scheduling handoff record.
2. Verify reject creates queued rejection email job.
3. Verify both actions create audit entries.

### Step 3 — Add operational trace hooks for debugging

1. Add structured log fields/correlation IDs across decision pipeline.
2. Ensure logs can map user action to job/audit outcomes.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Shortlist end-to-end path | integration/E2E test | status updates, queue refreshes, scheduling handoff exists |
| Reject end-to-end path | integration/E2E test | status updates, rejection job queued, audit entry exists |
| Duplicate click protection | UI/integration test | second submit blocked while first is pending |

---

## Dependencies

- TASK-002 side effects implementation
- TASK-003 frontend decision form

## Security Constraints

- Keep integration fixtures synthetic and non-sensitive
- Ensure only authorized HR accounts can execute decision flows in test harness

---

## Definition of Done

- [x] Frontend and backend decision flows are integrated and stable
- [x] Scheduling and rejection side effects are verifiable in automated checks
- [x] Audit trail is queryable for each decision action
- [x] Integration tests cover successful and failure-path behavior

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-004 |
| Scenario | 1, 3, 4 |
| FR | FR-030, FR-031 |