---
id: task_005
us_id: us_002
epic: EP-002
title: "Implement Auto-Save Hook with Toast Notification"
status: done
layer: frontend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Implement Auto-Save Hook with Toast Notification

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 1 (auto-save after 60s inactivity)

Custom React hook that auto-saves form data after 60 seconds of inactivity. Shows toast notification on successful save.

---

## Objective

Create `useAutoSave` hook that:
- Debounces form changes with 60-second timer
- Saves draft to API when timer expires
- Shows "Draft saved" toast on success
- Handles errors gracefully (shows error toast)
- Stops auto-save when application is submitted

---

## Implementation

**File**: `frontend/src/hooks/useAutoSave.ts`

**Hook Signature**:
```typescript
function useAutoSave(params: {
  formData: object;
  requisitionId: string;
  enabled: boolean;  // false when status='submitted'
  onSaveSuccess?: () => void;
  onSaveError?: (error: Error) => void;
}): {
  isSaving: boolean;
  lastSavedAt: Date | null;
}
```

**Auto-Save Logic**:
- Use `useEffect` to watch formData changes
- Use `useRef` to store debounce timer
- Clear timer on formData change
- Set new timer (60,000ms = 60s)
- On timer expiry, POST to `/api/applications/drafts`

**Toast Notification**:
- Success: "Draft saved" (green, auto-dismiss after 3s)
- Error: "Failed to save draft" (red, manual dismiss)

**Debounce Pattern**:
```typescript
useEffect(() => {
  if (!enabled) return;
  
  if (debounceTimerRef.current) {
    clearTimeout(debounceTimerRef.current);
  }
  
  debounceTimerRef.current = setTimeout(() => {
    saveDraft();
  }, 60000);
  
  return () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  };
}, [formData, enabled]);
```

---

## Acceptance Criteria

- [ ] Hook debounces form changes with 60s delay
- [ ] Auto-save triggers after 60s of inactivity
- [ ] "Draft saved" toast shows on success
- [ ] Error toast shows on failure
- [ ] Auto-save stops when enabled=false
- [ ] lastSavedAt timestamp updates on successful save
- [ ] isSaving flag indicates save in progress
- [ ] Timer clears on component unmount
- [ ] No save triggered if formData unchanged

---

## Dependencies

- TASK-003 (API endpoint: POST /drafts)
- Toast notification component (create if doesn't exist)

---

## Toast Component

**File**: `frontend/src/components/Toast.tsx`

**Features**:
- Fixed position (top-right corner)
- Success (green), Error (red), Info (blue) variants
- Auto-dismiss option (default 3s for success)
- Manual dismiss button (X icon)
- Slide-in animation

---

## Testing

Manual testing:
1. Fill form, wait 60s → verify "Draft saved" toast
2. Change field, wait 30s, change again → verify only 1 save after total 60s from last change
3. Submit application → verify auto-save stops
4. Simulate API error → verify error toast
