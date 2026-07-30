'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
}

interface Application {
    id: string;
    status: string;
    submittedAt: string;
}

interface Requisition {
    id: string;
    title: string;
}

export default function ApplicationSuccessPage() {
    const router = useRouter();
    const params = useParams();
    const requisitionId = params.id as string;
    const [jobTitle, setJobTitle] = useState<string>('');
    const [applicationId, setApplicationId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function loadApplicationData() {
            try {
                // Load requisition details
                const reqResponse = await fetch(getApiUrl(`/api/requisitions/${requisitionId}`), {
                    credentials: 'include',
                });

                if (reqResponse.ok) {
                    const requisition: Requisition = await reqResponse.json();
                    setJobTitle(requisition.title);
                }

                // Load submitted application to get application ID
                const appResponse = await fetch(
                    getApiUrl(`/api/applications/by-requisition/${requisitionId}`),
                    {
                        credentials: 'include',
                    }
                );

                if (appResponse.ok) {
                    const application: Application = await appResponse.json();
                    setApplicationId(application.id);
                }
            } catch (error) {
                console.error('Error loading application data:', error);
            } finally {
                setIsLoading(false);
            }
        }

        loadApplicationData();
    }, [requisitionId]);

    if (isLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>Loading...</p>
            </div>
        );
    }

    const referenceId = applicationId.toUpperCase().slice(0, 8);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ maxWidth: '600px', textAlign: 'center', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '3rem' }}>
                {/* Success Icon */}
                <div
                    style={{
                        width: '4rem',
                        height: '4rem',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                        margin: '0 auto 1.5rem',
                    }}
                >
                    ✓
                </div>

                {/* Heading */}
                <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', color: '#111827' }}>
                    Application Submitted Successfully
                </h1>

                {/* Message */}
                <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Your application for{' '}
                    <span style={{ fontWeight: '600', color: '#111827' }}>
                        {jobTitle || 'this position'}
                    </span>{' '}
                    has been submitted.
                </p>

                {/* Reference ID */}
                {applicationId && (
                    <div
                        style={{
                            margin: '1.5rem 0',
                            padding: '1rem',
                            backgroundColor: '#f3f4f6',
                            borderRadius: '6px',
                        }}
                    >
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                            Reference ID
                        </p>
                        <p
                            style={{
                                fontSize: '1.5rem',
                                fontWeight: '700',
                                fontFamily: 'monospace',
                                color: '#111827',
                                letterSpacing: '0.1em',
                            }}
                        >
                            {referenceId}
                        </p>
                    </div>
                )}

                {/* Email Confirmation Notice */}
                <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '2rem' }}>
                    📧 A confirmation email has been sent to your inbox with tracking details.
                </p>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {applicationId && (
                        <Link
                            href={`/applications/track/${applicationId}`}
                            style={{
                                padding: '0.75rem 1.5rem',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontWeight: '500',
                                display: 'inline-block',
                            }}
                            data-testid="track-application-button"
                        >
                            Track My Application
                        </Link>
                    )}
                    <Link
                        href="/jobs"
                        style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: 'white',
                            color: '#3b82f6',
                            border: '1px solid #3b82f6',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            fontWeight: '500',
                            display: 'inline-block',
                        }}
                    >
                        Browse More Jobs
                    </Link>
                </div>
            </div>
        </div>
    );
}
