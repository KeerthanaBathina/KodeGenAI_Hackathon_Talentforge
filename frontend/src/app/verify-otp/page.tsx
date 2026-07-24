'use client';

import React from 'react';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

  useEffect(() => {
    const initialEmail = searchParams.get('email');
    if (initialEmail) {
      setEmail(initialEmail);
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
    setResending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(getApiUrl('/api/auth/resend-otp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const body = (await response.json()) as { message?: string };

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
          <button type="button" className="link-button" onClick={handleResend} disabled={resending}>
            {resending ? 'Resending...' : 'Resend code'}
          </button>
        ) : null}
      </section>
    </main>
  );
}
