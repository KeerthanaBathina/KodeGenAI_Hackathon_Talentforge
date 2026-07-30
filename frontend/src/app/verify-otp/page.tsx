'use client';

import React from 'react';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CountdownTimer } from '../../components/CountdownTimer';

const genericMessage = 'If this email is new to us, you will receive a verification code';

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function VerifyOtpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [rateLimitResetAt, setRateLimitResetAt] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  useEffect(() => {
    const initialEmail = searchParams.get('email');
    if (initialEmail) {
      setEmail(initialEmail);
    }

    // Load rate limit state from localStorage on mount
    const storedResetAt = localStorage.getItem('otp_rate_limit_reset');
    if (storedResetAt) {
      const resetDate = new Date(storedResetAt);
      if (resetDate.getTime() > Date.now()) {
        setRateLimitResetAt(storedResetAt);
      } else {
        // Expired, clean up
        localStorage.removeItem('otp_rate_limit_reset');
      }
    }
  }, [searchParams]);

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCanResend(false);

    if (!/^\d{6}$/.test(otp)) {
      setError('OTP must be a 6-digit code.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/verify-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp })
      });

      const body = (await response.json()) as {
        message?: string;
        redirectTo?: string;
        canResend?: boolean;
      };

      if (!response.ok) {
        setError(body.message ?? 'Unable to verify code.');
        setCanResend(Boolean(body.canResend));
        return;
      }

      router.push(body.redirectTo ?? '/onboarding/profile');
    } catch {
      setError('Unable to verify code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (rateLimitResetAt) return; // Don't allow if rate limited

    setResending(true);
    setError(null);
    setNotice(null);
    setRateLimitError(null);

    try {
      const response = await fetch(getApiUrl('/api/auth/resend-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const body = (await response.json()) as {
        message?: string;
        success?: boolean;
        data?: {
          remaining: number;
          resetAt: string;
        };
        error?: {
          code: string;
          message: string;
          retryAfter?: number;
          resetAt?: string;
        };
      };

      if (response.status === 429) {
        // Rate limit hit
        setRateLimitError(body.error?.message ?? 'Too many requests. Please wait before trying again.');
        if (body.error?.resetAt) {
          setRateLimitResetAt(body.error.resetAt);
          // Persist reset time to survive page refresh
          localStorage.setItem('otp_rate_limit_reset', body.error.resetAt);
        }
        return;
      }

      if (!response.ok) {
        setError(body.message ?? 'Unable to resend code right now.');
        return;
      }

      setNotice(body.message ?? genericMessage);
      setCanResend(false);
    } catch {
      setError('Unable to resend code right now.');
    } finally {
      setResending(false);
    }
  }

  function handleCountdownExpire() {
    setRateLimitResetAt(null);
    setRateLimitError(null);
    localStorage.removeItem('otp_rate_limit_reset');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Verify your OTP</h1>
        <p>Enter the 6-digit code sent to your email.</p>

        <form onSubmit={handleVerify} className="auth-form" noValidate>
          <label htmlFor="verify-email">Email</label>
          <input
            id="verify-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="verify-otp">One-time passcode</label>
          <input
            id="verify-otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
            required
          />

          {error ? (
            <p role="alert" className="error-text">
              {error}
            </p>
          ) : null}

          {rateLimitError && rateLimitResetAt ? (
            <div role="alert" className="rate-limit-warning" style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '16px'
            }}>
              <div style={{ display: 'flex', alignItems: 'start' }}>
                <svg style={{ height: '20px', width: '20px', color: '#f59e0b', marginTop: '2px', marginRight: '12px' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', color: '#78350f', margin: 0 }}>
                    Too many resend requests. Please wait{' '}
                    <CountdownTimer
                      resetAt={rateLimitResetAt}
                      onExpire={handleCountdownExpire}
                      className="font-bold"
                    />{' '}
                    before trying again.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {notice ? (
            <p aria-live="polite" className="notice-text">
              {notice}
            </p>
          ) : null}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Verifying...' : 'Verify code'}
          </button>
        </form>

        {canResend ? (
          <button
            type="button"
            className="link-button"
            onClick={handleResend}
            disabled={resending || !!rateLimitResetAt}
          >
            {resending ? 'Resending...' : 'Resend code'}
          </button>
        ) : null}
      </section>
    </main>
  );
}
