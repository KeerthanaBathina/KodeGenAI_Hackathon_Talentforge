'use client';

import React from 'react';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from '../auth-pages.module.css';

const genericMessage = 'If this email is new to us, you will receive a verification code';

function isPasswordStrong(password: string): boolean {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

function getPasswordStrength(password: string): 'weak' | 'strong' {
  return isPasswordStrong(password) ? 'strong' : 'weak';
}

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  const isLocalDevHost =
    typeof window !== 'undefined' &&
    (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

  if (isLocalDevHost) {
    return `http://localhost:3001${pathname}`;
  }

  if (!base) {
    return pathname;
  }

  return `${base}${pathname}`;
}

export default function RegisterPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCode, setPhoneCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      const body = (await response.json()) as { message?: string; redirectTo?: string };

      if (!response.ok) {
        setError(body.message ?? 'Unable to register now. Please try again.');
        return;
      }

      setNotice(body.message ?? genericMessage);
      //router.push(`/verify-otp?email=${encodeURIComponent(email.trim().toLowerCase())}`);
      router.push(body.redirectTo ?? '/onboarding/profile');
    } catch {
      setError('Unable to register now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const passwordStrength = getPasswordStrength(password);

  return (
    <main className={styles.shell}>
      <div className={styles.wfHeader}>
        <span><span className={styles.wfTag}>SCR-002</span>Registration Page . Route: /register . Role: Applicant</span>
        <span>FR-001, FR-003, FR-006, FR-007, FR-008</span>
      </div>

      <div className={styles.brandBar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>TF</span>
          TalentForge
        </div>
      </div>

      <section className={`${styles.pageBody} ${styles.pageBodyTop}`}>
        <div className={`${styles.card} ${styles.registerCard}`}>
          <div className={styles.stepRail}>
            <div className={styles.stepItem}>
              <span className={`${styles.stepCircle} ${styles.stepActive}`}>1</span>
              <span className={`${styles.stepLabel} ${styles.stepLabelActive}`}>Contact Details</span>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.stepItem}>
              <span className={`${styles.stepCircle} ${styles.stepPending}`}>2</span>
              <span className={`${styles.stepLabel} ${styles.stepLabelPending}`}>Verify OTP</span>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.stepItem}>
              <span className={`${styles.stepCircle} ${styles.stepPending}`}>3</span>
              <span className={`${styles.stepLabel} ${styles.stepLabelPending}`}>Consent</span>
            </div>
          </div>

          <h1 className={styles.cardTitle}>Create your account</h1>
          <p className={styles.cardSubtitle}>Step 1 of 3 . Enter your contact details</p>

          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <div className={styles.row2}>
              <div className={styles.field}>
                <label htmlFor="register-first-name">First Name <span aria-hidden="true" className={styles.required}>*</span></label>
                <input
                  id="register-first-name"
                  className={styles.input}
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="Jane"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="register-last-name">Last Name <span aria-hidden="true" className={styles.required}>*</span></label>
                <input
                  id="register-last-name"
                  className={styles.input}
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="register-email">Email <span aria-hidden="true" className={styles.required}>*</span></label>
              <input
                id="register-email"
                aria-label="Email"
                className={styles.input}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jane.doe@example.com"
                required
              />
              <p className={styles.helperText}>OTP will be sent to verify this email.</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="register-phone">Phone Number <span aria-hidden="true" className={styles.required}>*</span></label>
              <div className={styles.phoneGroup}>
                <select
                  aria-label="Country code"
                  className={`${styles.select} ${styles.phoneCode}`}
                  value={phoneCode}
                  onChange={(event) => setPhoneCode(event.target.value)}
                >
                  <option value="+91">+91</option>
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                </select>
                <input
                  id="register-phone"
                  className={styles.input}
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="98765 43210"
                />
              </div>
              <p className={styles.noteBox}>Country code and phone capture are collected for screening communications.</p>
            </div>

            <div className={styles.field}>
              <label htmlFor="register-password">Password <span aria-hidden="true" className={styles.required}>*</span></label>
              <div className={styles.inputWrap}>
                <input
                  id="register-password"
                  aria-label="Password"
                  className={`${styles.input} ${styles.inputWithSuffix}`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  placeholder="Create a strong password"
                />
                <button
                  type="button"
                  className={styles.suffixButton}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className={styles.passwordStrength}>
                <div className={styles.passwordTrack}>
                  <div
                    className={`${styles.passwordFill} ${passwordStrength === 'strong' ? styles.passwordStrong : styles.passwordWeak}`}
                  />
                </div>
                <span
                  className={`${styles.passwordLabel} ${passwordStrength === 'strong' ? styles.passwordStrongText : styles.passwordWeakText}`}
                >
                  {passwordStrength === 'strong' ? 'Strong password' : 'Fair - add uppercase letters and a number.'}
                </span>
              </div>
              <p className={styles.helperText}>{passwordHint}</p>
            </div>

            {error ? (
              <p role="alert" className={styles.errorBanner}>
                <span aria-hidden="true">!</span>
                <span>{error}</span>
              </p>
            ) : null}

            {notice ? (
              <p aria-live="polite" className={styles.helperText}>
                {notice}
              </p>
            ) : null}

            <button type="submit" disabled={submitting} className={styles.btnPrimary}>
              {submitting ? 'Submitting...' : 'Register'}
            </button>
          </form>

          <p className={styles.footerText}>
            Already have an account? <Link className={styles.link} href="/login">Sign in</Link>
          </p>
        </div>
      </section>

      <footer className={styles.footerBar}>2026 TalentForge</footer>
    </main>
  );
}
