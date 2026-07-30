---
id: task_006
us_id: us_005
epic: EP-001
title: "Create Onboarding Checklist UI Component"
status: done
layer: frontend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Create Onboarding Checklist UI Component

## Context

**User Story**: US-005 — Candidate Profile CRUD with Onboarding Checklist and Consent Management  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1 (checklist tracks completion), Scenario 2 (checklist item completes)

A visual checklist component shows candidates their onboarding progress across 5 sections with a real-time completion percentage. The checklist updates automatically when profile sections are saved.

---

## Objective

Create a reusable checklist component that:
- Displays 5 onboarding items with checkmark/unchecked states
- Shows completion percentage (0-100%)
- Updates in real-time when profile sections are completed
- Links to relevant sections or pages
- Uses accessible markup with ARIA labels

---

## Technical Specifications

**Checklist Items**:
1. Basic Information (Full Name, Experience Years)
2. Skills (Minimum 3)
3. Education (Minimum 1 entry)
4. Work History (Minimum 1 entry)
5. Privacy Consent

**Completion Calculation**: Each completed item = 20%, total 100%

---

## Implementation Steps

### Step 1 — Create Checklist Component

Create `frontend/src/components/OnboardingChecklist.tsx`:

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  link?: string;
}

interface CompletionStatus {
  completedSections: string[];
  percentage: number;
  missingFields: string[];
}

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function OnboardingChecklist() {
  const [loading, setLoading] = useState(true);
  const [completion, setCompletion] = useState<CompletionStatus>({
    completedSections: [],
    percentage: 0,
    missingFields: [],
  });

  useEffect(() => {
    async function fetchCompletion() {
      try {
        const response = await fetch(getApiUrl('/api/profile/completion'), {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setCompletion(data);
        }
      } catch (err) {
        console.error('Error fetching completion status:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCompletion();
  }, []);

  const items: ChecklistItem[] = [
    {
      id: 'basic_info',
      label: 'Basic Information',
      completed: completion.completedSections.includes('basic_info'),
      link: '/profile#basic-info',
    },
    {
      id: 'skills',
      label: 'Skills (minimum 3)',
      completed: completion.completedSections.includes('skills'),
      link: '/profile#skills',
    },
    {
      id: 'education',
      label: 'Education',
      completed: completion.completedSections.includes('education'),
      link: '/profile#education',
    },
    {
      id: 'work_history',
      label: 'Work History',
      completed: completion.completedSections.includes('work_history'),
      link: '/profile#work-history',
    },
    {
      id: 'privacy_consent',
      label: 'Privacy Consent',
      completed: completion.completedSections.includes('privacy_consent'),
      link: '/consent',
    },
  ];

  if (loading) {
    return <div style={{ padding: '1rem' }}>Loading checklist...</div>;
  }

  return (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '0.5rem' }}>
        Onboarding Checklist
      </h2>
      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
        Complete all items to apply for jobs
      </p>

      {/* Progress Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Progress</span>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: completion.percentage === 100 ? '#10b981' : '#2563eb' }}>
            {completion.percentage}%
          </span>
        </div>
        <div style={{ backgroundColor: '#e5e7eb', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${completion.percentage}%`,
              backgroundColor: completion.percentage === 100 ? '#10b981' : '#2563eb',
              height: '100%',
              transition: 'width 0.3s',
            }}
          />
        </div>
      </div>

      {/* Checklist Items */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ marginBottom: '0.75rem' }}>
            <Link
              href={item.link || '#'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                borderRadius: '6px',
                textDecoration: 'none',
                color: 'inherit',
                backgroundColor: item.completed ? '#f0fdf4' : '#f9fafb',
                border: `1px solid ${item.completed ? '#a7f3d0' : '#e5e7eb'}`,
                transition: 'all 0.2s',
              }}
            >
              {/* Checkmark Icon */}
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: item.completed ? '#10b981' : '#d1d5db',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                }}
              >
                {item.completed ? '✓' : ''}
              </div>

              <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: '500' }}>
                {item.label}
              </span>

              {!item.completed && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  →
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {/* Missing Fields Warning */}
      {completion.missingFields.length > 0 && (
        <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fef3c7', border: '1px solid #fde68a', borderRadius: '6px' }}>
          <p style={{ fontSize: '0.75rem', color: '#92400e', margin: 0 }}>
            <strong>Missing:</strong> {completion.missingFields.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
```

### Step 2 — Add to Dashboard/Profile Page

Update `frontend/src/app/dashboard/page.tsx` or create candidate dashboard:

```typescript
import OnboardingChecklist from '@/components/OnboardingChecklist';

export default function DashboardPage() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
      {/* Main content */}
      <div>
        {/* Applications, etc. */}
      </div>

      {/* Sidebar with checklist */}
      <aside>
        <OnboardingChecklist />
      </aside>
    </div>
  );
}
```

---

## Acceptance Criteria

- [x] Checklist component displays 5 onboarding items
- [x] Each item shows checkmark when completed, empty circle when incomplete
- [x] Completion percentage displayed (0-100%)
- [x] Progress bar visually represents percentage
- [x] Items link to relevant sections (e.g., /profile, /consent)
- [x] Missing fields displayed below checklist
- [x] Component fetches completion status from API

---

## Dependencies

- TASK-004 (Profile completion API endpoint)

## Testing Notes

E2E tests should verify:
- Initial state shows 0% and all items unchecked
- After completing basic info, percentage updates to 20%
- After accepting consent, percentage reaches 100%
