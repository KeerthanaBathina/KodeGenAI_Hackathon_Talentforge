'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
    requisitionId: string;
}

type ApplicationStatus =
    | 'submitted'
    | 'screening'
    | 'pending_review'
    | 'interviewing'
    | 'offered'
    | 'rejected'
    | 'withdrawn';

interface StatusStage {
    key: ApplicationStatus;
    label: string;
    description: string;
}

const statusStages: StatusStage[] = [
    { key: 'submitted', label: 'Submitted', description: 'Application received' },
    { key: 'screening', label: 'Screening', description: 'Initial review in progress' },
    { key: 'pending_review', label: 'Under Review', description: 'Being evaluated by hiring team' },
    { key: 'interviewing', label: 'Interviewing', description: 'Interview scheduled or completed' },
    { key: 'offered', label: 'Offer Extended', description: 'Congratulations! An offer has been made' },
];

export default function ApplicationTrackingPage() {
    const params = useParams();
    const router = useRouter();
    const applicationId = params.id as string;

    const [application, setApplication] = useState<Application | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [withdrawalError, setWithdrawalError] = useState<string>('');

    useEffect(() => {
        async function loadApplication() {
            try {
                const response = await fetch(getApiUrl(`/api/applications/${applicationId}`), {
                    credentials: 'include',
                });

                if (response.status === 404) {
                    setError('Application not found');
                    setIsLoading(false);
                    return;
                }

                if (response.status === 403) {
                    setError('You are not authorized to view this application');
                    setIsLoading(false);
                    return;
                }

                if (!response.ok) {
                    setError('Failed to load application');
                    setIsLoading(false);
                    return;
                }

                const data: Application = await response.json();
                setApplication(data);
            } catch (err) {
                console.error('Error loading application:', err);
                setError('An error occurred while loading the application');
            } finally {
                setIsLoading(false);
            }
        }

        loadApplication();
    }, [applicationId]);

    const handleWithdrawClick = () => {
        setWithdrawalDialogOpen(true);
        setWithdrawalError('');
    };

    const handleConfirmWithdrawal = async () => {
        setIsWithdrawing(true);
        setWithdrawalError('');

        try {
            const response = await fetch(getApiUrl(`/api/applications/${applicationId}/withdraw`), {
                method: 'PATCH',
                credentials: 'include',
            });

            if (response.status === 409) {
                const data = await response.json();
                setWithdrawalError(data.error.message || 'Cannot withdraw this application');
                setIsWithdrawing(false);
                return;
            }

            if (!response.ok) {
                const data = await response.json();
                setWithdrawalError(data.error?.message || 'Failed to withdraw application');
                setIsWithdrawing(false);
                return;
            }

            // Refresh application data
            const refreshResponse = await fetch(getApiUrl(`/api/applications/${applicationId}`), {
                credentials: 'include',
            });

            if (refreshResponse.ok) {
                const updatedApp: Application = await refreshResponse.json();
                setApplication(updatedApp);
            }

            setWithdrawalDialogOpen(false);
        } catch (err) {
            console.error('Error withdrawing application:', err);
            setWithdrawalError('An error occurred while withdrawing the application');
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleCancelWithdrawal = () => {
        setWithdrawalDialogOpen(false);
        setWithdrawalError('');
    };

    if (isLoading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>Loading application...</p>
            </div>
        );
    }

    if (error || !application) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444', marginBottom: '1rem' }}>
                        {error || 'Application not found'}
                    </h1>
                    <Link
                        href="/jobs"
                        style={{
                            color: '#3b82f6',
                            textDecoration: 'underline',
                        }}
                    >
                        Return to Jobs
                    </Link>
                </div>
            </div>
        );
    }

    const currentStatus = application.status as ApplicationStatus;
    const referenceId = application.id.toUpperCase().slice(0, 8);
    const canWithdraw = currentStatus === 'submitted';

    // Calculate current stage index
    const currentStageIndex = statusStages.findIndex((stage) => stage.key === currentStatus);
    const isWithdrawn = currentStatus === 'withdrawn';
    const isRejected = currentStatus === 'rejected';

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Header */}
                <div
                    style={{
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        padding: '2rem',
                        marginBottom: '2rem',
                    }}
                >
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#111827', marginBottom: '1rem' }}>
                        Track Your Application
                    </h1>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div>
                            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Reference ID</p>
                            <p
                                style={{
                                    fontSize: '1.25rem',
                                    fontWeight: '700',
                                    fontFamily: 'monospace',
                                    color: '#111827',
                                    letterSpacing: '0.1em',
                                }}
                            >
                                {referenceId}
                            </p>
                        </div>
                        <div>
                            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>Submitted</p>
                            <p style={{ fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                                {new Date(application.submittedAt).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Withdrawn/Rejected Status */}
                {isWithdrawn && (
                    <div
                        style={{
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fbbf24',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '2rem',
                        }}
                    >
                        <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#92400e', marginBottom: '0.5rem' }}>
                            Application Withdrawn
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#78350f' }}>
                            You withdrew this application. You may apply again after the cooling period.
                        </p>
                    </div>
                )}

                {isRejected && (
                    <div
                        style={{
                            backgroundColor: '#fee2e2',
                            border: '1px solid #f87171',
                            borderRadius: '8px',
                            padding: '1rem',
                            marginBottom: '2rem',
                        }}
                    >
                        <p style={{ fontSize: '1.125rem', fontWeight: '600', color: '#991b1b', marginBottom: '0.5rem' }}>
                            Application Not Selected
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
                            Thank you for your interest. We encourage you to apply for other positions.
                        </p>
                    </div>
                )}

                {/* Status Timeline */}
                {!isWithdrawn && !isRejected && (
                    <div
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            padding: '2rem',
                            marginBottom: '2rem',
                        }}
                    >
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '2rem' }}>
                            Application Status
                        </h2>

                        {/* Timeline */}
                        <div style={{ position: 'relative' }}>
                            {statusStages.map((stage, index) => {
                                const isCompleted = index <= currentStageIndex;
                                const isCurrent = index === currentStageIndex;

                                return (
                                    <div key={stage.key} style={{ position: 'relative', paddingLeft: '3rem', paddingBottom: '2rem' }}>
                                        {/* Connector Line */}
                                        {index < statusStages.length - 1 && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    left: '1rem',
                                                    top: '2rem',
                                                    width: '2px',
                                                    height: '100%',
                                                    backgroundColor: isCompleted ? '#3b82f6' : '#e5e7eb',
                                                }}
                                            />
                                        )}

                                        {/* Circle Indicator */}
                                        <div
                                            style={{
                                                position: 'absolute',
                                                left: '0',
                                                top: '0',
                                                width: '2rem',
                                                height: '2rem',
                                                borderRadius: '50%',
                                                backgroundColor: isCompleted ? '#3b82f6' : '#e5e7eb',
                                                border: isCurrent ? '3px solid #1d4ed8' : 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            {isCompleted && (
                                                <span style={{ color: 'white', fontSize: '1rem', fontWeight: 'bold' }}>✓</span>
                                            )}
                                        </div>

                                        {/* Stage Info */}
                                        <div>
                                            <p
                                                style={{
                                                    fontSize: '1.125rem',
                                                    fontWeight: isCurrent ? 'bold' : '600',
                                                    color: isCompleted ? '#111827' : '#6b7280',
                                                    marginBottom: '0.25rem',
                                                }}
                                            >
                                                {stage.label}
                                            </p>
                                            <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{stage.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Withdrawal Section */}
                {canWithdraw && !withdrawalDialogOpen && (
                    <div
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            padding: '2rem',
                            marginBottom: '2rem',
                        }}
                    >
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#111827', marginBottom: '1rem' }}>
                            Withdraw Application
                        </h2>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                            You can withdraw your application before it enters the review process. Once withdrawn, you'll need to wait
                            90 days before reapplying to this position.
                        </p>
                        <button
                            onClick={handleWithdrawClick}
                            style={{
                                padding: '0.75rem 1.5rem',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontWeight: '500',
                                cursor: 'pointer',
                            }}
                            data-testid="withdraw-button"
                        >
                            Withdraw Application
                        </button>
                    </div>
                )}

                {/* Blocking Message for Non-Withdrawable Statuses */}
                {!canWithdraw && !isWithdrawn && !isRejected && (
                    <div
                        style={{
                            backgroundColor: '#f3f4f6',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            padding: '1.5rem',
                            marginBottom: '2rem',
                        }}
                    >
                        <p style={{ fontSize: '1rem', fontWeight: '600', color: '#4b5563', marginBottom: '0.5rem' }}>
                            Withdrawal Not Available
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            Your application has progressed beyond the submission stage and cannot be withdrawn at this time.
                        </p>
                    </div>
                )}

                {/* Withdrawal Confirmation Dialog */}
                {withdrawalDialogOpen && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                        }}
                    >
                        <div
                            style={{
                                backgroundColor: 'white',
                                borderRadius: '8px',
                                padding: '2rem',
                                maxWidth: '500px',
                                width: '90%',
                            }}
                        >
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '1rem' }}>
                                Confirm Withdrawal
                            </h2>
                            <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                                Are you sure you want to withdraw your application? This action cannot be undone, and you'll need to wait
                                90 days before reapplying to this position.
                            </p>

                            {withdrawalError && (
                                <div
                                    style={{
                                        backgroundColor: '#fee2e2',
                                        border: '1px solid #f87171',
                                        borderRadius: '6px',
                                        padding: '0.75rem',
                                        marginBottom: '1rem',
                                    }}
                                >
                                    <p style={{ fontSize: '0.875rem', color: '#991b1b' }}>{withdrawalError}</p>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={handleCancelWithdrawal}
                                    disabled={isWithdrawing}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: 'white',
                                        color: '#374151',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        fontWeight: '500',
                                        cursor: isWithdrawing ? 'not-allowed' : 'pointer',
                                    }}
                                    data-testid="cancel-withdrawal-button"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmWithdrawal}
                                    disabled={isWithdrawing}
                                    style={{
                                        padding: '0.75rem 1.5rem',
                                        backgroundColor: '#ef4444',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontWeight: '500',
                                        cursor: isWithdrawing ? 'not-allowed' : 'pointer',
                                        opacity: isWithdrawing ? 0.5 : 1,
                                    }}
                                    data-testid="confirm-withdrawal-button"
                                >
                                    {isWithdrawing ? 'Withdrawing...' : 'Confirm Withdrawal'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Back Link */}
                <div style={{ textAlign: 'center' }}>
                    <Link
                        href="/jobs"
                        style={{
                            color: '#3b82f6',
                            textDecoration: 'underline',
                            fontSize: '1rem',
                        }}
                    >
                        ← Back to Jobs
                    </Link>
                </div>
            </div>
        </div>
    );
}
