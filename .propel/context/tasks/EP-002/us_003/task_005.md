---
id: task_005
us_id: us_003
epic: EP-002
title: "Update RequisitionCard with Application Status States"
status: done
layer: frontend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Update RequisitionCard with Application Status States

## Context

**User Story**: US-003 — Duplicate Application Prevention with Cooling Period Enforcement  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: All scenarios (UI states for different eligibility statuses)

Enhance RequisitionCard to display appropriate button states based on application eligibility (in progress, cooling period, eligible).

---

## Objective

Update RequisitionCard component to:
- Fetch application eligibility on mount
- Show "Application In Progress" for active applications
- Show disabled button with countdown for cooling period
- Show "Apply Now" or "Continue Application" when eligible
- Display tooltips/banners for context

---

## Implementation

**File**: `frontend/src/components/RequisitionCard.tsx`

**State Management**:
```typescript
const [eligibility, setEligibility] = useState<{
  canApply: boolean;
  reason: string;
  daysRemaining?: number;
  existingApplicationId?: string;
  message?: string;
} | null>(null);
const [hasDraft, setHasDraft] = useState(false);
const [isLoadingEligibility, setIsLoadingEligibility] = useState(true);
```

**Fetch Eligibility**:
```typescript
useEffect(() => {
  async function checkEligibility() {
    try {
      const response = await fetch(`/api/requisitions/${requisition.id}/eligibility`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setEligibility(data);
        
        // Also check draft status if eligible
        if (data.canApply) {
          const draftResponse = await fetch(`/api/requisitions/${requisition.id}/has-draft`, {
            credentials: 'include',
          });
          if (draftResponse.ok) {
            const draftData = await draftResponse.json();
            setHasDraft(draftData.hasDraft);
          }
        }
      }
    } catch (error) {
      console.error('Error checking eligibility:', error);
    } finally {
      setIsLoadingEligibility(false);
    }
  }
  
  checkEligibility();
}, [requisition.id]);
```

**Button Rendering Logic**:
```typescript
function renderActionButton() {
  if (isLoadingEligibility) {
    return <div>Loading...</div>;
  }
  
  if (!eligibility) {
    return null;
  }
  
  // Active Application
  if (eligibility.reason === 'active_application') {
    return (
      <div style={{
        padding: '0.5rem 1rem',
        backgroundColor: '#f3f4f6',
        color: '#6b7280',
        borderRadius: '6px',
        fontSize: '0.875rem',
        fontWeight: '500',
      }}>
        Application In Progress
      </div>
    );
  }
  
  // Cooling Period
  if (eligibility.reason === 'cooling_period') {
    return (
      <div>
        <button
          disabled
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#e5e7eb',
            color: '#9ca3af',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'not-allowed',
          }}
          title={eligibility.message}
        >
          Apply (Available in {eligibility.daysRemaining} days)
        </button>
      </div>
    );
  }
  
  // Eligible
  if (eligibility.canApply) {
    return (
      <Link
        href={`/jobs/${requisition.id}/apply`}
        style={{
          display: 'inline-block',
          padding: '0.5rem 1rem',
          backgroundColor: hasDraft ? '#3b82f6' : '#10b981',
          color: 'white',
          borderRadius: '6px',
          textDecoration: 'none',
          fontSize: '0.875rem',
          fontWeight: '500',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasDraft ? '↻ Continue Application' : 'Apply Now'}
      </Link>
    );
  }
  
  return null;
}
```

**Re-application Banner** (when eligible but previously rejected >90 days):
```typescript
{eligibility?.canApply && eligibility.rejectedAt && (
  <div style={{
    padding: '0.5rem',
    backgroundColor: '#dbeafe',
    borderLeft: '4px solid #3b82f6',
    fontSize: '0.75rem',
    color: '#1e40af',
    marginBottom: '0.5rem',
  }}>
    You previously applied — re-application allowed
  </div>
)}
```

---

## Acceptance Criteria

- [ ] Fetches eligibility on component mount
- [ ] Shows "Application In Progress" for active applications
- [ ] Shows disabled button with countdown for cooling period
- [ ] Tooltip shows full message on disabled button hover
- [ ] Shows "Apply Now" when eligible (no previous application)
- [ ] Shows "Continue Application" when draft exists
- [ ] Shows re-application banner when eligible after cooling period
- [ ] Loading state shown while fetching eligibility
- [ ] No errors when eligibility fetch fails

---

## Dependencies

- TASK-003 (GET /api/requisitions/:id/eligibility endpoint)
- Existing RequisitionCard component
- Draft check endpoint (from US-002)

---

## UI States Summary

| Eligibility | Button State | Text | Style | Clickable |
|-------------|--------------|------|-------|-----------|
| Active App | Static div | "Application In Progress" | Gray | No |
| Cooling Period | Disabled button | "Apply (Available in X days)" | Light gray | No (with tooltip) |
| Eligible + No Draft | Link | "Apply Now" | Green | Yes |
| Eligible + Has Draft | Link | "↻ Continue Application" | Blue | Yes |
