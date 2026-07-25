---
id: task_003
us_id: us_001
epic: EP-004
title: "Build Frontend Queue Table with SLA Chips, Urgent Badge, and Sortable Columns"
status: completed
layer: frontend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-003 — Build Frontend Queue Table with SLA Chips, Urgent Badge, and Sortable Columns

## Context

**User Story**: US-001 — HR Review Queue with Column Filters and SLA Countdown Timers  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 3

The queue table must visualize SLA state clearly and support reviewer sorting interactions.

---

## Objective

Update the HR review queue table to show:
- candidate
- role/requisition
- AI score
- SLA timer chip in `HH:MM:SS`
- status column
- urgent badge when red
- decision controls

The initial load must use SLA ascending order.

---

## Technical Specifications

| UI Requirement | Behavior |
|----------------|----------|
| SLA chip | show timer and severity color |
| Urgent badge | visible only when severity is red |
| Sort controls | candidate, role, score, SLA, status |
| Default sort | SLA ascending |
| Refresh | queue rerender support for 60s updates |

---

## Implementation Steps

### Step 1 — Extend API client types

Update frontend queue API typings to include SLA fields, urgency, and sort/filter params.

### Step 2 — Add SLA utility helpers

Implement formatting and style mapping helper functions:
1. seconds to `HH:MM:SS`
2. severity to chip colors

### Step 3 — Refactor queue table component

1. render required columns and sortable headers
2. render SLA chip per row
3. render urgent badge for red severity
4. preserve decision action flows and loading states

### Step 4 — Add test hooks and accessibility labels

1. add stable test ids for SLA chips and urgent badges
2. ensure sort buttons are keyboard accessible and labeled

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| SLA format | component/unit test | correct `HH:MM:SS` formatting |
| Severity colors | visual/unit test | normal/amber/red chip mapping correct |
| Urgent badge | component test | shown only for red rows |
| Sort interaction | UI test | sort requests issued with expected params |

---

## Dependencies

- TASK-001 backend queue payload contract
- TASK-002 realtime event payload contract

## Security Constraints

- Ensure authenticated API requests remain credentialed
- Do not expose hidden backend-only metadata in UI

---

## Definition of Done

- [x] Required queue columns implemented
- [x] SLA chip with color thresholds implemented
- [x] Urgent badge implemented for red severity
- [x] Sortable table headers implemented
- [x] Frontend tests cover SLA formatting and state rendering

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-004 |
| Scenario | 1, 2, 3 |
| FR | FR-029, FR-034 |
