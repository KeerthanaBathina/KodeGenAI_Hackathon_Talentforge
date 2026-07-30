---
id: task_002
us_id: us_001
epic: EP-007
title: "Backend Decision API Validation Middleware"
status: completed
layer: backend
effort: 2h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-002 — Backend Decision API Validation Middleware

## Context

**User Story**: US-001 — Prerequisite Validation Before Enabling Final Decision Controls  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenario 3 (API enforces prerequisite check server-side)

The API must enforce prerequisite validation server-side to prevent bypassing the UI controls. Any direct POST to `/decisions` with incomplete prerequisites must be rejected with HTTP 422.

---

## Objective

Add validation middleware to the decision creation endpoint that checks prerequisites and rejects incomplete submissions with detailed error messages.

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Middleware | `validateDecisionPrerequisites` in `backend/src/middleware/` |
| Route | `POST /api/decisions` |
| HTTP response | 422 Unprocessable Entity with structured error |
| Error format | `{ error: { code, message, details: { incompleteStages[], missingAssessment } } }` |
| Audit logging | Log all validation failures with user ID and application ID |

---

## Implementation Steps

### Step 1 — Create validation middleware

1. Create `backend/src/middleware/validateDecisionPrerequisites.ts`
2. Import prerequisite validation service from TASK-001
3. Middleware signature:
   ```typescript
   export async function validateDecisionPrerequisites(
     req: Request,
     res: Response,
     next: NextFunction
   ): Promise<void>
   ```

### Step 2 — Extract application ID from request

1. Read application ID from request body:
   ```typescript
   const { applicationId } = req.body;
   ```
2. Validate UUID format using Zod schema
3. Return 400 if invalid format

### Step 3 — Call prerequisite validation service

1. Call `checkPrerequisites(applicationId)` from TASK-001
2. Handle service errors:
   - `ApplicationNotFoundError` → HTTP 404
   - Other errors → HTTP 500

### Step 4 — Check validation result

1. If `isComplete = true`: call `next()` to proceed
2. If `isComplete = false`: return HTTP 422 with details

### Step 5 — Build error response

1. Error structure:
   ```json
   {
     "success": false,
     "error": {
       "code": "PREREQUISITES_INCOMPLETE",
       "message": "Cannot create decision: Missing required evaluation stages",
       "details": {
         "incompleteStages": [
           {
             "type": "technical",
             "state": "scheduled",
             "scheduledDate": "2026-07-28T10:00:00Z"
           }
         ],
         "missingAssessment": true
       }
     }
   }
   ```
2. Include specific stage names in human-readable message

### Step 6 — Add audit logging

1. Log validation failure:
   ```typescript
   await prisma.auditEvent.create({
     data: {
       actorId: req.user?.id,
       eventType: 'DECISION_PREREQUISITE_FAILED',
       entityType: 'application',
       entityId: applicationId,
       payloadJson: {
         incompleteStages: result.incompleteStages.map(s => s.type),
         missingAssessment: result.missingAssessment,
         attemptedAt: new Date()
       }
     }
   });
   ```

### Step 7 — Apply middleware to decision route

1. Update `backend/src/routes/decisions.ts` (or create if not exists)
2. Apply middleware:
   ```typescript
   router.post(
     '/',
     authenticate,
     validateDecisionPrerequisites,
     createDecisionHandler
   );
   ```

---

## API Specifications

### POST /api/decisions (Prerequisites Incomplete)

**Request**
```json
{
  "applicationId": "uuid-app-123",
  "outcome": "hire",
  "justification": "Strong technical skills"
}
```

**Response (422 Unprocessable Entity)**
```json
{
  "success": false,
  "error": {
    "code": "PREREQUISITES_INCOMPLETE",
    "message": "Cannot create decision: Technical Interview (scheduled), Assessment Score missing",
    "details": {
      "incompleteStages": [
        {
          "id": "uuid-stage-1",
          "type": "technical",
          "state": "scheduled",
          "scheduledDate": "2026-07-28T10:00:00Z",
          "hasScorecards": false
        }
      ],
      "missingAssessment": true
    }
  }
}
```

### POST /api/decisions (Prerequisites Complete)

**Request**
```json
{
  "applicationId": "uuid-app-123",
  "outcome": "hire",
  "justification": "Strong technical skills"
}
```

**Response (201 Created)**
```json
{
  "success": true,
  "data": {
    "id": "uuid-decision-1",
    "applicationId": "uuid-app-123",
    "outcome": "hire",
    "decidedAt": "2026-07-27T15:00:00Z",
    "decidedById": "uuid-user-1"
  }
}
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Incomplete stages | Integration test | HTTP 422 with stage details |
| Missing assessment | Integration test | HTTP 422 with assessment flag |
| Complete prerequisites | Integration test | HTTP 201, decision created |
| Invalid application ID | Integration test | HTTP 404 |
| Audit event logged | Integration test | Event in `audit_events` table |

---

## Dependencies

- TASK-001 (prerequisite validation service)
- Existing authentication middleware
- Decision creation handler (may need to be created)

---

## Definition of Done

- [✅] Validation middleware function implemented
- [✅] Middleware integrated into decision route
- [✅] HTTP 422 returned for incomplete prerequisites
- [✅] Error response includes detailed breakdown
- [✅] Audit logging for validation failures
- [✅] Integration tests cover bypass scenario - **12 tests passing**
- [✅] Error messages are user-friendly and specific

---

## Notes

- Middleware should run AFTER authentication to have user context
- Audit events help track unauthorized decision attempts
- Consider rate limiting for repeated validation failures
- Error details should NOT expose internal IDs to unauthorized users
