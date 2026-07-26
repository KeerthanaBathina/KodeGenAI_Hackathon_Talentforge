---
id: task_003
us_id: us_001
epic: EP-005
title: "Implement Calendar Invite Generation and Delivery for Interview Creation"
status: completed
layer: backend
effort: 4h
priority: high
created: 2026-07-25
---

# TASK-003 — Implement Calendar Invite Generation and Delivery for Interview Creation

## Context

**User Story**: US-001 — Timezone-Aware Interview Scheduling with Panelist Conflict Detection  
**Epic**: EP-005 — Interview Scheduling and Lifecycle Management  
**Addresses**: Scenario 1, Scenario 4

Confirmed interviews must trigger calendar invite delivery to all participants with participant-local times and a reliable delivery timeline.

---

## Objective

Implement invite delivery so that:
1. `.ics` calendar invites are generated for candidate, panelists, and recruiter
2. invite content reflects each participant’s local equivalent time
3. delivery is queued immediately after interview creation

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Invite format | RFC 5545 `.ics` calendar attachment |
| Recipients | candidate, all panelists, recruiter |
| Timing | invite job queued immediately; delivery target within 5 minutes |
| Time rendering | invite content reflects participant-local times |
| Failure handling | send failures logged without blocking interview creation |

---

## Implementation Steps

### Step 1 — Generate invite payloads

1. Build invite content from the persisted UTC interview record.
2. Include participant-specific local time labels in the generated body/attachment.
3. Attach interview metadata, location, and join instructions if available.

### Step 2 — Queue delivery jobs

1. Enqueue invite jobs after successful interview creation.
2. Ensure all required participants receive the same canonical interview record.
3. Keep email delivery asynchronous so scheduling remains responsive.

### Step 3 — Add failure-safe logging

1. Log invite generation and delivery errors with interview identifiers.
2. Preserve interview creation even if invite delivery fails.
3. Surface retry-friendly diagnostics for operators.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| invite generation | unit test | `.ics` payload includes participant-local details |
| recipient coverage | integration test | candidate, panelists, recruiter each receive queued invite |
| delivery timing | job/assertion test | delivery is queued immediately after save |
| failure handling | unit test | invite errors do not block interview creation |

---

## Dependencies

- TASK-001 backend scheduling persistence
- EP-005 / US-002 panelist assignment records

---

## Security Constraints

- Do not include secrets in invite payloads or logs
- Only attach interview details relevant to the recipient role

---

## Definition of Done

- [x] `.ics` invites generated for all participants
- [x] Invite content reflects local participant times
- [x] Delivery job queued within 5 minutes of create
- [x] Delivery failures are non-blocking and logged
- [x] Tests cover invite generation and recipient coverage

## Completion Notes

- Added `backend/src/services/interviewInviteService.ts` to generate RFC 5545-style `.ics` payloads and participant-local invite body content.
- Extended `backend/src/services/interviewSchedulingService.ts` so successful interview creation now resolves recipients, queues interview-invite communications, and dispatches invite delivery asynchronously without blocking scheduling.
- Reused the existing communication model and active `interview_invite` template lookup instead of creating a parallel delivery path.
- Added backend test coverage in `backend/src/services/__tests__/interviewInviteService.test.ts` and extended `backend/src/services/__tests__/interviewSchedulingService.integration.test.ts` for recipient queueing assertions.

## Validation Notes

- Validation commands for the invite slice:
	- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix backend run test -- src/services/__tests__/interviewInviteService.test.ts"`
	- `cmd /c "set NODE_OPTIONS=--max-old-space-size=8192 && npm --prefix backend run test:integration -- src/services/__tests__/interviewSchedulingService.integration.test.ts"`
- The implementation uses the repo's current mock/non-blocking email delivery pattern. Real provider-backed attachment dispatch remains a follow-on infrastructure concern, but queued invite generation and asynchronous delivery behavior are implemented in this slice.
