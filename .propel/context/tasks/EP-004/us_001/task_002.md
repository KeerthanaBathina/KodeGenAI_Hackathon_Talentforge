---
id: task_002
us_id: us_001
epic: EP-004
title: "Implement Realtime SLA Tick, Urgent Event Broadcast, and Queue Badge Counts"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-25
---

# TASK-002 — Implement Realtime SLA Tick, Urgent Event Broadcast, and Queue Badge Counts

## Context

**User Story**: US-001 — HR Review Queue with Column Filters and SLA Countdown Timers  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 2, Scenario 3

Realtime behavior is required for 60-second SLA refresh and urgent row alerting to all HR reviewers.

---

## Objective

Emit queue realtime events to HR reviewers only:
1. periodic SLA updates every 60 seconds
2. urgent transition alerts when rows cross into red severity
3. navigation badge counts for pending and urgent queue items

---

## Technical Specifications

| Event | Purpose |
|------|---------|
| `review-queue:sla-tick` | row-level SLA refresh payload |
| `review-queue:urgent` | newly urgent rows crossing red threshold |
| `review-queue:badge-count` | pending and urgent counts |

Additional constraints:
- Audience: `hr_reviewer`, `hr_manager`
- Interval: 60 seconds
- Urgent emit must be edge-triggered, not repeated each tick

---

## Implementation Steps

### Step 1 — Add role-based room membership

Update socket initialization so HR reviewer sessions join an HR review room.

### Step 2 — Build realtime queue ticker service

Create a service that:
1. pulls current SLA snapshot
2. emits SLA tick and badge counts
3. tracks previous severity state for transition detection

### Step 3 — Emit urgent transitions only

1. detect non-red to red transition by application id
2. emit `review-queue:urgent` once per transition
3. include minimal row context for frontend alerts

### Step 4 — Wire service lifecycle

1. start ticker after socket initialization during server startup
2. stop ticker during graceful shutdown

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Tick interval | fake timer unit test | one emission per 60s cycle |
| Urgent transition | unit test with severity crossing | urgent event emitted exactly once |
| Room isolation | socket integration test | non-HR roles do not receive queue events |
| Badge accuracy | integration test | pending and urgent counts correct |

---

## Dependencies

- TASK-001 SLA computation and queue snapshot output
- Existing Socket.IO infrastructure from EP-TECH

## Security Constraints

- Role-scoped event delivery
- Avoid broadcasting sensitive candidate data

---

## Definition of Done

- [x] 60-second SLA refresh event implemented
- [x] Urgent transition event implemented and deduplicated
- [x] Realtime badge counts emitted
- [x] Startup and shutdown lifecycle wiring complete
- [x] Realtime backend tests pass

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-004 |
| Scenario | 2, 3 |
| FR | FR-034, FR-036 |
