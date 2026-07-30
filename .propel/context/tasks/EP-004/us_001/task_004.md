---
id: task_004
us_id: us_001
epic: EP-004
title: "Implement Queue Filter Panel, Active Filter Count Badge, and Navigation Badge Count"
status: completed
layer: frontend
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-004 — Implement Queue Filter Panel, Active Filter Count Badge, and Navigation Badge Count

## Context

**User Story**: US-001 — HR Review Queue with Column Filters and SLA Countdown Timers  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 3 (badge count), Scenario 4

Queue filtering and badge indicators are required to help HR reviewers prioritize at-risk items quickly.

---

## Objective

Implement frontend filter UX and badge indicators:
1. filter controls for department, score band, status, requisition
2. active filter count badge on filter button
3. realtime queue count badge in HR navigation

---

## Technical Specifications

| Feature | Requirement |
|---------|-------------|
| Filter dimensions | department, score band, status, requisition |
| Score band | includes high score criterion (`> 75`) |
| Active filter badge | updates immediately as filters change |
| Queue nav badge | realtime pending/urgent count |

---

## Implementation Steps

### Step 1 — Expand page-level filter state model

1. maintain normalized filter state object
2. derive active filter count
3. reset paging on filter updates

### Step 2 — Build full filter panel

1. replace reason-only filter with required filter dimensions
2. fetch department options from existing filter endpoints
3. persist filter state in query string where applicable

### Step 3 — Add active filter count badge

1. show count on filter trigger button
2. hide badge when count is zero
3. include accessible label with active count

### Step 4 — Add queue navigation badge

1. subscribe to badge count realtime event
2. display pending count and urgent indicator
3. keep updates live without manual refresh

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Engineering + high score filter | E2E test | queue narrowed as expected |
| Active filter count | component/E2E test | count matches applied filters |
| Nav badge update | mocked socket test | badge updates on realtime events |
| Filter reset | UI test | clear filters returns default state |

---

## Dependencies

- TASK-001 filter support in backend API
- TASK-002 realtime badge count events

## Security Constraints

- No unauthenticated queue metadata calls
- Keep badge payload minimal and non-sensitive

---

## Definition of Done

- [x] All required queue filters available and functional
- [x] Active filter count badge implemented
- [x] Queue navigation badge count updates in realtime
- [x] Filter and badge behavior covered by tests

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-004 |
| Scenario | 3, 4 |
| FR | FR-029, FR-036 |
