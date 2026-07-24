---
id: task_004
us_id: us_003
epic: EP-002
title: "Update Submit Draft to Enforce Duplicate Prevention"
status: done
layer: backend
effort: 1h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Update Submit Draft to Enforce Duplicate Prevention

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 1 (API returns HTTP 409)

Update draft submission endpoint to check eligibility before submission and return HTTP 409 if duplicate or in cooling period.

---

## Objective

Enhance `POST /api/applications/drafts/:requisitionId/submit` to:
- Check application eligibility before submission
- Return HTTP 409 with structured error for duplicates/cooling period
- Prevent database-level unique constraint violations

---

## Implementation

**File**: `backend/src/routes/applicationDrafts.ts`

**Update submitDraft handler**:

```typescript
router.post('/drafts/:requisitionId/submit', authenticate, async (req, res) => {
  const { requisitionId } = req.params;
  const candidateId = req.user!.id;

  // Check eligibility BEFORE attempting submission
  const eligibility = await checkApplicationEligibility({
    candidateId,
    requisitionId,
  });

  if (!eligibility.canApply) {
    let message = '';
    let details = {};

    if (eligibility.reason === 'active_application') {
      message = 'You already have an active application for this position';
      details = { existingApplicationId: eligibility.existingApplicationId };
    } else if (eligibility.reason === 'cooling_period') {
      message = `You must wait ${eligibility.daysRemaining} more days before re-applying to this position`;
      details = {
        daysRemaining: eligibility.daysRemaining,
        rejectedAt: eligibility.rejectedAt,
        availableAfter: new Date(Date.now() + eligibility.daysRemaining! * 24 * 60 * 60 * 1000),
      };
    }

    return res.status(409).json({
      error: {
        code: eligibility.reason === 'active_application' ? 'DUPLICATE_APPLICATION' : 'COOLING_PERIOD_ACTIVE',
        message,
        details,
      },
    });
  }

  // Proceed with submission if eligible
  try {
    const application = await submitDraft({ candidateId, requisitionId });
    
    return res.status(200).json({
      id: application.id,
      status: application.status,
      submittedAt: application.submittedAt,
      message: 'Application submitted successfully',
    });
  } catch (error) {
    // Handle errors...
  }
});
```

**Error Codes**:
- `DUPLICATE_APPLICATION` — Active application already exists
- `COOLING_PERIOD_ACTIVE` — Rejected within last 90 days

**Response Example (HTTP 409)**:
```json
{
  "error": {
    "code": "COOLING_PERIOD_ACTIVE",
    "message": "You must wait 45 more days before re-applying to this position",
    "details": {
      "daysRemaining": 45,
      "rejectedAt": "2024-06-10T00:00:00Z",
      "availableAfter": "2024-09-08T00:00:00Z"
    }
  }
}
```

---

## Acceptance Criteria

- [ ] Eligibility checked before submission attempt
- [ ] Returns HTTP 409 for active application
- [ ] Returns HTTP 409 for cooling period
- [ ] Error response includes daysRemaining for cooling period
- [ ] Error response includes existingApplicationId for duplicate
- [ ] Error codes distinguish duplicate vs cooling period
- [ ] Successful submission returns 200 (when eligible)

---

## Dependencies

- TASK-002 (applicationStatusService)
- TASK-003 (eligibility logic)
- Existing submitDraft service

---

## Testing

Integration tests in `backend/src/routes/__tests__/applicationDrafts.integration.test.ts`:
- Test submit returns 409 when active application exists
- Test submit returns 409 when in cooling period
- Test submit succeeds when eligible
- Test error response includes correct details
- Test database constraint not violated (fail-safe)
