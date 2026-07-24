'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
}

export default function ConsentPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [hasConsent, setHasConsent] = useState(false);
    const [consentData, setConsentData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function checkConsent() {
            try {
                const response = await fetch(getApiUrl('/api/consent'), {
                    credentials: 'include',
                });

                if (response.ok) {
                    const data = await response.json();
                    setHasConsent(true);
                    setConsentData(data);
                } else if (response.status === 404) {
                    setHasConsent(false);
                }
            } catch (err) {
                console.error('Error checking consent:', err);
            } finally {
                setLoading(false);
            }
        }

        checkConsent();
    }, []);

    async function handleAccept() {
        setSubmitting(true);
        setError(null);

        try {
            const response = await fetch(getApiUrl('/api/consent/accept'), {
                method: 'POST',
                credentials: 'include',
            });

            if (!response.ok) {
                throw new Error('Failed to record consent');
            }

            const data = await response.json();
            setHasConsent(true);
            setConsentData(data);

            setTimeout(() => router.push('/profile'), 2000);
        } catch (err) {
            console.error('Error accepting consent:', err);
            setError('Unable to record consent. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb' }}>Loading...</div>;
    }

    if (hasConsent) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ width: '64px', height: '64px', margin: '0 auto 1rem', backgroundColor: '#d1fae5', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg style={{ width: '32px', height: '32px', color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Privacy Consent Accepted</h1>
                        <p style={{ color: '#6b7280' }}>You accepted the privacy policy on {new Date(consentData.acceptedAt).toLocaleDateString()}</p>
                    </div>

                    <div style={{ backgroundColor: '#f9fafb', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
                        <p style={{ margin: 0 }}><strong>Policy Version:</strong> {consentData.policyVersion}</p>
                        <p style={{ margin: '0.5rem 0 0' }}><strong>Accepted At:</strong> {new Date(consentData.acceptedAt).toLocaleString()}</p>
                    </div>

                    <button
                        onClick={() => router.push('/profile')}
                        style={{ width: '100%', padding: '0.75rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                        Continue to Profile
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '2rem' }}>
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>Privacy Policy</h1>

                {/* Policy Content */}
                <div style={{ maxHeight: '400px', overflowY: 'auto', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px', marginBottom: '2rem', fontSize: '0.875rem', lineHeight: '1.6' }}>
                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>Data Collection and Usage</h2>
                    <p>We collect and process your personal information (name, email, work history, skills, education) to:</p>
                    <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>Match you with relevant job opportunities</li>
                        <li>Improve our AI-powered screening algorithms</li>
                        <li>Communicate with you about applications and interviews</li>
                        <li>Provide personalized job recommendations</li>
                    </ul>

                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginTop: '1rem', marginBottom: '0.75rem' }}>Your Rights</h2>
                    <p>You have the right to:</p>
                    <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
                        <li>Access your data at any time</li>
                        <li>Request corrections to your information</li>
                        <li>Delete your account and all associated data</li>
                        <li>Revoke this consent (note: this may prevent you from applying)</li>
                        <li>Export your data in a portable format</li>
                    </ul>

                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginTop: '1rem', marginBottom: '0.75rem' }}>Data Retention</h2>
                    <p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion at any time by contacting support or using the account deletion feature.</p>

                    <h2 style={{ fontSize: '1.125rem', fontWeight: '600', marginTop: '1rem', marginBottom: '0.75rem' }}>Data Security</h2>
                    <p>We implement industry-standard security measures to protect your data, including encryption at rest and in transit, regular security audits, and access controls.</p>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: '#c00' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => router.push('/profile')}
                        disabled={submitting}
                        style={{ flex: 1, padding: '0.75rem', backgroundColor: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '1rem', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}
                    >
                        Decline
                    </button>
                    <button
                        onClick={handleAccept}
                        disabled={submitting}
                        style={{ flex: 1, padding: '0.75rem', backgroundColor: submitting ? '#9ca3af' : '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: '600', cursor: submitting ? 'not-allowed' : 'pointer' }}
                    >
                        {submitting ? 'Recording...' : 'I Accept'}
                    </button>
                </div>
            </div>
        </div>
    );
}
