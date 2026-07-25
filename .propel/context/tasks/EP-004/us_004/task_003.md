---
id: task_003
us_id: us_004
epic: EP-004
title: "Build Manual Review Bulk Selection and Bulk Reject UX"
status: completed
layer: frontend
effort: 5h
priority: critical
created: 2026-07-25
---

# TASK-003 — Build Manual Review Bulk Selection and Bulk Reject UX

## Context

**User Story**: US-004 — Bulk Reject Action and Real-Time Queue Notifications via WebSocket  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2, Scenario 4

Reviewers need ergonomic multi-select controls and a guarded bulk action workflow to clear queue backlogs efficiently.

---

## Objective

Implement queue UI bulk-reject interaction so that:
1. row checkbox + header select-all work with current pagination/filter scope
2. bulk reject action is disabled for fewer than two selected rows
3. action submits shared reason code and updates list without page reload

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Selection controls | row checkbox + header select-all (visible set) |
| Bulk action gate | disable button when selected count `< 2` |
| Tooltip copy | "Select at least 2 applications for bulk action." |
| Modal payload | selected count, shared reason code, optional comment |
| Post-success behavior | clear selection, remove rejected rows, refresh queue badge/count state |

---

## Implementation Steps

### Step 1 — Add selection state and controls

1. Add row-level checkbox state keyed by application id.
2. Implement header select-all for currently visible rows.
3. Keep state consistent across filter/sort/pagination changes.

### Step 2 — Implement bulk reject action UX

1. Add `Bulk Reject` button with disabled and tooltip states.
2. Add confirmation modal requiring shared reason code.
3. Prevent duplicate submissions while request is in-flight.

### Step 3 — Apply optimistic/confirmed UI refresh

1. On success, remove affected rows from local table model.
2. Clear selected IDs and close modal.
3. Sync queue counters from API response or follow-up fetch.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| single selection | component test | bulk button disabled + tooltip shown |
| 2+ selections | component test | bulk button enabled |
| submit valid bulk reject | component test | API called once with selected IDs + shared reason code |
| post-success UI | component test | rows removed, selection reset, count updated without full reload |

---

## Dependencies

- TASK-001 backend bulk reject API contract
- Existing manual review table rendering and reason-code retrieval utilities

## Security Constraints

- Ensure only authorized HR roles can access bulk action controls
- Do not persist selected IDs beyond session/UI state

---

## Definition of Done

- [x] Row-level and select-all checkboxes implemented
- [x] Bulk Reject action enforces minimum 2 selected rows
- [x] Shared reason-code modal validation implemented
- [x] Queue view updates after success without full page reload
- [x] Frontend tests cover gating and submission behavior

## Completion Notes

- Extended frontend API client in `frontend/src/lib/api/manualReview.ts` with `bulkRejectApplications(...)` and typed `BulkRejectResponse` contract for backend batch rejection.
- Implemented bulk selection UX in `frontend/src/components/manualReview/ManualReviewQueueTable.tsx`:
	- row-level checkboxes and header select-all for visible, eligible rows
	- selection reset on page/filter/sort changes
	- selection counter and guarded `Bulk Reject` action
- Added bulk-action gating and guidance:
	- button remains disabled when selected count is less than 2
	- tooltip copy shown: "Select at least 2 applications for bulk action."
- Implemented bulk reject modal flow:
	- shared reason-code dropdown (rejection reason codes)
	- optional shared comment
	- in-flight guard to prevent duplicate submissions
- Implemented post-success UI refresh behavior:
	- selected rows are removed from local table view
	- selected IDs cleared and modal closed
	- queue reloaded to synchronize counts/state without full page reload

## Validation Notes

- `npm --prefix frontend run test -- src/components/manualReview/__tests__/ManualReviewQueueTable.test.tsx`
	- all 11 component tests executed, including new bulk-selection and bulk-reject flow tests.
- In this environment, default Vitest process encountered worker memory pressure after test execution; rerun with increased heap completed successfully:
	- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix frontend run test -- src/components/manualReview/__tests__/ManualReviewQueueTable.test.tsx"`

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-004 |
| Epic | EP-004 |
| Scenario | 1, 2, 4 |
| FR | FR-035 |
