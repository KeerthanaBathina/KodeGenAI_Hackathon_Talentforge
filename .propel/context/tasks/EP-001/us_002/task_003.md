---
id: task_003
us_id: us_002
epic: EP-001
title: "Add Countdown Timer UI Component for Lockout Display"
status: done
layer: frontend
effort: 3h
priority: medium
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Add Countdown Timer UI Component for Lockout Display

## Context

**User Story**: US-002 — OTP Resend Rate Limiting with Lockout Window  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 2 (UI displays countdown showing time until lockout expires)

When a candidate exceeds the OTP resend limit, the frontend must display a clear countdown timer showing exactly how long they must wait before trying again. This prevents user frustration and reduces support load.

---

## Objective

Create a reusable countdown timer component that:
- Displays remaining lockout time in MM:SS format
- Updates every second with React state
- Disables the "Resend" button during lockout
- Automatically re-enables the button when timer expires
- Handles edge cases (page refresh, tab switching)

---

## Technical Specifications

| Component | Requirement | Rationale |
|-----------|-------------|-----------|
| Timer Format | `MM:SS` (e.g., "08:34") | Clear, familiar format; shows minutes + seconds |
| Update Frequency | 1 second | Balance precision vs. battery/CPU usage |
| Button State | Disabled during lockout | Prevents confusion from clickable but failing button |
| Message Template | "Too many requests — please wait {timer}" | Clear, non-technical language |
| Auto Re-enable | On timer expiry | Removes need for page refresh |
| Persistence | Store `resetAt` in localStorage | Survives page refresh |

**Component API**:

```typescript
interface CountdownTimerProps {
  resetAt: Date | string;           // When lockout expires
  onExpire?: () => void;            // Callback when countdown reaches 0
  className?: string;               // Styling
}

// Usage
<CountdownTimer 
  resetAt={rateLimitResetAt} 
  onExpire={() => setIsResendDisabled(false)} 
/>
```

---

## Implementation Steps

### Step 1 — Create Countdown Timer Hook

Create `frontend/src/hooks/useCountdown.ts`:

```typescript
import { useState, useEffect, useRef } from 'react';

interface CountdownResult {
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
  formatted: string;  // "MM:SS"
}

/**
 * Countdown hook that updates every second until a target timestamp.
 * 
 * @param targetDate - Target timestamp (Date object or ISO string)
 * @param onExpire - Optional callback when countdown reaches 0
 * @returns Countdown state with formatted time
 */
export function useCountdown(
  targetDate: Date | string | null,
  onExpire?: () => void
): CountdownResult {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const onExpireRef = useRef(onExpire);

  // Keep callback ref updated
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft(0);
      return;
    }

    const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;

    // Calculate initial time left
    const updateTimeLeft = () => {
      const now = Date.now();
      const difference = target.getTime() - now;
      
      if (difference <= 0) {
        setTimeLeft(0);
        if (onExpireRef.current) {
          onExpireRef.current();
        }
        return false; // Stop interval
      }
      
      setTimeLeft(Math.ceil(difference / 1000));
      return true; // Continue interval
    };

    // Update immediately
    if (!updateTimeLeft()) {
      return; // Already expired
    }

    // Update every second
    const interval = setInterval(() => {
      if (!updateTimeLeft()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return {
    minutes,
    seconds,
    totalSeconds: timeLeft,
    isExpired: timeLeft <= 0,
    formatted,
  };
}
```

### Step 2 — Create Countdown Timer Component

Create `frontend/src/components/CountdownTimer.tsx`:

```typescript
import { useCountdown } from '../hooks/useCountdown';

interface CountdownTimerProps {
  resetAt: Date | string;
  onExpire?: () => void;
  className?: string;
}

/**
 * Displays a countdown timer showing time until a target timestamp.
 * Automatically updates every second and calls onExpire when reaching 0.
 */
export function CountdownTimer({ resetAt, onExpire, className = '' }: CountdownTimerProps) {
  const { formatted, isExpired } = useCountdown(resetAt, onExpire);

  if (isExpired) {
    return null;
  }

  return (
    <span 
      className={`font-mono text-sm ${className}`}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      {formatted}
    </span>
  );
}
```

### Step 3 — Update OTP Verification Page

Modify the OTP verification page to integrate rate limit UI:

```typescript
// frontend/src/app/(auth)/verify-otp/page.tsx (or equivalent)
import { useState, useEffect } from 'react';
import { CountdownTimer } from '@/components/CountdownTimer';

export default function VerifyOtpPage() {
  const [isResendDisabled, setIsResendDisabled] = useState(false);
  const [rateLimitResetAt, setRateLimitResetAt] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  // Load rate limit state from localStorage on mount
  useEffect(() => {
    const storedResetAt = localStorage.getItem('otp_rate_limit_reset');
    if (storedResetAt) {
      const resetDate = new Date(storedResetAt);
      if (resetDate.getTime() > Date.now()) {
        setRateLimitResetAt(storedResetAt);
        setIsResendDisabled(true);
      } else {
        // Expired, clean up
        localStorage.removeItem('otp_rate_limit_reset');
      }
    }
  }, []);

  const handleResendOtp = async () => {
    if (isResendDisabled) return;

    try {
      const response = await fetch('/api/v1/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
      });

      const data = await response.json();

      if (response.status === 429) {
        // Rate limit hit
        setRateLimitError(data.error.message);
        setRateLimitResetAt(data.error.resetAt);
        setIsResendDisabled(true);
        
        // Persist reset time to survive page refresh
        localStorage.setItem('otp_rate_limit_reset', data.error.resetAt);
      } else if (response.ok) {
        // Success
        setRateLimitError(null);
        // Show success toast
        toast.success('Verification code sent');
        
        // Update remaining attempts UI if needed
        if (data.data.remaining === 0) {
          // Last attempt used, prepare for potential lockout
        }
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      toast.error('Failed to send verification code');
    }
  };

  const handleCountdownExpire = () => {
    setIsResendDisabled(false);
    setRateLimitResetAt(null);
    setRateLimitError(null);
    localStorage.removeItem('otp_rate_limit_reset');
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Verify Your Email</h1>
      
      {/* OTP Input Fields */}
      <div className="mb-6">
        {/* OTP input component here */}
      </div>

      {/* Rate Limit Error Message */}
      {rateLimitError && rateLimitResetAt && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4" role="alert">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-yellow-800">
                Too many resend requests. Please wait{' '}
                <CountdownTimer 
                  resetAt={rateLimitResetAt} 
                  onExpire={handleCountdownExpire}
                  className="font-bold text-yellow-900"
                />{' '}
                before trying again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resend Button */}
      <button
        onClick={handleResendOtp}
        disabled={isResendDisabled}
        className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium"
      >
        Resend verification code
      </button>
    </div>
  );
}
```

### Step 4 — Add Unit Tests

Create `frontend/src/hooks/__tests__/useCountdown.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCountdown } from '../useCountdown';

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should count down from 90 seconds', () => {
    const targetDate = new Date(Date.now() + 90000); // 90 seconds from now
    const { result } = renderHook(() => useCountdown(targetDate));

    expect(result.current.minutes).toBe(1);
    expect(result.current.seconds).toBe(30);
    expect(result.current.formatted).toBe('01:30');
    expect(result.current.isExpired).toBe(false);

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    expect(result.current.formatted).toBe('01:00');
  });

  it('should call onExpire when countdown reaches 0', () => {
    const onExpire = vi.fn();
    const targetDate = new Date(Date.now() + 2000); // 2 seconds from now
    
    renderHook(() => useCountdown(targetDate, onExpire));

    // Advance past expiry
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('should show 00:00 when expired', () => {
    const targetDate = new Date(Date.now() + 1000);
    const { result } = renderHook(() => useCountdown(targetDate));

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.formatted).toBe('00:00');
    expect(result.current.isExpired).toBe(true);
  });

  it('should handle ISO string input', () => {
    const targetDate = new Date(Date.now() + 60000).toISOString();
    const { result } = renderHook(() => useCountdown(targetDate));

    expect(result.current.formatted).toBe('01:00');
  });
});
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Timer counts down | Trigger rate limit, wait 1s | Display decrements by 1 second |
| MM:SS format | Check display | Shows "08:45" format (not "8:45" or "525 seconds") |
| Button disabled | During countdown | Resend button is disabled and styled appropriately |
| Auto re-enable | Wait for timer expiry | Button becomes clickable, error message clears |
| Page refresh | Refresh during lockout | Timer continues from correct time (localStorage) |
| onExpire callback | Timer reaches 0 | Callback fires once |

---

## Dependencies

- TASK-002 (Backend returns `resetAt` timestamp in 429 response)
- Existing OTP verification page/component

## Accessibility Constraints

- **WCAG 2.1 AA**: Timer must have `role="timer"` and `aria-live="polite"` for screen reader announcements
- **WCAG 1.4.3 (Contrast)**: Timer text must meet 4.5:1 contrast ratio
- **WCAG 2.2.1 (Timing Adjustable)**: User can dismiss warning and retry (not auto-submit on expiry)

---

## Definition of Done

- [ ] `useCountdown` hook created with per-second updates
- [ ] `CountdownTimer` component displays MM:SS format
- [ ] OTP verification page integrates countdown with resend button
- [ ] Resend button disabled during lockout
- [ ] Rate limit state persisted to localStorage (survives refresh)
- [ ] Timer auto-clears and re-enables button on expiry
- [ ] Unit tests cover countdown logic and expiry callback
- [ ] Accessibility attributes (`role="timer"`, `aria-live`) present

## Traceability

- **US**: US-002 — OTP Resend Rate Limiting with Lockout Window
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenario 2 (UI countdown timer)
