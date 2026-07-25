# US-003 Implementation Summary

## Automatic Path Classification with Recruiter Override

Epic: EP-004
Story: US-003
Status: Completed
Completed On: 2026-07-25

## Scope Delivered

US-003 introduces deterministic interview path assignment on shortlist and an auditable recruiter override flow.

1. Scenario 1: experience < threshold -> fresher
2. Scenario 2: experience >= threshold -> experienced
3. Scenario 3: recruiter override requires 20+ character justification
4. Scenario 4: override persisted to audit trail with old/new path context

## Backend Delivery

### Classification on shortlist

File: backend/src/services/manualReviewQueueService.ts

Implemented behavior:

1. On shortlist, service reads latest screening factors parsedData.experience_years
2. Threshold is read from scoring_thresholds by jobFamilyId (latest effectiveFrom)
3. Fallback threshold is 2 when threshold row is missing or invalid
4. Path is persisted in the same transaction as decision update
5. Override metadata is reset on fresh shortlist classification

### Override API and domain guardrails

Files:

1. backend/src/services/manualReviewQueueService.ts
2. backend/src/routes/manualReviewQueue.ts

Implemented behavior:

1. POST /api/manual-review-queue/:id/path-override
2. Role authorization for recruiter/hr reviewer/hr manager
3. Justification minimum length 20
4. Deterministic domain errors:
5. PATH_NOT_SET
6. NO_OP_OVERRIDE
7. JUSTIFICATION_TOO_SHORT

### Audit trail

File: backend/src/services/manualReviewQueueService.ts

Override writes application_path_override audit event with:

1. original_path
2. new_path
3. justification
4. actorId
5. timestamp (createdAt)

## Frontend Delivery

### Manual review override UX

Files:

1. frontend/src/lib/api/manualReview.ts
2. frontend/src/components/manualReview/ManualReviewQueueTable.tsx

Implemented behavior:

1. Path badge shown on queue rows
2. Override action opens modal
3. Current path displayed read-only
4. New path selectable
5. Justification input with live length feedback
6. Confirm disabled until valid inputs (20+ chars)
7. Queue reload after successful override

### Path visibility on application tracking

File: frontend/src/app/applications/track/[id]/page.tsx

Implemented behavior:

1. Read-only Interview Path badge shown when path exists
2. Overridden state indicated in badge text

## Test Coverage and Evidence

### Backend unit

Command:

- npm --prefix backend run test -- src/services/__tests__/manualReviewQueueService.reasonCode.test.ts

Coverage includes:

1. configured threshold usage
2. missing threshold fallback
3. malformed threshold fallback with warning

### Backend integration

Command:

- npm --prefix backend run test:integration -- src/routes/__tests__/manualReviewQueue.integration.test.ts

Coverage includes:

1. override success
2. short justification (400)
3. no-op override conflict (409)
4. not found (404)
5. decision response includes path

### Frontend component

Command:

- npm --prefix frontend run test -- src/components/manualReview/__tests__/ManualReviewQueueTable.test.tsx

Coverage includes:

1. path badge rendering
2. min-20 validation gating
3. valid override payload submission

### Frontend E2E

Command:

- npm --prefix frontend run test:e2e -- tests/us003-path-classification-override.spec.ts

Coverage includes:

1. classified path badge visible in manual review queue
2. override modal min-20 gating
3. valid override submission flow

## Story and Task Closure

Task artifacts:

1. .propel/context/tasks/EP-004/us_003/task_001.md -> completed
2. .propel/context/tasks/EP-004/us_003/task_002.md -> completed
3. .propel/context/tasks/EP-004/us_003/task_003.md -> completed
4. .propel/context/tasks/EP-004/us_003/task_004.md -> completed
5. .propel/context/tasks/EP-004/us_003/task_005.md -> completed

Story artifact:

- .propel/context/tasks/EP-004/us_003.md -> completed

Validation evidence:

- docs/validation/ep_data_us_003_validation_evidence.md

## Notes

Global frontend type-check currently reports pre-existing parse issues in frontend/src/app/jobs/[id]/apply/page.tsx that are unrelated to US-003 path classification and override changes.
