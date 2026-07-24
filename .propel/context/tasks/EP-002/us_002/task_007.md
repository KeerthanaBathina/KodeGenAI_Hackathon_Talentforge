---
id: task_007
us_id: us_002
epic: EP-002
title: "Integrate Auto-Save and Submission Flow"
status: done
layer: frontend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-007 — Integrate Auto-Save and Submission Flow

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenarios 1, 4 (auto-save, final submission lock)

Connect auto-save hook to application form and implement final submission logic that locks the draft.

---

## Objective

Integrate `useAutoSave` hook into application form:
- Enable auto-save on Steps 1-3
- Disable auto-save after submission
- Submit via API on Step 4 "Submit" button
- Redirect to success page after submission
- Make form read-only after submission

---

## Implementation

**File**: `frontend/src/app/jobs/[id]/apply/page.tsx`

**Auto-Save Integration**:
```typescript
const [applicationStatus, setApplicationStatus] = useState<'draft' | 'submitted'>('draft');

const { isSaving, lastSavedAt } = useAutoSave({
  formData: {
    step1_personal: formData.step1_personal,
    step2_experience: formData.step2_experience,
    step3_coverLetter: formData.step3_coverLetter,
    currentStep,
  },
  requisitionId,
  enabled: applicationStatus === 'draft',  // Disable after submission
  onSaveSuccess: () => {
    // Toast handled by hook
  },
  onSaveError: (error) => {
    console.error('Auto-save failed:', error);
  },
});
```

**Submission Handler**:
```typescript
async function handleSubmit() {
  setIsSubmitting(true);
  
  try {
    const response = await fetch(`/api/applications/drafts/${requisitionId}/submit`, {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Submission failed');
    }
    
    const data = await response.json();
    setApplicationStatus('submitted');
    
    // Redirect to success page after 2s
    setTimeout(() => {
      router.push(`/jobs/${requisitionId}/application-success`);
    }, 2000);
  } catch (error) {
    alert('Failed to submit application. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
}
```

**Auto-Save Indicator**:
- Show "Saving..." when isSaving=true
- Show "Draft saved at {time}" when lastSavedAt exists
- Position: top-right of form card

**Read-Only Mode**:
- Disable all form inputs when status='submitted'
- Hide Next/Previous buttons
- Show "Application Submitted" message

---

## Acceptance Criteria

- [ ] Auto-save enabled for draft status
- [ ] Auto-save disabled after submission
- [ ] Submit button calls POST /drafts/:id/submit
- [ ] Application status updates to 'submitted' on success
- [ ] Form becomes read-only after submission
- [ ] Redirect to success page after submission
- [ ] "Saving..." indicator shows during auto-save
- [ ] "Draft saved at..." shows after successful save
- [ ] Error handling for failed submission

---

## Dependencies

- TASK-004 (Application form)
- TASK-005 (useAutoSave hook)
- TASK-003 (API: POST /submit)

---

## Success Page

**File**: `frontend/src/app/jobs/[id]/application-success/page.tsx`

**Content**:
- Checkmark icon (green)
- "Application Submitted Successfully" heading
- "Your application for {job title} has been submitted."
- "We'll review your application and get back to you soon."
- "Return to Jobs" button → `/jobs`
- "View My Applications" button → `/applications` (if exists)

---

## Testing

Manual flow:
1. Start application, fill Step 1
2. Wait 60s → verify "Draft saved" toast
3. Navigate to Step 2, fill fields
4. Wait 60s → verify another save
5. Complete Step 3, advance to Step 4
6. Click "Submit Application"
7. Verify redirect to success page
8. Return to requisition → verify "Continue" button gone
