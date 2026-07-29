---
id: TASK-003
user_story: US-002
title: "Frontend - Policy Editor UI with Validation"
status: todo
priority: high
assigned_to: frontend-team
estimated_hours: 14
layer: frontend
dependencies: [TASK-001, TASK-002]
---

# TASK-003 — Frontend - Policy Editor UI with Validation

## Objective

Build intuitive admin interface for managing AI screening thresholds, scoring thresholds, and approval policies with real-time validation and visual feedback.

## Scope

Create responsive policy management dashboard with forms, validation, preview, and effective date configuration.

## Technical Requirements

### 1. Page Structure

Create `/frontend/src/app/admin/policies/page.tsx`:

- Tab-based navigation: Screening Thresholds | Scoring Thresholds | Approval Policies
- Protected route (admin role required)
- Each tab loads corresponding policy management component

### 2. Screening Threshold Editor

Component: `ScreeningThresholdEditor.tsx`

**Current Threshold Display:**

```typescript
<div className="bg-white rounded-lg shadow p-6">
  <h2>Current Screening Thresholds</h2>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <ThresholdBadge
      label="Shortlist"
      value={currentThresholds.shortlistThreshold}
      color="green"
    />
    <ThresholdBadge
      label="Borderline Min"
      value={currentThresholds.borderlineMin}
      color="yellow"
    />
    <ThresholdBadge
      label="Borderline Max"
      value={currentThresholds.borderlineMax}
      color="yellow"
    />
    <ThresholdBadge
      label="Reject"
      value={currentThresholds.rejectThreshold}
      color="red"
    />
  </div>
  <p className="text-sm text-gray-600 mt-2">
    Version {currentThresholds.version} • Effective since {formatDate(currentThresholds.effectiveFrom)}
  </p>
</div>
```

**New Version Form:**

```typescript
<form onSubmit={handleSubmit}>
  <div className="space-y-4">
    <NumberInput
      label="Shortlist Threshold"
      name="shortlistThreshold"
      value={formData.shortlistThreshold}
      onChange={handleChange}
      min={0}
      max={100}
      required
      helpText="Applications scoring at or above this value are automatically shortlisted"
      error={errors.shortlistThreshold}
    />

    <NumberInput
      label="Borderline Min"
      name="borderlineMin"
      value={formData.borderlineMin}
      onChange={handleChange}
      min={0}
      max={100}
      required
      helpText="Lower bound for manual review range"
      error={errors.borderlineMin}
    />

    <NumberInput
      label="Borderline Max"
      name="borderlineMax"
      value={formData.borderlineMax}
      onChange={handleChange}
      min={0}
      max={100}
      required
      helpText="Upper bound for manual review range"
      error={errors.borderlineMax}
    />

    <NumberInput
      label="Reject Threshold"
      name="rejectThreshold"
      value={formData.rejectThreshold}
      onChange={handleChange}
      min={0}
      max={100}
      required
      helpText="Applications scoring at or below this value are automatically rejected"
      error={errors.rejectThreshold}
    />

    <DateTimeInput
      label="Effective From"
      name="effectiveFrom"
      value={formData.effectiveFrom}
      onChange={handleChange}
      min={new Date()}
      required
      helpText="New threshold will apply to applications submitted from this date forward"
      error={errors.effectiveFrom}
    />
  </div>

  {/* Visual Range Validator */}
  <ThresholdRangeVisualizer
    reject={formData.rejectThreshold}
    borderlineMin={formData.borderlineMin}
    borderlineMax={formData.borderlineMax}
    shortlist={formData.shortlistThreshold}
    errors={rangeErrors}
  />

  <div className="mt-6 flex gap-3">
    <button type="submit" disabled={!isValid || isSubmitting}>
      Create New Version
    </button>
    <button type="button" onClick={resetForm}>
      Reset
    </button>
  </div>
</form>
```

**Threshold Range Visualizer:**

```typescript
<div className="bg-gray-50 p-4 rounded">
  <div className="flex items-center space-x-2">
    <span className="text-sm">0</span>
    <div className="flex-1 h-8 rounded overflow-hidden flex">
      <div
        className="bg-red-200"
        style={{ width: `${reject}%` }}
        title="Auto-reject range"
      >
        {reject > 10 && <span className="text-xs">Reject</span>}
      </div>
      <div
        className="bg-yellow-200"
        style={{ width: `${borderlineMax - borderlineMin}%` }}
        title="Manual review range"
      >
        {(borderlineMax - borderlineMin) > 10 && <span className="text-xs">Review</span>}
      </div>
      <div
        className="bg-green-200"
        style={{ width: `${100 - shortlist}%` }}
        title="Auto-shortlist range"
      >
        {(100 - shortlist) > 10 && <span className="text-xs">Shortlist</span>}
      </div>
    </div>
    <span className="text-sm">100</span>
  </div>
  {rangeErrors.length > 0 && (
    <div className="mt-2">
      {rangeErrors.map((error, i) => (
        <p key={i} className="text-sm text-red-600">{error}</p>
      ))}
    </div>
  )}
</div>
```

### 3. Scoring Threshold Editor

Component: `ScoringThresholdEditor.tsx`

**Job Family Selection:**

```typescript
<div>
  <label>Job Family</label>
  <select
    value={selectedJobFamilyId}
    onChange={handleJobFamilyChange}
  >
    <option value="">Select job family...</option>
    {jobFamilies.map(jf => (
      <option key={jf.id} value={jf.id}>{jf.name}</option>
    ))}
  </select>
</div>
```

**Current Thresholds for Selected Job Family:**

```typescript
{selectedJobFamily && currentThreshold && (
  <div className="bg-blue-50 p-4 rounded">
    <h3>Current Thresholds for {selectedJobFamily.name}</h3>
    <dl className="grid grid-cols-3 gap-4 mt-2">
      <div>
        <dt className="text-sm text-gray-600">AI Shortlist Threshold</dt>
        <dd className="text-lg font-medium">{currentThreshold.aiShortlistThreshold.toFixed(4)}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-600">Confidence Threshold</dt>
        <dd className="text-lg font-medium">{currentThreshold.confidenceThreshold.toFixed(4)}</dd>
      </div>
      <div>
        <dt className="text-sm text-gray-600">Experience (Years)</dt>
        <dd className="text-lg font-medium">{currentThreshold.experienceThresholdYears}</dd>
      </div>
    </dl>
    <p className="text-sm text-gray-600 mt-2">
      Effective since {formatDate(currentThreshold.effectiveFrom)}
    </p>
  </div>
)}
```

**New Version Form:**

```typescript
<form onSubmit={handleSubmit}>
  <SliderInput
    label="AI Shortlist Threshold"
    name="aiShortlistThreshold"
    value={formData.aiShortlistThreshold}
    onChange={handleChange}
    min={0}
    max={1}
    step={0.0001}
    required
    helpText="Minimum AI confidence score for automatic shortlisting (0.0-1.0)"
    error={errors.aiShortlistThreshold}
    showValue={(val) => val.toFixed(4)}
  />

  <SliderInput
    label="Confidence Threshold"
    name="confidenceThreshold"
    value={formData.confidenceThreshold}
    onChange={handleChange}
    min={0}
    max={1}
    step={0.0001}
    required
    helpText="Minimum confidence level required (0.0-1.0)"
    error={errors.confidenceThreshold}
    showValue={(val) => val.toFixed(4)}
  />

  <NumberInput
    label="Experience Threshold (Years)"
    name="experienceThresholdYears"
    value={formData.experienceThresholdYears}
    onChange={handleChange}
    min={0}
    max={50}
    required
    helpText="Minimum years of experience required"
    error={errors.experienceThresholdYears}
  />

  <DateTimeInput
    label="Effective From"
    name="effectiveFrom"
    value={formData.effectiveFrom}
    onChange={handleChange}
    min={new Date()}
    required
  />

  <button type="submit" disabled={!isValid || isSubmitting}>
    Create New Version
  </button>
</form>
```

### 4. Approval Policy Editor

Component: `ApprovalPolicyEditor.tsx`

**Compensation Band Configuration:**

```typescript
<div className="grid grid-cols-2 gap-4">
  <CurrencyInput
    label="Compensation Min"
    name="compensationBandMin"
    value={formData.compensationBandMin}
    onChange={handleChange}
    required
    error={errors.compensationBandMin}
  />
  <CurrencyInput
    label="Compensation Max"
    name="compensationBandMax"
    value={formData.compensationBandMax}
    onChange={handleChange}
    required
    error={errors.compensationBandMax}
  />
</div>
```

**Approver Tier Management:**

```typescript
<div>
  <label>Required Approvers</label>
  <div className="space-y-3">
    {formData.requiredApprovers.map((approver, index) => (
      <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded">
        <span className="font-medium">Tier {approver.tier}</span>
        <input
          placeholder="Role (e.g., HR Manager)"
          value={approver.role}
          onChange={(e) => handleApproverChange(index, 'role', e.target.value)}
        />
        <UserSelect
          value={approver.approverId}
          onChange={(userId) => handleApproverChange(index, 'approverId', userId)}
          filterRole={['hr_manager', 'admin']}
        />
        <button
          type="button"
          onClick={() => removeApprover(index)}
          className="text-red-600"
        >
          Remove
        </button>
      </div>
    ))}
  </div>
  <button
    type="button"
    onClick={addApprover}
    className="mt-2"
  >
    + Add Approver Tier
  </button>
</div>
```

### 5. Client-Side Validation

Create `/frontend/src/utils/policyValidation.ts`:

```typescript
export function validateScreeningThresholds(data: {
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
}): string[] {
  const errors: string[] = [];

  // Range checks
  if (data.shortlistThreshold < 0 || data.shortlistThreshold > 100) {
    errors.push("Shortlist threshold must be between 0 and 100");
  }
  // ... other range checks

  // Logical order checks
  if (data.rejectThreshold >= data.borderlineMin) {
    errors.push("Reject threshold must be less than borderline min");
  }
  if (data.borderlineMin >= data.borderlineMax) {
    errors.push("Borderline min must be less than borderline max");
  }
  if (data.borderlineMax >= data.shortlistThreshold) {
    errors.push("Borderline max must be less than shortlist threshold");
  }

  return errors;
}

export function validateScoringThresholds(data: {
  aiShortlistThreshold: number;
  confidenceThreshold: number;
  experienceThresholdYears: number;
}): string[] {
  const errors: string[] = [];

  if (data.aiShortlistThreshold < 0 || data.aiShortlistThreshold > 1) {
    errors.push("AI shortlist threshold must be between 0 and 1");
  }
  if (data.confidenceThreshold < 0 || data.confidenceThreshold > 1) {
    errors.push("Confidence threshold must be between 0 and 1");
  }
  if (data.experienceThresholdYears < 0 || data.experienceThresholdYears > 50) {
    errors.push("Experience threshold must be between 0 and 50 years");
  }

  return errors;
}

export function validateApprovalPolicy(data: {
  compensationBandMin: number;
  compensationBandMax: number;
  requiredApprovers: ApprovalTier[];
}): string[] {
  const errors: string[] = [];

  if (data.compensationBandMin >= data.compensationBandMax) {
    errors.push("Min compensation must be less than max compensation");
  }

  if (data.requiredApprovers.length === 0) {
    errors.push("At least one approver tier is required");
  }

  // Check tier sequential order
  const tiers = data.requiredApprovers.map((a) => a.tier).sort((a, b) => a - b);
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i] !== i + 1) {
      errors.push("Approver tiers must be sequential starting from 1");
    }
  }

  return errors;
}
```

### 6. API Integration

Create `/frontend/src/services/policyService.ts`:

```typescript
export const policyService = {
  // Screening Thresholds
  async getActiveScreeningThreshold(): Promise<ScreeningThreshold> {
    const response = await fetch("/api/admin/screening-thresholds/active");
    return response.json();
  },

  async createScreeningThreshold(
    data: CreateScreeningThresholdInput,
  ): Promise<ScreeningThreshold> {
    const response = await fetch("/api/admin/screening-thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new PolicyValidationError(error.details || [error.message]);
    }
    return response.json();
  },

  // Scoring Thresholds
  async getScoringThresholds(
    jobFamilyId?: string,
  ): Promise<ScoringThreshold[]> {
    const url = jobFamilyId
      ? `/api/admin/scoring-thresholds?jobFamilyId=${jobFamilyId}`
      : "/api/admin/scoring-thresholds";
    const response = await fetch(url);
    return response.json();
  },

  async createScoringThreshold(
    data: CreateScoringThresholdInput,
  ): Promise<ScoringThreshold> {
    const response = await fetch("/api/admin/scoring-thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new PolicyValidationError(error.details || [error.message]);
    }
    return response.json();
  },

  // Approval Policies
  async getApprovalPolicies(): Promise<ApprovalPolicy[]> {
    const response = await fetch("/api/admin/approval-policies");
    return response.json();
  },

  async createApprovalPolicy(
    data: CreateApprovalPolicyInput,
  ): Promise<ApprovalPolicy> {
    const response = await fetch("/api/admin/approval-policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new PolicyValidationError(error.details || [error.message]);
    }
    return response.json();
  },
};
```

### 7. Toast Notifications

- Success: "New threshold version created and will be effective from {date}"
- Error: Display validation errors in toast with list
- Warning: "This change will only affect applications submitted after {effectiveDate}"

## Acceptance Criteria

- [ ] Admin can view current active thresholds for all policy types
- [ ] Admin can create new screening threshold versions
- [ ] Admin can create new scoring threshold versions per job family
- [ ] Admin can create new approval policy versions
- [ ] Real-time validation shows errors as user types
- [ ] Visual range validator shows threshold ranges graphically
- [ ] Effective date must be present or future
- [ ] Invalid values show inline error messages matching backend validation
- [ ] Form prevents submission if validation fails
- [ ] Success message confirms effective date
- [ ] Loading states shown during API calls
- [ ] Error states display user-friendly messages
- [ ] Page is responsive (desktop, tablet)
- [ ] All forms are keyboard accessible

## Testing Requirements

- Unit tests for validation functions
- Integration tests for API service methods
- Component tests for all editors
- E2E tests for complete policy creation flow
- Test validation error display
- Test effective date selection
- Accessibility tests

## Files to Create

- `/frontend/src/app/admin/policies/page.tsx`
- `/frontend/src/components/admin/ScreeningThresholdEditor.tsx`
- `/frontend/src/components/admin/ScoringThresholdEditor.tsx`
- `/frontend/src/components/admin/ApprovalPolicyEditor.tsx`
- `/frontend/src/components/admin/ThresholdRangeVisualizer.tsx`
- `/frontend/src/services/policyService.ts`
- `/frontend/src/utils/policyValidation.ts`
- `/frontend/src/types/policy.ts`
- Component test files

## UI/UX Considerations

- Clear visual distinction between current and new versions
- Inline validation with helpful error messages
- Visual feedback for threshold ranges
- Confirmation required for policy changes
- Warning about effective date impact
- Disabled state for invalid forms
- Loading spinners for async operations

## Related User Story

**US-002 Definition of Done:**

- ✅ Policy editor for AI thresholds, approval policies (This task)
- ✅ Validation rules enforced server-side; range errors surfaced to UI (This task)

## Dependencies

- TASK-001 (Service layer)
- TASK-002 (API endpoints)
- Existing admin layout

## Notes

- Threshold range visualizer helps admins understand impact
- Effective date warnings prevent accidental retroactive changes
- Consider adding "preview" mode to show affected applications
