---
id: task_005
us_id: us_004
epic: EP-003
title: "Integrate Explainability Panel into Application Review UI"
status: done
layer: frontend
effort: 1h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Integrate Explainability Panel into Application Review UI

## Context

**User Story**: US-004 — AI Explainability UI  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (make explainability visible in HR review workflow)

Integrate the `ScreeningExplainabilityPanel` into the application review page where HR reviewers see candidate details.

---

## Objective

Add explainability panel to:
1. Application detail page/modal
2. HR review dashboard
3. Ensure proper placement in UI layout
4. Handle applications without screening data gracefully

---

## Implementation Steps

### Step 1 — Identify Integration Points

Locate the application review UI files (likely in `frontend/src/app` or `frontend/src/pages`).

Typical integration points:
- Application detail page: `/applications/[id]`
- HR review dashboard: `/hr/review`
- Application modal/drawer component

### Step 2 — Add Panel to Application Detail Page

Example integration in `frontend/src/app/applications/[id]/page.tsx`:

```tsx
import { ScreeningExplainabilityPanel } from '@/components/screening/ScreeningExplainabilityPanel';

export default function ApplicationDetailPage({ params }: { params: { id: string } }) {
  const applicationId = params.id;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Application Header */}
      <ApplicationHeader applicationId={applicationId} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '24px',
          marginTop: '24px',
        }}
      >
        {/* Left Column: Resume, Cover Letter, etc. */}
        <div>
          <CandidateProfile applicationId={applicationId} />
          <ResumeViewer applicationId={applicationId} />
        </div>

        {/* Right Column: Screening Analysis */}
        <div>
          <ScreeningExplainabilityPanel applicationId={applicationId} />
        </div>
      </div>
    </div>
  );
}
```

### Step 3 — Add to HR Review List (Optional)

For review list/table, add a compact view or expandable row:

```tsx
import { ConfidenceMeter } from '@/components/screening/ConfidenceMeter';

// In review table row
<td>
  <ConfidenceMeter
    score={application.screening?.score || 0}
    shortlistThreshold={thresholds.shortlistThreshold}
    borderlineMin={thresholds.borderlineMin}
    rejectThreshold={thresholds.rejectThreshold}
  />
</td>
```

### Step 4 — Add Screening Status Badge

Create a quick-reference badge for lists:

```tsx
function ScreeningBadge({ recommendation }: { recommendation: string }) {
  const colors = {
    shortlist: { bg: '#D1FAE5', text: '#065F46' },
    manual_review: { bg: '#FEF3C7', text: '#92400E' },
    reject: { bg: '#FEE2E2', text: '#991B1B' },
  };

  const color = colors[recommendation] || colors.manual_review;

  return (
    <span
      style={{
        padding: '4px 8px',
        backgroundColor: color.bg,
        color: color.text,
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 500,
      }}
    >
      {recommendation.replace('_', ' ')}
    </span>
  );
}
```

### Step 5 — Update Application List Query

Ensure application list queries include screening data:

```typescript
// In API fetch or query
const applications = await fetch('/api/applications?includeScreening=true');
```

---

## Acceptance Criteria

- [ ] Explainability panel visible on application detail page
- [ ] Panel shows for applications with screening data
- [ ] Graceful handling when no screening data exists
- [ ] Layout responsive (works on desktop and tablet)
- [ ] Panel positioned logically in review workflow

---

## Testing Checklist

- [ ] E2E test: Navigate to application detail, see screening panel
- [ ] E2E test: Application without screening shows empty state
- [ ] Visual test: Panel fits in layout without overflow
- [ ] Responsive test: Works on tablet viewport (768px)
- [ ] Accessibility test: Panel accessible via keyboard navigation

---

## Dependencies

- ScreeningExplainabilityPanel component (TASK-004)
- Application detail page/component
- Backend API returns screening data with application

---

## Definition of Done

- [ ] Panel integrated into application detail UI
- [ ] Optional: Badge/meter added to list view
- [ ] Layout tested and responsive
- [ ] E2E tests passing
- [ ] No UI regressions
