---
id: task_006
us_id: us_005
epic: EP-003
title: "Fallback Mode Banner Component and Dashboard Integration"
status: done
layer: frontend
effort: 1h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Fallback Mode Banner Component and Dashboard Integration

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 3 (fallback mode banner shown to HR users)

Create amber banner component that displays when AI screening is offline, informing HR users that applications are routed to manual review.

---

## Objective

Build fallback mode notification banner:
1. Poll fallback mode API every 30 seconds
2. Display amber banner when fallback mode active
3. Show reason (high queue depth / worker offline)
4. Auto-hide when fallback mode deactivates
5. Integrate into HR dashboard layouts

---

## Implementation Steps

### Step 1 — Create API Client Function

Update `frontend/src/lib/api/systemStatus.ts`:

```typescript
export interface FallbackModeState {
  active: boolean;
  reason?: 'high_queue_depth' | 'worker_offline' | 'manual';
  activatedAt?: string;
  queueDepth?: number;
  workerOfflineDuration?: number;
}

export async function getFallbackModeState(): Promise<FallbackModeState> {
  const response = await fetch('/api/admin/system-status/fallback-mode', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch fallback mode state');
  }

  return response.json();
}
```

### Step 2 — Create Fallback Mode Banner Component

Create `frontend/src/components/system/FallbackModeBanner.tsx`:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import { getFallbackModeState, FallbackModeState } from '@/lib/api/systemStatus';

export function FallbackModeBanner() {
  const [fallbackMode, setFallbackMode] = useState<FallbackModeState>({ active: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFallbackModeState();

    // Poll every 30 seconds
    const interval = setInterval(fetchFallbackModeState, 30000);

    return () => clearInterval(interval);
  }, []);

  async function fetchFallbackModeState() {
    try {
      const state = await getFallbackModeState();
      setFallbackMode(state);
    } catch (error) {
      console.error('Failed to fetch fallback mode state:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !fallbackMode.active) {
    return null;
  }

  const reasonText = {
    high_queue_depth: 'AI screening queue is experiencing high volume',
    worker_offline: 'AI screening worker is temporarily unavailable',
    manual: 'AI screening has been manually disabled',
  };

  return (
    <div
      style={{
        backgroundColor: '#FEF3C7',
        borderLeft: '4px solid #F59E0B',
        padding: '16px 20px',
        marginBottom: '24px',
        borderRadius: '4px',
      }}
      role="alert"
      aria-live="polite"
    >
      <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
        {/* Warning Icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ flexShrink: 0, marginTop: '2px' }}
        >
          <path
            d="M12 9V11M12 15H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0377 2.66667 10.2679 4L3.33978 16C2.56998 17.3333 3.53223 19 5.07183 19Z"
            stroke="#F59E0B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <div style={{ flex: 1 }}>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#92400E',
              marginBottom: '4px',
            }}
          >
            AI Screening Temporarily Offline
          </h3>
          <p style={{ fontSize: '14px', color: '#92400E', marginBottom: '8px' }}>
            {reasonText[fallbackMode.reason || 'manual']} — applications are being routed directly to the manual review queue.
          </p>
          
          {/* Additional details */}
          <div style={{ fontSize: '13px', color: '#78350F' }}>
            {fallbackMode.reason === 'high_queue_depth' && fallbackMode.queueDepth && (
              <p>Queue depth: {fallbackMode.queueDepth} pending jobs</p>
            )}
            {fallbackMode.reason === 'worker_offline' && fallbackMode.workerOfflineDuration && (
              <p>Worker offline for: {Math.floor(fallbackMode.workerOfflineDuration / 60)} minutes</p>
            )}
            {fallbackMode.activatedAt && (
              <p style={{ marginTop: '4px' }}>
                Active since: {new Date(fallbackMode.activatedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        {/* Dismiss button (optional) */}
        <button
          onClick={() => setFallbackMode({ active: false })}
          style={{
            padding: '4px',
            backgroundColor: 'transparent',
            border: 'none',
            color: '#92400E',
            cursor: 'pointer',
            fontSize: '20px',
            lineHeight: 1,
          }}
          aria-label="Dismiss banner"
        >
          ×
        </button>
      </div>
    </div>
  );
}
```

### Step 3 — Create useInternetBackOnline Hook (Optional Enhancement)

Create `frontend/src/hooks/useFallbackModeState.ts`:

```typescript
import { useEffect, useState } from 'react';
import { getFallbackModeState, FallbackModeState } from '@/lib/api/systemStatus';

/**
 * Hook to track fallback mode state with automatic polling
 */
export function useFallbackModeState(pollInterval = 30000) {
  const [state, setState] = useState<FallbackModeState>({ active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchState() {
      try {
        const data = await getFallbackModeState();
        setState(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch fallback mode state'));
      } finally {
        setLoading(false);
      }
    }

    fetchState();

    const interval = setInterval(fetchState, pollInterval);

    return () => clearInterval(interval);
  }, [pollInterval]);

  return { state, loading, error };
}
```

### Step 4 — Integrate Banner into Dashboard Layouts

Example integration in HR dashboard:

```tsx
// In app/hr/dashboard/page.tsx or similar
import { FallbackModeBanner } from '@/components/system/FallbackModeBanner';

export default function HRDashboard() {
  return (
    <div>
      {/* Fallback mode banner */}
      <FallbackModeBanner />

      {/* Rest of dashboard */}
      <h1>HR Dashboard</h1>
      {/* ... */}
    </div>
  );
}
```

Example integration in manual review queue page:

```tsx
// In app/hr/manual-review/page.tsx
import { FallbackModeBanner } from '@/components/system/FallbackModeBanner';
import { ManualReviewQueueTable } from '@/components/manualReview/ManualReviewQueueTable';

export default function ManualReviewPage() {
  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '16px' }}>
        Manual Review Queue
      </h1>

      <FallbackModeBanner />

      <ManualReviewQueueTable />
    </div>
  );
}
```

---

## Acceptance Criteria

- [ ] Banner displays when fallback mode is active
- [ ] Banner shows reason (high queue depth / worker offline)
- [ ] Banner auto-hides when fallback mode deactivates
- [ ] Banner polls API every 30 seconds
- [ ] Banner integrated into HR dashboard
- [ ] Amber color scheme for warning severity

---

## Testing Checklist

- [ ] Component test: Banner renders when active
- [ ] Component test: Banner hidden when inactive
- [ ] Component test: Banner shows correct reason text
- [ ] Component test: Polling updates state
- [ ] E2E test: Banner appears during fallback mode
- [ ] E2E test: Banner disappears on recovery

---

## Dependencies

- Fallback mode API endpoint (TASK-002)
- System status API client

---

## Definition of Done

- [ ] Banner component created
- [ ] Polling mechanism implemented
- [ ] Banner integrated into dashboard layouts
- [ ] Component tests passing (6+ tests)
- [ ] E2E tests passing
- [ ] Accessible (role="alert", aria-live)
