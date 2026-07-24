---
id: task_001
us_id: us_004
epic: EP-003
title: "Create ConfidenceMeter Component with Color-Coded Scoring"
status: done
layer: frontend
effort: 1.5h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create ConfidenceMeter Component with Color-Coded Scoring

## Context

**User Story**: US-004 — AI Explainability UI  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1, 4 (confidence meter with color coding based on thresholds)

Create a reusable `ConfidenceMeter` component that displays a screening score as a color-coded progress bar with semantic labeling.

---

## Objective

Build visual confidence meter that:
1. Displays score percentage (0-100%) as a filled progress bar
2. Color-codes based on threshold ranges (green/amber/red)
3. Shows semantic label ("Strong Match", "Borderline", "Below Threshold")
4. Meets WCAG AA accessibility standards

---

## Implementation Steps

### Step 1 — Create ConfidenceMeter Component

Create `frontend/src/components/screening/ConfidenceMeter.tsx`:

```tsx
import React from 'react';

interface ConfidenceMeterProps {
  score: number; // 0-100
  shortlistThreshold: number; // e.g., 75
  borderlineMin: number; // e.g., 40
  rejectThreshold: number; // e.g., 39
  className?: string;
}

type ScoreLevel = 'strong' | 'borderline' | 'below';

function getScoreLevel(
  score: number,
  shortlistThreshold: number,
  rejectThreshold: number
): ScoreLevel {
  if (score >= shortlistThreshold) return 'strong';
  if (score <= rejectThreshold) return 'below';
  return 'borderline';
}

function getColorClass(level: ScoreLevel): string {
  switch (level) {
    case 'strong':
      return 'bg-green-500'; // WCAG AA compliant green
    case 'borderline':
      return 'bg-amber-500'; // WCAG AA compliant amber
    case 'below':
      return 'bg-red-500'; // WCAG AA compliant red
  }
}

function getLabel(level: ScoreLevel): string {
  switch (level) {
    case 'strong':
      return 'Strong Match';
    case 'borderline':
      return 'Borderline';
    case 'below':
      return 'Below Threshold';
  }
}

export function ConfidenceMeter({
  score,
  shortlistThreshold,
  borderlineMin,
  rejectThreshold,
  className = '',
}: ConfidenceMeterProps) {
  const level = getScoreLevel(score, shortlistThreshold, rejectThreshold);
  const colorClass = getColorClass(level);
  const label = getLabel(level);

  return (
    <div className={`confidence-meter ${className}`}>
      {/* Score and Label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151', // gray-700
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
          }}
          aria-label={`Score: ${score} out of 100`}
        >
          {score}%
        </span>
      </div>

      {/* Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '12px',
          backgroundColor: '#E5E7EB', // gray-200
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Screening confidence: ${score} percent, ${label}`}
      >
        <div
          className={colorClass}
          style={{
            width: `${score}%`,
            height: '100%',
            transition: 'width 0.3s ease-in-out',
          }}
        />
      </div>

      {/* Threshold Markers (optional visual aid) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '4px',
          fontSize: '11px',
          color: '#9CA3AF', // gray-400
        }}
      >
        <span>0</span>
        <span style={{ position: 'absolute', left: `${rejectThreshold}%` }}>
          {rejectThreshold}
        </span>
        <span style={{ position: 'absolute', left: `${shortlistThreshold}%` }}>
          {shortlistThreshold}
        </span>
        <span>100</span>
      </div>
    </div>
  );
}
```

### Step 2 — Add Type Definitions

Create `frontend/src/types/screening.ts`:

```typescript
export interface ScreeningThresholds {
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
  version: number;
}

export interface ScreeningFactors {
  positiveFactors: string[];
  skillGaps: string[];
  scoreBreakdown: {
    skillMatch: number;
    experienceMatch: number;
    educationMatch: number;
  };
}

export interface ScreeningResult {
  id: string;
  applicationId: string;
  score: number;
  recommendation: 'shortlist' | 'manual_review' | 'reject';
  factors: ScreeningFactors;
  thresholdVersion: number;
  screenedAt: string;
}
```

### Step 3 — Create Storybook Story (Optional)

Create `frontend/src/components/screening/ConfidenceMeter.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ConfidenceMeter } from './ConfidenceMeter';

const meta: Meta<typeof ConfidenceMeter> = {
  title: 'Screening/ConfidenceMeter',
  component: ConfidenceMeter,
  argTypes: {
    score: { control: { type: 'range', min: 0, max: 100, step: 1 } },
  },
};

export default meta;
type Story = StoryObj<typeof ConfidenceMeter>;

export const StrongMatch: Story = {
  args: {
    score: 85,
    shortlistThreshold: 75,
    borderlineMin: 40,
    rejectThreshold: 39,
  },
};

export const Borderline: Story = {
  args: {
    score: 55,
    shortlistThreshold: 75,
    borderlineMin: 40,
    rejectThreshold: 39,
  },
};

export const BelowThreshold: Story = {
  args: {
    score: 25,
    shortlistThreshold: 75,
    borderlineMin: 40,
    rejectThreshold: 39,
  },
};

export const AtShortlistThreshold: Story = {
  args: {
    score: 75,
    shortlistThreshold: 75,
    borderlineMin: 40,
    rejectThreshold: 39,
  },
};
```

---

## Acceptance Criteria

- [ ] Component displays score as percentage (0-100%)
- [ ] Fill width matches score percentage
- [ ] Green color for score ≥ shortlist threshold
- [ ] Amber color for score in borderline range
- [ ] Red color for score ≤ reject threshold
- [ ] Label shows "Strong Match", "Borderline", or "Below Threshold"
- [ ] WCAG AA contrast ratios met for all color states

---

## Testing Checklist

- [ ] Visual test: 85% score shows green "Strong Match"
- [ ] Visual test: 55% score shows amber "Borderline"
- [ ] Visual test: 25% score shows red "Below Threshold"
- [ ] Accessibility: Screen reader announces score and label
- [ ] Accessibility: Progress bar has proper ARIA attributes
- [ ] Edge case: 0% and 100% scores render correctly
- [ ] Edge case: Score exactly at threshold boundaries

---

## Dependencies

- Screening thresholds (will be fetched in TASK-004)
- Inline CSS (per project standards - no external stylesheets)

---

## Definition of Done

- [ ] ConfidenceMeter component created
- [ ] Color thresholds parameterized (not hardcoded)
- [ ] Accessibility attributes added
- [ ] Visual tests passing
- [ ] Type definitions created
