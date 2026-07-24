---
id: task_005
us_id: us_004
epic: EP-001
title: "Create Reset Password UI Page with Token Validation"
status: done
layer: frontend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Create Reset Password UI Page with Token Validation

## Context

**User Story**: US-004 — Forgot Password with Time-Limited Reset Link  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 3 (expired link error), Scenario 4 (single-use error)

The reset password page validates the token from the URL, displays appropriate error messages for expired/used tokens, and allows the user to set a new password. It must show real-time password strength feedback and handle all token error states gracefully.

---

## Objective

Create a frontend page that:
- Extracts token from URL query parameter
- Validates token on page load via `GET /validate-reset-token/:token`
- Shows password strength requirements
- Submits new password via `POST /reset-password`
- Handles expired, used, and invalid token errors
- Redirects to login on success

---

## Technical Specifications

| State | UI Behavior |
|-------|-------------|
| Loading | Show spinner while validating token |
| Valid token | Display password form with requirements |
| Expired token | Show error + "Request new link" button |
| Used token | Show error + "Request new link" button |
| Invalid token | Show error + "Request new link" button |
| Success | Show success message + redirect to login |

**Password Requirements** (same as registration):
- At least 8 characters
- One uppercase letter
- One lowercase letter
- One number

---

## Implementation Steps

### Step 1 — Create Reset Password Page

Create `frontend/src/app/reset-password/page.tsx`:

```typescript
'use client';

import React from 'react';
import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setValidating(false);
      setTokenError('Missing reset token. Please request a new password reset link.');
      return;
    }

    async function validateToken() {
      try {
        const response = await fetch(getApiUrl(`/api/auth/validate-reset-token/${token}`));
        const body = await response.json();

        if (response.ok && body.valid) {
          setTokenValid(true);
        } else {
          setTokenError(body.message || 'Invalid or expired reset link');
        }
      } catch (err) {
        console.error('Token validation error:', err);
        setTokenError('Unable to validate reset link. Please try again.');
      } finally {
        setValidating(false);
      }
    }

    validateToken();
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client-side validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/\d/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error?.message || 'Unable to reset password');
        setSubmitting(false);
        return;
      }

      // Success
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err) {
      console.error('Reset password error:', err);
      setError('Unable to connect to server. Please try again.');
      setSubmitting(false);
    }
  }

  // Loading state
  if (validating) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 1rem',
            }}
          />
          <p style={{ color: '#6b7280' }}>Validating reset link...</p>
        </div>
        <style jsx>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Token error state
  if (!tokenValid && tokenError) {
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
          {/* Error Icon */}
          <div
            style={{
              margin: '0 auto 1.5rem',
              width: '64px',
              height: '64px',
              backgroundColor: '#fee2e2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              style={{ width: '32px', height: '32px', color: '#dc2626' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
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
            Reset Link Invalid
          </h1>

          <p
            style={{
              fontSize: '1rem',
              color: '#6b7280',
              marginBottom: '2rem',
              lineHeight: '1.5',
            }}
          >
            {tokenError}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link
              href="/forgot-password"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: '600',
              }}
            >
              Request New Link
            </Link>

            <Link
              href="/login"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'white',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: '600',
              }}
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
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
                d="M5 13l4 4L19 7"
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
            Password Reset Successful
          </h1>

          <p
            style={{
              fontSize: '1rem',
              color: '#6b7280',
              marginBottom: '2rem',
            }}
          >
            Redirecting to login...
          </p>
        </div>
      </div>
    );
  }

  // Reset form
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
          Reset Password
        </h1>

        <p
          style={{
            textAlign: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '1.5rem',
          }}
        >
          Enter your new password below.
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              New Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              minLength={8}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                backgroundColor: submitting ? '#f3f4f6' : 'white',
              }}
              placeholder="••••••••"
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="confirmPassword"
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '0.5rem',
                color: '#374151',
              }}
            >
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={submitting}
              minLength={8}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '1rem',
                backgroundColor: submitting ? '#f3f4f6' : 'white',
              }}
              placeholder="••••••••"
            />
          </div>

          {/* Password Requirements */}
          <div
            style={{
              backgroundColor: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '0.75rem',
              marginBottom: '1rem',
              fontSize: '0.75rem',
              color: '#6b7280',
            }}
          >
            <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>Password must contain:</p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              <li>At least 8 characters</li>
              <li>One uppercase letter (A-Z)</li>
              <li>One lowercase letter (a-z)</li>
              <li>One number (0-9)</li>
            </ul>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: submitting ? '#9ca3af' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Acceptance Criteria

- [x] Token validation on page load
- [x] Error states for expired, used, and invalid tokens
- [x] Password and confirm password inputs
- [x] Real-time password requirements display
- [x] Client-side password validation
- [x] Success message with auto-redirect to login
- [x] "Request New Link" button for invalid tokens
- [x] Loading spinner during token validation

---

## Testing

```typescript
// frontend/tests/reset-password.spec.ts
describe('Reset Password Page', () => {
  it('should show error for expired token', async ({ page }) => {
    await page.route('**/api/auth/validate-reset-token/*', async (route) => {
      await route.fulfill({
        status: 400,
        body: JSON.stringify({
          valid: false,
          error: 'TOKEN_EXPIRED',
          message: 'This link has expired',
        }),
      });
    });

    await page.goto('/reset-password?token=expired-token');

    await expect(page.getByText('Reset Link Invalid')).toBeVisible();
    await expect(page.getByText(/expired/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request New Link' })).toBeVisible();
  });

  it('should successfully reset password', async ({ page }) => {
    await page.route('**/api/auth/validate-reset-token/*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ valid: true }),
      });
    });

    await page.route('**/api/auth/reset-password', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          message: 'Password reset successful',
        }),
      });
    });

    await page.goto('/reset-password?token=valid-token');

    await page.getByLabel('New Password').fill('NewPass123!');
    await page.getByLabel('Confirm Password').fill('NewPass123!');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByText('Password Reset Successful')).toBeVisible();
  });

  it('should validate password requirements', async ({ page }) => {
    await page.route('**/api/auth/validate-reset-token/*', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ valid: true }),
      });
    });

    await page.goto('/reset-password?token=valid-token');

    // Test short password
    await page.getByLabel('New Password').fill('short');
    await page.getByLabel('Confirm Password').fill('short');
    await page.getByRole('button', { name: 'Reset Password' }).click();

    await expect(page.getByText(/at least 8 characters/)).toBeVisible();
  });
});
```

---

## Dependencies

- Next.js App Router with useSearchParams
- Password validation utility

---

## Notes

- Token is validated before showing form (prevents wasted user effort)
- Auto-redirect to login after 2 seconds on success
- Consider adding password strength meter for better UX
