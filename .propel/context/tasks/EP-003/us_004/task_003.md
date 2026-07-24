---
id: task_003
us_id: us_004
epic: EP-003
title: "Create GapChip Component for Skill Gaps"
status: done
layer: frontend
effort: 1h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Create GapChip Component for Skill Gaps

## Context

**User Story**: US-004 — AI Explainability UI  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 3 (gap chips display missing skills)

Create a reusable `GapChip` component that displays skill gaps as amber chips with warning icons.

---

## Objective

Build gap chip component that:
1. Displays text label (e.g., "Docker", "Kubernetes")
2. Shows warning/alert icon to indicate missing skill
3. Uses amber styling to convey concern
4. Supports truncation for long text
5. Meets accessibility standards

---

## Implementation Steps

### Step 1 — Create GapChip Component

Create `frontend/src/components/screening/GapChip.tsx`:

```tsx
import React from 'react';

interface GapChipProps {
  label: string;
  className?: string;
}

export function GapChip({ label, className = '' }: GapChipProps) {
  return (
    <div
      className={`gap-chip ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        backgroundColor: '#FEF3C7', // amber-100
        color: '#92400E', // amber-800 for WCAG AA contrast
        borderRadius: '16px',
        fontSize: '13px',
        fontWeight: 500,
        maxWidth: '100%',
      }}
      role="status"
      aria-label={`Missing skill: ${label}`}
    >
      {/* Warning Icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M8.00002 5.33331V7.99998M8.00002 10.6666H8.00669M14.6667 7.99998C14.6667 11.6819 11.6819 14.6666 8.00002 14.6666C4.31812 14.6666 1.33335 11.6819 1.33335 7.99998C1.33335 4.31808 4.31812 1.33331 8.00002 1.33331C11.6819 1.33331 14.6667 4.31808 14.6667 7.99998Z"
          stroke="#D97706" // amber-600
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Label with truncation */}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        {label}
      </span>
    </div>
  );
}
```

### Step 2 — Create Chip List Container

Create `frontend/src/components/screening/GapChipList.tsx`:

```tsx
import React from 'react';
import { GapChip } from './GapChip';

interface GapChipListProps {
  gaps: string[];
  className?: string;
  emptyMessage?: string;
}

export function GapChipList({
  gaps,
  className = '',
  emptyMessage = 'No skill gaps identified',
}: GapChipListProps) {
  if (gaps.length === 0) {
    return (
      <p
        style={{
          fontSize: '13px',
          color: '#6B7280', // gray-500
          fontStyle: 'italic',
        }}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div
      className={`gap-chip-list ${className}`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
      }}
      role="list"
      aria-label="Skill gaps"
    >
      {gaps.map((gap, index) => (
        <div key={index} role="listitem">
          <GapChip label={gap} />
        </div>
      ))}
    </div>
  );
}
```

### Step 3 — Create Storybook Story (Optional)

Create `frontend/src/components/screening/GapChip.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { GapChip } from './GapChip';
import { GapChipList } from './GapChipList';

const meta: Meta<typeof GapChip> = {
  title: 'Screening/GapChip',
  component: GapChip,
};

export default meta;
type Story = StoryObj<typeof GapChip>;

export const Single: Story = {
  args: {
    label: 'Docker',
  },
};

export const Short: Story = {
  args: {
    label: 'Kubernetes',
  },
};

export const Long: Story = {
  args: {
    label: 'Missing required skill: Advanced microservices architecture experience',
  },
};

export const ChipList: StoryObj<typeof GapChipList> = {
  render: () => (
    <GapChipList
      gaps={[
        'Docker',
        'Kubernetes',
        'CI/CD pipeline management',
        'GraphQL',
      ]}
    />
  ),
};

export const EmptyList: StoryObj<typeof GapChipList> = {
  render: () => <GapChipList gaps={[]} />,
};
```

---

## Acceptance Criteria

- [ ] Chip displays text label
- [ ] Warning icon shown on left side
- [ ] Amber background (#FEF3C7) with amber-800 text for contrast
- [ ] Long text truncates with ellipsis
- [ ] Hover shows full text via title attribute
- [ ] WCAG AA contrast ratio met

---

## Testing Checklist

- [ ] Visual test: Chip renders with warning icon
- [ ] Visual test: Long text truncates properly
- [ ] Accessibility: Screen reader announces "Missing skill: [label]"
- [ ] Accessibility: ARIA role="status" present
- [ ] Component test: Empty list shows empty message
- [ ] Component test: Multiple chips wrap correctly

---

## Dependencies

- SVG warning icon (inline, no external assets)
- Inline CSS (per project standards)

---

## Definition of Done

- [ ] GapChip component created
- [ ] GapChipList container created
- [ ] Warning icon implemented
- [ ] Text truncation working
- [ ] Accessibility attributes added
- [ ] Visual tests passing
