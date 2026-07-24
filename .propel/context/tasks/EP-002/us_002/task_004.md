---
id: task_004
us_id: us_002
epic: EP-002
title: "Build Multi-Step Application Form Component"
status: done
layer: frontend
effort: 6h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Build Multi-Step Application Form Component

## Context

**User Story**: US-002 — Multi-Step Application Form with Auto-Save and Draft Persistence  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All scenarios (4-step form, navigation, validation)

Main application form component with 4 steps, progress indicator, step validation, and navigation controls.

---

## Objective

Create `/jobs/[id]/apply` page with:
- 4-step wizard: Personal Info → Experience → Cover Letter → Review & Submit
- Progress indicator (step 1 of 4)
- Step-by-step navigation (Next, Previous, Submit)
- Step validation before advancing
- Read-only Review step (Step 4)

---

## Implementation

**File**: `frontend/src/app/jobs/[id]/apply/page.tsx`

**State Management**:
```typescript
const [currentStep, setCurrentStep] = useState(1);
const [formData, setFormData] = useState({
  step1_personal: {
    fullName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
  },
  step2_experience: {
    yearsExperience: 0,
    currentRole: '',
    currentCompany: '',
  },
  step3_coverLetter: {
    coverLetter: '',
  },
});
const [errors, setErrors] = useState({});
const [isSubmitting, setIsSubmitting] = useState(false);
```

**Step Components**:

### Step 1: Personal Information
- Full Name (required, text input)
- Email (required, email input, pre-filled from profile)
- Phone (required, tel input)
- LinkedIn URL (optional, URL input)

### Step 2: Experience
- Years of Experience (required, number input, min 0)
- Current Role (required, text input)
- Current Company (required, text input)

### Step 3: Cover Letter
- Cover Letter (required, textarea, min 100 chars)
- Character counter (X / 500)

### Step 4: Review & Submit
- Display all entered data in read-only format
- "Edit" buttons to jump back to specific steps
- "Submit Application" button

**Progress Indicator**:
```
[✓] Personal Info → [2] Experience → [3] Cover Letter → [4] Review
```

**Navigation**:
- "Next" button: validates current step, advances if valid
- "Previous" button: goes back without validation
- "Submit" button: only on Step 4

**Validation Rules**:
- Step 1: fullName, email, phone required
- Step 2: yearsExperience >= 0, currentRole, currentCompany required
- Step 3: coverLetter required, length >= 100
- Inline error messages below invalid fields

---

## Acceptance Criteria

- [ ] 4 steps render correctly
- [ ] Progress indicator shows current step
- [ ] Next button validates current step before advancing
- [ ] Previous button navigates back without validation
- [ ] Step 1 validates required fields
- [ ] Step 2 validates required fields + yearsExperience >= 0
- [ ] Step 3 validates coverLetter length >= 100
- [ ] Step 4 displays all data in read-only format
- [ ] Edit buttons on Step 4 navigate to specific steps
- [ ] Submit button only visible on Step 4
- [ ] Form state persists across step navigation

---

## Dependencies

- TASK-003 (API endpoints)
- TASK-005 (auto-save hook — will integrate later)
- Next.js dynamic routing ([id])

---

## Styling

- Consistent with existing forms (profile page)
- Progress bar with active/completed/pending states
- Step content in white card with padding
- Navigation buttons at bottom (Previous left, Next/Submit right)
