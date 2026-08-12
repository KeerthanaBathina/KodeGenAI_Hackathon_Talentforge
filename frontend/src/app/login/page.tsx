'use client';

import React from 'react';
import { FormEvent, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CountdownTimer } from '../../components/CountdownTimer';
import { buildApiUrl } from '@/lib/api/url';
import styles from '../auth-pages.module.css';

function getOAuthErrorMessage(code: string | null, provider: string | null): string | null {
    if (!code) {
        return null;
    }

    const providerLabel = provider === 'google'
        ? 'Google'
        : provider === 'github'
            ? 'GitHub'
            : 'OAuth provider';

    const messages: Record<string, string> = {
        provider_not_configured: `${providerLabel} sign-in is not configured right now. Please use email and password.`,
        missing_code: `${providerLabel} sign-in did not complete correctly. Please try again.`,
        invalid_code: `${providerLabel} authorization expired or is invalid. Please try signing in again.`,
        email_required: `${providerLabel} account did not provide an email address. Please use another sign-in method.`,
        account_unavailable: 'This account is unavailable. Please contact support.',
        oauth_init_failed: `${providerLabel} sign-in could not be started. Please try again later.`,
        oauth_failed: `${providerLabel} sign-in failed. Please try again.`,
    };

    return messages[code] ?? 'Unable to complete social sign-in. Please try again.';
}

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lockoutInfo, setLockoutInfo] = useState<{ message: string; until?: string } | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        // Load lockout state from localStorage on mount
        const storedLockoutUntil = localStorage.getItem('account_locked_until');
        if (storedLockoutUntil) {
            const lockoutDate = new Date(storedLockoutUntil);
            if (lockoutDate.getTime() > Date.now()) {
                setLockoutInfo({
                    message: 'Account temporarily locked due to too many failed login attempts',
                    until: storedLockoutUntil,
                });
            } else {
                // Expired, clean up
                localStorage.removeItem('account_locked_until');
            }
        }

        const oauthError = searchParams.get('oauthError');
        const oauthProvider = searchParams.get('oauthProvider');
        const oauthErrorMessage = getOAuthErrorMessage(oauthError, oauthProvider);
        if (oauthErrorMessage) {
            setError(oauthErrorMessage);
        }
    }, [searchParams]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setLockoutInfo(null);

        // Prevent stale bearer tokens (e.g., from candidate OTP flow) from overriding new session cookies.
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_email');
        localStorage.removeItem('auth_phone');

        if (!email || !password) {
            setError('Email and password are required');
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError('Please enter a valid email address');
            return;
        }

        // Basic password validation
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setSubmitting(true);

        try {
            const response = await fetch(buildApiUrl('/api/auth/login'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Important for cookies
                body: JSON.stringify({ email, password }),
            });

            const body = await response.json();

            if (response.status === 423) {
                // Account locked
                const lockoutMessage = body.error?.message || 'Account temporarily locked due to too many failed login attempts';
                const lockedUntil = body.error?.lockedUntil;

                setLockoutInfo({
                    message: lockoutMessage,
                    until: lockedUntil,
                });

                // Persist lockout state
                if (lockedUntil) {
                    localStorage.setItem('account_locked_until', lockedUntil);
                }

                setSubmitting(false);
                return;
            }

            if (!response.ok) {
                setError(body.error?.message || 'Invalid email or password');
                setSubmitting(false);
                return;
            }

            // Success - normalize redirect data and keep role-based fallback on client.
            const role = body.data?.user?.role || body.user?.role;
            const apiRedirect = body.data?.redirectTo || body.redirectTo;
            const normalizedEmail = email.trim().toLowerCase();

            const roleFallbackMap: Record<string, string> = {
                candidate: '/candidate/dashboard',
                hr_reviewer: '/hr/dashboard',
                hr_manager: '/hr/dashboard',
                admin: '/admin/health',
            };

            const emailFallbackMap: Record<string, string> = {
                'hr-reviewer@dev.local': '/hr/dashboard',
                'hr-manager@dev.local': '/hr/dashboard',
                'admin@dev.local': '/admin/health',
            };

            const strictInternalRedirect = emailFallbackMap[normalizedEmail]
                || (role ? roleFallbackMap[role] : undefined);

            // Always enforce known internal redirects before trusting any API redirect.
            const redirectTo =
                strictInternalRedirect
                    ? strictInternalRedirect
                    : apiRedirect || '/candidate/dashboard';

            if (typeof body.accessToken === 'string' && body.accessToken.length > 0) {
                localStorage.setItem('auth_token', body.accessToken);
            }
            if (typeof role === 'string' && role.length > 0) {
                localStorage.setItem('auth_role', role);
            }
            localStorage.setItem('auth_email', normalizedEmail);

                if ((body.user?.role ?? 'candidate') === 'candidate') {
                    try {
                        const contactInfoResponse = await fetch(buildApiUrl('/api/applications/contact-info'), {
                            credentials: 'include',
                        });
                        if (contactInfoResponse.ok) {
                            const contactInfo = await contactInfoResponse.json();
                            if (typeof contactInfo?.phone === 'string' && contactInfo.phone.trim().length > 0) {
                                localStorage.setItem('auth_phone', contactInfo.phone.trim());
                            }
                        }
                    } catch {
                        // Non-blocking: phone fallback can still come from profile/contact fetch on apply page.
                    }
                }

            router.push(redirectTo);
        } catch (err) {
            console.error('Login error:', err);
            setError('Unable to connect to server. Please try again.');
            setSubmitting(false);
        }
    }

    function handleOAuthLogin(provider: 'google' | 'github') {
        // Redirect to OAuth endpoint
        window.location.href = buildApiUrl(`/api/auth/oauth/${provider}`);
    }

    function handleLockoutExpire() {
        setLockoutInfo(null);
        localStorage.removeItem('account_locked_until');
    }

    return (
        <main className={styles.shell}>

            <div className={styles.brandBar}>
                <div className={styles.brand}>
                    <span className={styles.brandMark}>TF</span>
                    TalentForge
                </div>
            </div>

            <section className={styles.pageBody}>
                <div className={`${styles.card} ${styles.loginCard}`}>
                    <h1 className={styles.cardTitle}>Welcome back</h1>
                    <p className={styles.cardSubtitle}>Sign in to your account to continue</p>

                    {lockoutInfo && (
                        <div role="alert" className={styles.lockoutBox}>
                            <p className={styles.lockoutTitle}>Account locked</p>
                            <p className={styles.lockoutText}>{lockoutInfo.message}</p>
                            {lockoutInfo.until && (
                                <p className={styles.lockoutText}>
                                    Time remaining:{' '}
                                    <CountdownTimer
                                        resetAt={new Date(lockoutInfo.until)}
                                        onExpire={handleLockoutExpire}
                                    />
                                </p>
                            )}
                        </div>
                    )}

                    {error && (
                        <div role="alert" className={styles.errorBanner}>
                            <span aria-hidden="true">!</span>
                            <span>{error}</span>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <div className={styles.field}>
                            <label htmlFor="email">Email or Username</label>
                            <div className={styles.inputWrap}>
                                <input
                                    autoComplete="username"
                                    autoFocus
                                    className={styles.input}
                                    disabled={submitting || !!lockoutInfo}
                                    id="email"
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    required
                                    type="email"
                                    value={email}
                                />
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="password">Password</label>
                            <div className={styles.inputWrap}>
                                <input
                                    autoComplete="current-password"
                                    className={`${styles.input} ${styles.inputWithSuffix}`}
                                    disabled={submitting || !!lockoutInfo}
                                    id="password"
                                    minLength={8}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter your password"
                                    required
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                />
                                <button
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    className={styles.suffixButton}
                                    onClick={() => setShowPassword((prev) => !prev)}
                                    type="button"
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        <div className={styles.formRow}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    checked={rememberMe}
                                    disabled={submitting || !!lockoutInfo}
                                    onChange={(event) => setRememberMe(event.target.checked)}
                                    type="checkbox"
                                />
                                Keep me logged in for 30 days
                            </label>
                            <Link className={styles.link} href="/forgot-password">
                                Forgot password?
                            </Link>
                        </div>

                        <button className={styles.btnPrimary} disabled={submitting || !!lockoutInfo} type="submit">
                            {submitting ? 'Signing in...' : 'Log in'}
                        </button>
                    </form>

                    <div className={styles.divider}>
                        <div className={styles.dividerLine} />
                        <span className={styles.dividerText}>Or continue with</span>
                        <div className={styles.dividerLine} />
                    </div>

                    <div className={styles.ssoStack}>
                        <button
                            className={styles.btnSso}
                            disabled={!!lockoutInfo}
                            onClick={() => handleOAuthLogin('google')}
                            type="button"
                        >
                            <span className={`${styles.ssoIcon} ${styles.googleIcon}`}>G</span>
                            Continue with Google
                        </button>
                        <button
                            className={styles.btnSsoDark}
                            disabled={!!lockoutInfo}
                            onClick={() => handleOAuthLogin('github')}
                            type="button"
                        >
                            <span className={`${styles.ssoIcon} ${styles.githubIcon}`}>GH</span>
                            Continue with GitHub
                        </button>
                    </div>

                    <p className={styles.footerText}>
                        Do not have an account? <Link className={styles.link} href="/register">Sign up</Link>
                    </p>
                </div>
            </section>

            <footer className={styles.footerBar}>2026 TalentForge . Privacy Policy . Terms of Service</footer>
        </main>
    );
}
