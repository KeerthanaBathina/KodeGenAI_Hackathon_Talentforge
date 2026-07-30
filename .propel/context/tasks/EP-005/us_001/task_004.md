---
id: task_004
us_id: us_001
epic: EP-005
title: "Add Interview Reminder Scheduling and Lifecycle Guardrails"
status: draft
layer: backend
effort: 5h
priority: high
created: 2026-07-25
---

# TASK-004 — Add Interview Reminder Scheduling and Lifecycle Guardrails

## Context

**User Story**: US-001 — Timezone-Aware Interview Scheduling with Panelist Conflict Detection  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 4

Interview creation must schedule reminders and lifecycle guardrails so the booking remains operationally reliable after confirmation.

---

## Objective

Implement lifecycle support so that:
1. 24-hour and 1-hour reminder jobs are created when the interview is saved
2. reminders can be sent to all participants without manual intervention
3. auditability and status transitions remain intact for later lifecycle stories

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Reminder jobs | schedule 24h and 1h delayed jobs at creation time |
| Recipient scope | candidate, panelists, recruiter |
| Transition guardrails | preserve audit trail for lifecycle changes |
| Failure handling | job failures should be retryable and observable |
| Status model | keep scheduling state consistent for downstream lifecycle stories |

---

## Implementation Steps

### Step 1 — Schedule reminder jobs

1. Enqueue a 24-hour reminder when the interview is created.
2. Enqueue a 1-hour reminder when the interview is created.
3. Bind reminder payloads to the saved UTC interview record.

### Step 2 — Maintain lifecycle guardrails

1. Record scheduling actions in the audit trail.
2. Ensure reminder jobs reference immutable interview identifiers.
3. Keep lifecycle status transitions ready for follow-on stories without overbuilding state logic here.

### Step 3 — Add observability and retries

1. Log reminder job creation and execution outcomes.
2. Make failed jobs retryable.
3. Keep the reminder flow resilient without blocking interview creation.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| reminder scheduling | integration test | 24h and 1h jobs are created at save time |
| recipient coverage | unit/integration test | candidate, panelists, recruiter are targeted |
| audit trail | integration test | scheduling action is written to `audit_events` |
| failure safety | job test | reminder failures are retryable and non-blocking |

---

## Dependencies

- TASK-001 backend scheduling persistence
- TASK-003 invite generation and delivery
- EP-TECH / US-003 (BullMQ for delayed jobs)

---

## Security Constraints

- Do not leak participant personal data beyond the reminder payload
- Preserve role-based recipient scoping for reminder jobs

---

## Definition of Done

- [ ] 24-hour reminder job scheduled at interview creation
- [ ] 1-hour reminder job scheduled at interview creation
- [ ] Reminder jobs target all participants
- [ ] Scheduling actions are auditable
- [ ] Job retries and failure logs are in place
