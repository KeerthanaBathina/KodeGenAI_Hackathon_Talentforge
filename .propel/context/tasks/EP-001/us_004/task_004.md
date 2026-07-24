---
id: task_004
us_id: us_004
epic: EP-001
title: "Create Forgot Password UI Page"
status: done
layer: frontend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Create Forgot Password UI Page

## Context

**User Story**: US-004 — Forgot Password with Time-Limited Reset Link  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1 (request reset link), Scenario 2 (non-enumeration message)

The forgot password page provides a simple email input form that triggers the reset flow. It must display a generic success message regardless of whether the email exists in the system to prevent user enumeration.

---

## Objective

Create a frontend page that:
- Accepts email input with validation
- Submits to `POST /api/auth/request-password-reset`
- Displays generic success message
- Handles rate limiting (HTTP 429) with countdown timer
- Links back to login page

---

## Technical Specifications

| Component | Behavior |
|-----------|----------|
| Email input | Client-side regex validation |
| Submit button | Disabled during API call |
| Success state | Show "Check your email" message |
| Rate limit state | Display countdown timer with retry-after |
| Error state | Network errors only (not found/invalid email) |

**Success Message**:
> "If this email is registered, you will receive a password reset link. Please check your inbox and spam folder."

---

## Implementation Steps

### Step 1 — Create Forgot Password Page

Create `frontend/src/app/forgot-password/page.tsx`:

```typescript
'use client';

import React from 'react';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { CountdownTimer } from '../../components/CountdownTimer';

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [rateLimitResetAt, setRateLimitResetAt] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRateLimitResetAt(null);

    if (!email) {
      setError('Email address is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/request-password-reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.status === 429) {
        const body = await response.json();
        setRateLimitResetAt(body.error?.resetAt || null);
        setError(body.error?.message || 'Too many requests. Please try again later.');
        setSubmitting(false);
        return;
      }

      if (!response.ok) {
        setError('Unable to process request. Please try again.');
        setSubmitting(false);
        return;
      }

      // Success: show confirmation message
      setSubmitted(true);
    } catch (err) {
      console.error('Forgot password error:', err);
      setError('Unable to connect to server. Please try again.');
      setSubmitting(false);
    }
  }

  function handleRateLimitExpire() {
    setRateLimitResetAt(null);
  }

  if (submitted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          padding: '1rem',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '500px',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          {/* Success Icon */}
          <div
            style={{
              margin: '0 auto 1.5rem',
              width: '64px',
              height: '64px',
              backgroundColor: '#d1fae5',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              style={{ width: '32px', height: '32px', color: '#10b981' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#111827',
            }}
          >
            Check Your Email
          </h1>

          <p
            style={{
              fontSize: '1rem',
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: '1.5',
            }}
          >
            If this email is registered, you will receive a password reset link.
            Please check your inbox and spam folder.
          </p>

          <p
            style={{
              fontSize: '0.875rem',
              color: '#9ca3af',
              marginBottom: '2rem',
            }}
          >
            Didn't receive an email? Check your spam folder or try again in a few minutes.
          </p>

          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              backgroundColor: '#2563eb',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: '600',
            }}
          >
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f9fafb',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          padding: '2rem',
        }}
      >
        <h1
          style={{
            fontSize: '1.875rem',
            fontWeight: 'bold',
            textAlign: 'center',
            marginBottom: '0.5rem',
            color: '#111827',
          }}
        >
          Forgot Password?
        </h1>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '1.5rem',
          }}
        >
          Enter your email and we'll send you a link to reset your password.
        </p>

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fee',
              border: '1px solid #fcc',
              borderRadius: '6px',
              padding: '0.75rem',
              marginBottom: '1rem',
              color: '#c00',
              fontSize: '0.875rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Rate Limit Warning */}
        {rateLimitResetAt && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '1rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#991b1b', marginBottom: '0.5rem' }}>
              <strong>Too many requests</strong>
            </p>
            <p style={{ fontSize: '0.875rem', color: '#991b1b' }}>
              Please wait <CountdownTimer targetDate={new Date(rateLimitResetAt)} onExpire={handleRateLimitExpire} /> before trying again.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={submitting || !!rateLimitResetAt}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                backgroundColor: (submitting || rateLimitResetAt) ? '#f3f4f6' : 'white',
              }}
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !!rateLimitResetAt}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: (submitting || rateLimitResetAt) ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: (submitting || rateLimitResetAt) ? 'not-allowed' : 'pointer',
              marginBottom: '1rem',
            }}
          >
            {submitting ? 'Sending...' : 'Send Reset Link'}
          </button>

          <div style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280' }}>
            Remember your password?{' '}
            <Link
              href="/login"
              style={{
                color: '#2563eb',
                fontWeight: '600',
                textDecoration: 'none',
              }}
            >
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [x] Email input with client-side validation
- [x] Submit button disabled during request
- [x] Generic success message displayed (non-enumeration)
- [x] Rate limit handling with countdown timer
- [x] "Back to Login" link visible
- [x] Error messages for network failures only
- [x] Responsive design for mobile devices

---

## Testing

```typescript
// frontend/tests/forgot-password.spec.ts
describe('Forgot Password Page', () => {
  it('should show success message after submission', async ({ page }) => {
    await page.route('**/api/auth/request-password-reset', async (route) => {
      await route.fulfill({
        status: 202,
        body: JSON.stringify({
          success: true,
          message: 'If this email is registered, you will receive a password reset link',
        }),
      });
    });

    await page.goto('/forgot-password');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByText('Check Your Email')).toBeVisible();
  });

  it('should handle rate limiting', async ({ page }) => {
    const resetAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await page.route('**/api/auth/request-password-reset', async (route) => {
      await route.fulfill({
        status: 429,
        body: JSON.stringify({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
            resetAt,
          },
        }),
      });
    });

    await page.goto('/forgot-password');
    await page.getByLabel('Email Address').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Reset Link' }).click();

    await expect(page.getByText(/Too many requests/)).toBeVisible();
    await expect(page.getByRole('timer')).toBeVisible();
  });
});
```

---

## Dependencies

- CountdownTimer component (from US-002)
- Next.js App Router

---

## Notes

- Success message is intentionally vague to prevent user enumeration
- Rate limit countdown reuses existing CountdownTimer component
- Consider adding reCAPTCHA for additional abuse prevention
