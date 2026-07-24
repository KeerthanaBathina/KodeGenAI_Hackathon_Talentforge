---
id: task_002
us_id: us_003
epic: EP-002
title: "Create Application Status Check Service with Cooling Period"
status: done
layer: backend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Create Application Status Check Service with Cooling Period

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All scenarios (duplicate check, cooling period, re-application)

Service layer to check if candidate can apply to a requisition, enforcing duplicate prevention and 90-day cooling period rules.

---

## Objective

Build `applicationStatusService.ts` with:
- Check if candidate has active application
- Check if candidate is in cooling period (rejected < 90 days ago)
- Calculate days remaining in cooling period
- Determine application eligibility status

---

## Implementation

**File**: `backend/src/services/applicationStatusService.ts`

**Functions**:

```typescript
interface ApplicationEligibility {
  canApply: boolean;
  reason: 'active_application' | 'cooling_period' | 'eligible';
  existingApplicationId?: string;
  daysRemaining?: number;
  rejectedAt?: Date;
}

async function checkApplicationEligibility(params: {
  candidateId: string;
  requisitionId: string;
}): Promise<ApplicationEligibility>

async function getActiveApplication(params: {
  candidateId: string;
  requisitionId: string;
}): Promise<Application | null>

async function getCoolingPeriodStatus(params: {
  candidateId: string;
  requisitionId: string;
}): Promise<{
  inCoolingPeriod: boolean;
  daysRemaining: number;
  rejectedAt: Date | null;
}>
```

**Business Logic**:

1. **Check for active application**:
   - Query: `status IN ('draft', 'submitted', 'screening', 'pending_review', 'shortlisted', 'interviewing', 'offer_pending', 'offered')`
   - If found: return `{ canApply: false, reason: 'active_application' }`

2. **Check for cooling period**:
   - Query: `status = 'rejected'` ordered by `updatedAt DESC` (most recent)
   - Calculate days since rejection: `Math.floor((now - rejectedAt) / (1000 * 60 * 60 * 24))`
   - If < 90 days: return `{ canApply: false, reason: 'cooling_period', daysRemaining: 90 - daysSince }`

3. **Eligible**:
   - No active application AND (no rejection OR rejection > 90 days ago)
   - return `{ canApply: true, reason: 'eligible' }`

**Constants**:
```typescript
const COOLING_PERIOD_DAYS = 90;
```

**Error Handling**:
- Log all checks for audit purposes
- Return structured eligibility object (never throw)

---

## Acceptance Criteria

- [ ] checkApplicationEligibility returns correct status for all scenarios
- [ ] Active application check queries correct statuses
- [ ] Cooling period calculated correctly (90 days from rejection)
- [ ] Most recent rejection used if multiple exist
- [ ] daysRemaining accurate (90 - days since rejection)
- [ ] Service scoped to candidateId (no cross-candidate data leakage)
- [ ] All checks logged for audit trail

---

## Dependencies

- Application model with status and updatedAt fields
- TASK-001 (unique constraint provides fail-safe)

---

## Testing

Unit tests in `backend/src/services/__tests__/applicationStatusService.test.ts`:
- Test active application detected
- Test cooling period enforced (45 days remaining)
- Test cooling period expired (91 days ago)
- Test eligible when no previous application
- Test eligible when previous application hired/withdrawn
- Test multiple rejections uses most recent
