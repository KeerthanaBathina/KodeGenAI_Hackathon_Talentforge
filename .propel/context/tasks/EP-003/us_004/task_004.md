---
id: task_004
us_id: us_004
epic: EP-003
title: "Create ScreeningExplainabilityPanel Container Component"
status: done
layer: frontend
effort: 1.5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Create ScreeningExplainabilityPanel Container Component

## Context

**User Story**: US-004 — AI Explainability UI  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (orchestrates confidence meter, factor chips, gap chips)

Create a container component that fetches screening data and thresholds, then displays the complete explainability UI.

---

## Objective

Build explainability panel that:
1. Fetches screening result for an application
2. Fetches active thresholds for color coding
3. Orchestrates ConfidenceMeter, FactorChipList, GapChipList
4. Handles loading and error states
5. Shows score breakdown (skill/experience/education)

---

## Implementation Steps

### Step 1 — Create API Client Functions

Create `frontend/src/lib/api/screening.ts`:

```typescript
import { ScreeningResult, ScreeningThresholds } from '@/types/screening';

export async function getScreeningByApplication(
  applicationId: string
): Promise<ScreeningResult> {
  const response = await fetch(`/api/screenings/application/${applicationId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Screening not found for this application');
    }
    throw new Error('Failed to fetch screening data');
  }

  return response.json();
}

export async function getActiveThresholds(): Promise<ScreeningThresholds> {
  const response = await fetch('/api/admin/thresholds/active', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch screening thresholds');
  }

  return response.json();
}
```

### Step 2 — Create ScreeningExplainabilityPanel Component

Create `frontend/src/components/screening/ScreeningExplainabilityPanel.tsx`:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ConfidenceMeter } from './ConfidenceMeter';
import { FactorChipList } from './FactorChipList';
import { GapChipList } from './GapChipList';
import { getScreeningByApplication, getActiveThresholds } from '@/lib/api/screening';
import type { ScreeningResult, ScreeningThresholds } from '@/types/screening';

interface ScreeningExplainabilityPanelProps {
  applicationId: string;
  className?: string;
}

export function ScreeningExplainabilityPanel({
  applicationId,
  className = '',
}: ScreeningExplainabilityPanelProps) {
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [thresholds, setThresholds] = useState<ScreeningThresholds | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [screeningData, thresholdData] = await Promise.all([
          getScreeningByApplication(applicationId),
          getActiveThresholds(),
        ]);
        setScreening(screeningData);
        setThresholds(thresholdData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load screening data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [applicationId]);

  if (loading) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#6B7280',
        }}
      >
        Loading screening analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '24px',
          backgroundColor: '#FEF2F2',
          borderRadius: '8px',
          color: '#991B1B',
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>Error</p>
        <p style={{ fontSize: '14px' }}>{error}</p>
      </div>
    );
  }

  if (!screening || !thresholds) {
    return (
      <div
        style={{
          padding: '24px',
          textAlign: 'center',
          color: '#6B7280',
          fontStyle: 'italic',
        }}
      >
        No screening data available for this application
      </div>
    );
  }

  return (
    <div
      className={`screening-explainability-panel ${className}`}
      style={{
        padding: '24px',
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
      }}
    >
      {/* Header */}
      <h3
        style={{
          fontSize: '18px',
          fontWeight: 600,
          color: '#111827',
          marginBottom: '20px',
        }}
      >
        AI Screening Analysis
      </h3>

      {/* Confidence Meter */}
      <div style={{ marginBottom: '24px' }}>
        <ConfidenceMeter
          score={screening.score}
          shortlistThreshold={thresholds.shortlistThreshold}
          borderlineMin={thresholds.borderlineMin}
          rejectThreshold={thresholds.rejectThreshold}
        />
      </div>

      {/* Score Breakdown */}
      {screening.factors?.scoreBreakdown && (
        <div style={{ marginBottom: '24px' }}>
          <h4
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '12px',
            }}
          >
            Score Breakdown
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
            }}
          >
            <ScoreBreakdownItem
              label="Skills"
              score={screening.factors.scoreBreakdown.skillMatch}
              max={50}
            />
            <ScoreBreakdownItem
              label="Experience"
              score={screening.factors.scoreBreakdown.experienceMatch}
              max={30}
            />
            <ScoreBreakdownItem
              label="Education"
              score={screening.factors.scoreBreakdown.educationMatch}
              max={20}
            />
          </div>
        </div>
      )}

      {/* Positive Factors */}
      <div style={{ marginBottom: '24px' }}>
        <h4
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '12px',
          }}
        >
          Positive Factors
        </h4>
        <FactorChipList factors={screening.factors?.positiveFactors || []} />
      </div>

      {/* Skill Gaps */}
      <div>
        <h4
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            marginBottom: '12px',
          }}
        >
          Skill Gaps
        </h4>
        <GapChipList gaps={screening.factors?.skillGaps || []} />
      </div>
    </div>
  );
}

interface ScoreBreakdownItemProps {
  label: string;
  score: number;
  max: number;
}

function ScoreBreakdownItem({ label, score, max }: ScoreBreakdownItemProps) {
  const percentage = Math.round((score / max) * 100);

  return (
    <div
      style={{
        padding: '12px',
        backgroundColor: '#F9FAFB',
        borderRadius: '6px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: '12px', color: '#6B7280', fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: '12px', color: '#111827', fontWeight: 600 }}>
          {score}/{max}
        </span>
      </div>
      <div
        style={{
          height: '4px',
          backgroundColor: '#E5E7EB',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: '#3B82F6',
          }}
        />
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] Panel fetches screening data for application
- [ ] Panel fetches active thresholds
- [ ] Loading state displayed while fetching
- [ ] Error state displayed on fetch failure
- [ ] Empty state displayed if no screening data
- [ ] All child components receive correct props

---

## Testing Checklist

- [ ] Component test: Loading state renders
- [ ] Component test: Error state renders
- [ ] Component test: Empty state renders
- [ ] Component test: Data state renders all sections
- [ ] Integration test: API calls made with correct URLs
- [ ] Integration test: Components receive screening data

---

## Dependencies

- ConfidenceMeter component (TASK-001)
- FactorChipList component (TASK-002)
- GapChipList component (TASK-003)
- Backend screening API endpoints

---

## Definition of Done

- [ ] ScreeningExplainabilityPanel component created
- [ ] API client functions created
- [ ] Loading/error/empty states implemented
- [ ] Score breakdown visualization added
- [ ] All tests passing
