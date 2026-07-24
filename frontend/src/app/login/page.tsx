'use client';

import React from 'react';
import { FormEvent, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OAuthButton } from '../../components/OAuthButton';
import { CountdownTimer } from '../../components/CountdownTimer';

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
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        setLockoutInfo(null);

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
            const response = await fetch(getApiUrl('/api/auth/login'), {
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

            // Success - redirect to appropriate dashboard
            const redirectTo = body.data?.redirectTo || '/dashboard';
            router.push(redirectTo);
        } catch (err) {
            console.error('Login error:', err);
            setError('Unable to connect to server. Please try again.');
            setSubmitting(false);
        }
    }

    function handleOAuthLogin(provider: 'google' | 'github') {
        // Redirect to OAuth endpoint
        window.location.href = getApiUrl(`/api/auth/oauth/${provider}`);
    }

    function handleLockoutExpire() {
        setLockoutInfo(null);
        localStorage.removeItem('account_locked_until');
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            padding: '1rem',
        }}>
            <div style={{
                width: '100%',
                maxWidth: '400px',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: '2rem',
            }}>
                <h1 style={{
                    fontSize: '1.875rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '1.5rem',
                    color: '#111827',
                }}>
                    Sign In
                </h1>

                {/* Account Lockout Warning */}
                {lockoutInfo && (
                    <div
                        role="alert"
                        style={{
                            backgroundColor: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '6px',
                            padding: '1rem',
                            marginBottom: '1.5rem',
                        }}
                    >
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
                        }}>
                            <svg
                                style={{ width: '20px', height: '20px', color: '#dc2626', flexShrink: 0 }}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                    clipRule="evenodd"
                                />
                            </svg>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
                                    Account Locked
                                </p>
                                <p style={{ fontSize: '0.875rem', color: '#991b1b', marginBottom: '0.75rem' }}>
                                    {lockoutInfo.message}
                                </p>
                                {lockoutInfo.until && (
                                    <div style={{ fontSize: '0.875rem', color: '#991b1b' }}>
                                        <strong>Time remaining:</strong>{' '}
                                        <CountdownTimer
                                            targetDate={new Date(lockoutInfo.until)}
                                            onExpire={handleLockoutExpire}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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

                {/* Email/Password Form */}
                <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
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
                            Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={submitting || !!lockoutInfo}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '1rem',
                                backgroundColor: (submitting || lockoutInfo) ? '#f3f4f6' : 'white',
                            }}
                            placeholder="you@example.com"
                        />
                    </div>

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
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={submitting || !!lockoutInfo}
                            minLength={8}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '1rem',
                                backgroundColor: (submitting || lockoutInfo) ? '#f3f4f6' : 'white',
                            }}
                            placeholder="••••••••"
                        />
                    </div>

                    <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
                        <Link
                            href="/forgot-password"
                            style={{
                                fontSize: '0.875rem',
                                color: '#2563eb',
                                textDecoration: 'none',
                                fontWeight: '500',
                            }}
                        >
                            Forgot password?
                        </Link>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || !!lockoutInfo}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: (submitting || lockoutInfo) ? '#9ca3af' : '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: (submitting || lockoutInfo) ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {submitting ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>

                {/* Divider */}
                <div style={{
                    position: 'relative',
                    marginBottom: '1.5rem',
                    textAlign: 'center',
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: 0,
                        right: 0,
                        height: '1px',
                        backgroundColor: '#e5e7eb',
                    }} />
                    <span style={{
                        position: 'relative',
                        backgroundColor: 'white',
                        padding: '0 0.75rem',
                        fontSize: '0.875rem',
                        color: '#6b7280',
                    }}>
                        Or continue with
                    </span>
                </div>

                {/* OAuth Buttons */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    marginBottom: '1.5rem',
                }}>
                    <OAuthButton
                        provider="google"
                        onClick={() => handleOAuthLogin('google')}
                        disabled={!!lockoutInfo}
                    />
                    <OAuthButton
                        provider="github"
                        onClick={() => handleOAuthLogin('github')}
                        disabled={!!lockoutInfo}
                    />
                </div>

                {/* Register Link */}
                <div style={{
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    color: '#6b7280',
                }}>
                    Don't have an account?{' '}
                    <Link
                        href="/register"
                        style={{
                            color: '#2563eb',
                            fontWeight: '600',
                            textDecoration: 'none',
                        }}
                    >
                        Sign up
                    </Link>
                </div>
            </div>
        </div>
    );
}
