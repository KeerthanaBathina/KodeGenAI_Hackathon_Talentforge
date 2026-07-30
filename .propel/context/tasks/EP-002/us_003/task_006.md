---
id: task_006
us_id: us_003
epic: EP-002
title: "Handle HTTP 409 on Application Submission"
status: done
layer: frontend
effort: 2h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Handle HTTP 409 on Application Submission

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 1 (friendly error message on duplicate attempt)

Update application form to handle HTTP 409 responses from submission endpoint and display user-friendly error messages.

---

## Objective

Enhance form submission handler to:
- Detect HTTP 409 responses
- Extract error details (duplicate vs cooling period)
- Display appropriate error message to user
- Prevent navigation to success page

---

## Implementation

**File**: `frontend/src/app/jobs/[id]/apply/page.tsx`

**Update handleSubmit function**:

```typescript
async function handleSubmit() {
  setIsSubmitting(true);

  try {
    const response = await fetch(`/api/applications/drafts/${requisitionId}/submit`, {
      method: 'POST',
      credentials: 'include',
    });

    // Handle HTTP 409 (Conflict)
    if (response.status === 409) {
      const errorData = await response.json();
      
      let errorMessage = 'Unable to submit application';
      
      if (errorData.error?.code === 'DUPLICATE_APPLICATION') {
        errorMessage = 'You already have an active application for this position.';
      } else if (errorData.error?.code === 'COOLING_PERIOD_ACTIVE') {
        const days = errorData.error.details?.daysRemaining || 0;
        errorMessage = `You must wait ${days} more day${days !== 1 ? 's' : ''} before re-applying to this position.`;
      } else {
        errorMessage = errorData.error?.message || errorMessage;
      }
      
      setToast({
        message: errorMessage,
        type: 'error',
      });
      
      setIsSubmitting(false);
      return;
    }

    // Handle other non-OK responses
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Submission failed');
    }

    // Success flow
    const data = await response.json();
    setApplicationStatus('submitted');
    setToast({ message: 'Application submitted successfully!', type: 'success' });

    setTimeout(() => {
      router.push(`/jobs/${requisitionId}/application-success`);
    }, 2000);
  } catch (error) {
    setToast({
      message: error instanceof Error ? error.message : 'Failed to submit application. Please try again.',
      type: 'error',
    });
  } finally {
    setIsSubmitting(false);
  }
}
```

**Error Message Display**:
- Use existing Toast component
- Error toasts stay visible until manually dismissed
- Clear, actionable messages

**User Flow**:
1. User completes all 4 steps
2. Clicks "Submit Application"
3. If HTTP 409:
   - Error toast appears
   - User remains on Step 4 (Review)
   - Can edit form or return to jobs listing
4. If HTTP 200:
   - Success toast appears
   - Redirect to success page

---

## Acceptance Criteria

- [ ] HTTP 409 responses handled gracefully
- [ ] Duplicate application error shows clear message
- [ ] Cooling period error includes days remaining
- [ ] Error toast displayed (not generic failure)
- [ ] User remains on form after 409 (no redirect)
- [ ] Submit button re-enabled after error
- [ ] Other HTTP errors still handled (500, 400, etc.)

---

## Dependencies

- TASK-004 (backend returns HTTP 409)
- Existing Toast component
- Application form handleSubmit function

---

## Error Messages

**Duplicate Application**:
> "You already have an active application for this position."

**Cooling Period (45 days)**:
> "You must wait 45 more days before re-applying to this position."

**Cooling Period (1 day)**:
> "You must wait 1 more day before re-applying to this position."

**Generic (fallback)**:
> "Unable to submit application. Please try again."
