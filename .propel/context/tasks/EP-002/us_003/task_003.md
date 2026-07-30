---
id: task_003
us_id: us_003
epic: EP-002
title: "Create API Endpoint for Application Eligibility Check"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Create API Endpoint for Application Eligibility Check

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: UI needs eligibility data to show correct button states

API endpoint that returns whether candidate can apply to a requisition, including cooling period information.

---

## Objective

Create endpoint that:
- Checks application eligibility for authenticated candidate
- Returns structured eligibility data
- Scoped to requesting candidate only (security)

---

## Implementation

**Route**: Add to `backend/src/routes/requisitions.ts`

**Endpoint**:

### GET /api/requisitions/:id/eligibility

**Purpose**: Check if authenticated candidate can apply to requisition

**Authentication**: Required (uses `authenticate` middleware)

**Response**: 200
```typescript
{
  canApply: boolean;
  reason: 'active_application' | 'cooling_period' | 'eligible';
  existingApplicationId?: string;
  daysRemaining?: number;
  rejectedAt?: string; // ISO date
  message?: string; // Human-readable message
}
```

**Response Examples**:

**Active Application**:
```json
{
  "canApply": false,
  "reason": "active_application",
  "existingApplicationId": "uuid-123",
  "message": "You have an active application for this position"
}
```

**Cooling Period**:
```json
{
  "canApply": false,
  "reason": "cooling_period",
  "daysRemaining": 45,
  "rejectedAt": "2024-06-10T00:00:00Z",
  "message": "Re-application available in 45 days"
}
```

**Eligible**:
```json
{
  "canApply": true,
  "reason": "eligible",
  "message": null
}
```

**Implementation**:
```typescript
router.get('/:id/eligibility', authenticate, async (req, res) => {
  const requisitionId = req.params.id;
  const candidateId = req.user!.id;
  
  const eligibility = await checkApplicationEligibility({
    candidateId,
    requisitionId,
  });
  
  let message = null;
  if (eligibility.reason === 'active_application') {
    message = 'You have an active application for this position';
  } else if (eligibility.reason === 'cooling_period') {
    message = `Re-application available in ${eligibility.daysRemaining} days`;
  }
  
  res.status(200).json({
    ...eligibility,
    message,
  });
});
```

**Security**:
- Endpoint scoped to `req.user.id` (authenticated candidate)
- No exposure of other candidates' data
- Only returns requesting candidate's eligibility

---

## Acceptance Criteria

- [ ] GET /api/requisitions/:id/eligibility requires authentication
- [ ] Response includes canApply boolean
- [ ] Response includes reason (active_application | cooling_period | eligible)
- [ ] Cooling period response includes daysRemaining
- [ ] Active application response includes existingApplicationId
- [ ] Endpoint scoped to authenticated candidate only
- [ ] Returns 200 for all valid requests (not 403/409 - this is info only)

---

## Dependencies

- TASK-002 (applicationStatusService)
- `authenticate` middleware
- Requisition model (validate requisitionId exists)

---

## Testing

Integration tests in `backend/src/routes/__tests__/requisitions.integration.test.ts`:
- Test returns active application status
- Test returns cooling period with correct days remaining
- Test returns eligible when no previous application
- Test requires authentication (401 when not authenticated)
- Test scoped to requesting candidate
