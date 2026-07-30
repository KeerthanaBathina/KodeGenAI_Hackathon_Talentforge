'use client';

import React from 'react';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

const genericMessage = 'If this email is new to us, you will receive a verification code';

function isPasswordStrong(password: string): boolean {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const passwordHint = useMemo(
    () => 'Password must be at least 8 characters and include one uppercase letter and one number.',
    []
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!isPasswordStrong(password)) {
      setError(passwordHint);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(getApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const body = (await response.json()) as { message?: string };

      if (!response.ok) {
        setError(body.message ?? 'Unable to register now. Please try again.');
        return;
      }

      setNotice(body.message ?? genericMessage);
      router.push(`/verify-otp?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch {
      setError('Unable to register now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Create your candidate account</h1>
        <p>Register with your email, then verify your one-time passcode.</p>

        <form onSubmit={handleSubmit} className="auth-form" noValidate>
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="register-password">Password</label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
          <small>{passwordHint}</small>

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
            {submitting ? 'Submitting...' : 'Register'}
          </button>
        </form>
      </section>
    </main>
  );
}
