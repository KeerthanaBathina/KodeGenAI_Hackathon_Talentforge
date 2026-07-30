---
id: task_002
us_id: us_002
epic: EP-005
title: "Build Panelist Assignment UI with Availability Indicators"
status: completed
layer: frontend
effort: 4h
priority: high
created: 2026-07-25
completed: 2026-07-25
---

# TASK-002 — Build Panelist Assignment UI with Availability Indicators

## Context

**User Story**: US-002 — Panel Member Management — Assign, Availability, and Confirmation Tracking  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1, Scenario 4

Recruiters need a clear UI to assign panelists, see availability at a glance, and track confirmation status in real time.

---

## Objective

Implement frontend panelist assignment UX so that:
1. panelist search shows immediate availability feedback (green tick or red conflict)
2. assignment panel displays confirmation status for each panelist
3. real-time updates via WebSocket reflect panelist confirmations within 2 seconds
4. UI prevents duplicate assignments and shows clear feedback on conflicts

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Availability indicator | show green tick for available, red conflict icon for unavailable panelists |
| Search UX | typeahead or searchable dropdown with availability status |
| Status display | show `pending`, `confirmed`, `declined` badges next to each panelist |
| Real-time updates | subscribe to `panelist:confirmed` WebSocket events for live status changes |
| Accessibility | keyboard navigable search, clear visual indicators, ARIA labels |

---

## Implementation Steps

### Step 1 — Add panelist search with availability

1. Implement panelist search component with typeahead or dropdown.
2. Fetch availability status from backend for each search result.
3. Display green tick (available) or red X (conflict) next to each panelist name.

### Step 2 — Display panelist assignment panel

1. Show list of currently assigned panelists with confirmation status badges.
2. Allow removal of assigned panelists before interview is confirmed to candidate.
3. Display clear messaging when all panelists are confirmed vs. pending.

### Step 3 — Wire WebSocket subscription for real-time updates

1. Subscribe to `panelist:confirmed` event when assignment panel is open.
2. Update panelist status badge from `pending` to `confirmed` within 2 seconds of confirmation.
3. Show toast notification when a panelist confirms or declines.

### Step 4 — Handle assignment conflicts gracefully

1. Show inline error when trying to assign unavailable panelist.
2. Provide alternative panelist suggestions when conflicts occur.
3. Prevent form submission until all conflicts are resolved.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| availability indicator | component test | green tick for available, red X for unavailable |
| status badge rendering | component test | correct badge color and text for each status |
| WebSocket update | integration test | status changes within 2 seconds of confirmation |
| conflict handling | component test | unavailable panelist shows clear error message |
| accessibility | component test | keyboard navigation and ARIA labels present |

---

## Dependencies

- TASK-001 backend panelist assignment and availability
- EP-TECH / US-002 Socket.IO infrastructure
- Existing WebSocket client utilities

---

## Security Constraints

- Do not expose other interview details in panelist search results
- WebSocket events must be scoped to authorized users only

---

## Definition of Done

- [x] Panelist search shows availability indicators
- [x] Assignment panel displays confirmation status badges
- [x] WebSocket subscription updates status in real time
- [x] Conflict errors prevent invalid assignments
- [x] Frontend tests cover search, display, and WebSocket updates

---

## Validation Notes

### Component Tests (✅ PASS)
```bash
cd frontend && npm run test -- src/components/__tests__/PanelistAssignment.test.tsx
```

**Results**:
- 15/15 tests passed
- ✅ Availability indicators show green tick (available) and red X (conflict)
- ✅ Status badges render correctly for pending, confirmed, declined states
- ✅ WebSocket subscription works on mount
- ✅ Real-time status updates trigger UI changes within 2 seconds
- ✅ Toast notifications appear when panelists confirm/decline
- ✅ Unavailable panelist assignment is prevented with inline error message
- ✅ All interactive elements have proper ARIA labels
- ✅ Search filters panelists by name correctly

### Implementation Summary
- ✅ **API Client** (`lib/api/interviews.ts`): Added `assignPanelists` and `confirmPanelist` functions with proper type definitions
- ✅ **Component** (`components/PanelistAssignment.tsx`): Built full panelist assignment UI with:
  - Search and filter functionality
  - Availability indicators (green tick / red X)
  - Status badges (pending / confirmed / declined)
  - Real-time WebSocket updates
  - Inline error messages for conflicts
  - Add/remove panelist controls
- ✅ **WebSocket** (`lib/panelistRealtime.ts`): Created real-time event handler for `panelist:confirmed` events
- ✅ **Tests** (`components/__tests__/PanelistAssignment.test.tsx`): Comprehensive test coverage with 15 test cases

### Files Created/Modified
- **Created**: `frontend/src/components/PanelistAssignment.tsx` (268 lines)
- **Created**: `frontend/src/lib/panelistRealtime.ts` (106 lines)
- **Created**: `frontend/src/components/__tests__/PanelistAssignment.test.tsx` (445 lines)
- **Modified**: `frontend/src/lib/api/interviews.ts` (added 3 types + 2 functions)
