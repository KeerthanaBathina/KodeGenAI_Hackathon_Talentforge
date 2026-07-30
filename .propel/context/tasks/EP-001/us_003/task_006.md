---
id: task_006
us_id: us_003
epic: EP-001
title: "Create Login Form UI Component with Validation"
status: done
layer: frontend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-006 — Create Login Form UI Component with Validation

## Context

**User Story**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1 (successful login with routing), Scenario 2 (lockout message display)

The login form provides email/password authentication with client-side validation, error handling for lockout scenarios, and visual feedback during authentication.

---

## Implementation Steps

### Step 1 — Create Login Page

Create `frontend/src/app/login/page.tsx`:

```typescript
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lockoutInfo, setLockoutInfo] = useState<{ message: string; until?: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLockoutInfo(null);

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important for cookies
        body: JSON.stringify({ email, password }),
      });

      const body = await response.json();

      if (response.status === 423) {
        // Account locked
        setLockoutInfo({
          message: body.error?.message || 'Account temporarily locked',
          until: body.error?.lockedUntil,
        });
        return;
      }

      if (!response.ok) {
        setError(body.error?.message || body.message || 'Login failed');
        return;
      }

      // Successful login - redirect to dashboard
      const redirectTo = body.data?.redirectTo || '/dashboard';
      router.push(redirectTo);
    } catch (err) {
      setError('Unable to connect to server');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Sign In</h1>
        <p>Welcome back! Please enter your credentials.</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            required
          />

          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}

          {lockoutInfo && (
            <div
              role="alert"
              className="lockout-warning"
              style={{
                backgroundColor: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'start' }}>
                <svg
                  style={{ height: '20px', width: '20px', color: '#dc2626', marginRight: '12px' }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                    clipRule="evenodd"
                  />
                </svg>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', color: '#7f1d1d', margin: 0, fontWeight: 'bold' }}>
                    Account Locked
                  </p>
                  <p style={{ fontSize: '14px', color: '#7f1d1d', marginTop: '4px' }}>
                    {lockoutInfo.message}
                  </p>
                  {lockoutInfo.until && (
                    <p style={{ fontSize: '12px', color: '#991b1b', marginTop: '8px' }}>
                      Try again after {new Date(lockoutInfo.until).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <p>
            Don't have an account? <Link href="/register">Sign up</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
```

### Step 2 — Add Unit Tests

Create `frontend/src/app/login/__tests__/page.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import LoginPage from '../page';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('LoginPage', () => {
  it('should render login form', () => {
    render(<LoginPage />);
    
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
  });

  it('should submit form with valid credentials', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { redirectTo: '/candidate/applications' },
        }),
      })
    ) as any;

    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/candidate/applications');
    });
  });

  it('should display error for invalid credentials', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        }),
      })
    ) as any;

    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });

  it('should display lockout message for locked account', async () => {
    const lockedUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 423,
        json: () => Promise.resolve({
          error: {
            code: 'ACCOUNT_LOCKED',
            message: 'Account locked due to too many failed attempts',
            lockedUntil,
          },
        }),
      })
    ) as any;

    render(<LoginPage />);
    
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Account Locked');
      expect(screen.getByText(/Try again after/i)).toBeInTheDocument();
    });
  });
});
```

---

## Definition of Done

- [ ] Login page created at `/login`
- [ ] Form validates email and password client-side
- [ ] Submits credentials to `/api/auth/login`
- [ ] Displays error messages for invalid credentials
- [ ] Shows lockout warning with unlock time for HTTP 423
- [ ] Redirects to correct dashboard on successful login
- [ ] Unit tests cover success, error, and lockout scenarios

## Traceability

- **US**: US-003 — Login with Role-Based Routing, Account Lockout, and SSO
- **Epic**: EP-001 — Candidate Onboarding and Identity
- **AC**: Scenarios 1, 2
