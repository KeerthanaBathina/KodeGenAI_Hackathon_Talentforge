---
id: task_006
us_id: us_002
epic: EP-002
title: "Add Draft Resume and Continue CTA to Jobs Pages"
status: done
layer: frontend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Add Draft Resume and Continue CTA to Jobs Pages

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 2 (resume incomplete application)

Add "Continue Application" button to jobs listing and detail pages when a draft exists for a requisition.

---

## Objective

Integrate draft detection into:
- Jobs listing page (RequisitionCard)
- Job detail page (if exists)

Show "Continue Application" button instead of "Apply" when draft exists.

---

## Implementation

### RequisitionCard Component Update

**File**: `frontend/src/components/RequisitionCard.tsx`

**Changes**:
1. Fetch draft status on mount: `GET /api/requisitions/:id/has-draft`
2. Store `hasDraft` state
3. Conditionally render button:
   - If hasDraft: "Continue Application" (blue button)
   - Else: "Apply Now" (primary button)
4. Both buttons navigate to `/jobs/:id/apply`

**State**:
```typescript
const [hasDraft, setHasDraft] = useState(false);

useEffect(() => {
  async function checkDraft() {
    const response = await fetch(`/api/requisitions/${requisition.id}/has-draft`, {
      credentials: 'include',
    });
    const data = await response.json();
    setHasDraft(data.hasDraft);
  }
  checkDraft();
}, [requisition.id]);
```

### Application Form Page Update

**File**: `frontend/src/app/jobs/[id]/apply/page.tsx`

**Changes**:
1. On mount, check for existing draft: `GET /api/applications/drafts/:requisitionId`
2. If draft exists, pre-populate formData and set currentStep from draftData
3. Show "Resuming from Step X" message at top

**Load Draft Logic**:
```typescript
useEffect(() => {
  async function loadDraft() {
    const response = await fetch(`/api/applications/drafts/${requisitionId}`, {
      credentials: 'include',
    });
    if (response.ok) {
      const draft = await response.json();
      setFormData(draft.draftData);
      setCurrentStep(draft.draftData.currentStep || 1);
    }
  }
  loadDraft();
}, [requisitionId]);
```

---

## Acceptance Criteria

- [ ] RequisitionCard fetches draft status on mount
- [ ] "Continue Application" button shows when draft exists
- [ ] "Apply Now" button shows when no draft
- [ ] Both buttons navigate to `/jobs/:id/apply`
- [ ] Application form loads draft data on mount
- [ ] currentStep restored from draftData.currentStep
- [ ] "Resuming from Step X" message shows when draft loaded
- [ ] No errors if draft doesn't exist (handles 404)

---

## Dependencies

- TASK-003 (API: GET /has-draft, GET /drafts/:id)
- TASK-004 (Application form component)
- RequisitionCard component (from US-001)

---

## UI/UX

**Continue Button Styling**:
- Blue background (#3b82f6)
- White text
- Icon: ↻ (continue/resume icon)
- Text: "Continue Application"

**Resuming Message**:
- Info banner at top of form
- Blue background (#dbeafe)
- Text: "Resuming your application from Step {currentStep}"
- Dismiss button (X)
