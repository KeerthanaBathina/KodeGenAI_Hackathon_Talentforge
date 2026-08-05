'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildApiUrl } from '@/lib/api/url';
import CandidateTopNav from '@/components/CandidateTopNav';

interface CandidateApplication {
    id: string;
    requisitionId: string;
    status: string;
    submittedAt: string;
    draftSavedAt?: string | null;
    requisition: {
        id: string;
        title: string;
        department: string;
        location: string;
        jobType: string;
    };
}

const STATUS_LABELS: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    screening: 'Screening',
    pending_review: 'Under Review',
    shortlisted: 'Shortlisted',
    interviewing: 'Interviewing',
    offer_pending: 'Offer Pending',
    offered: 'Offer Extended',
    rejected: 'Not Selected',
    withdrawn: 'Withdrawn',
};

function formatJobType(jobType: string): string {
    const labels: Record<string, string> = {
        full_time: 'Full-time',
        part_time: 'Part-time',
        contract: 'Contract',
        internship: 'Internship',
    };

    return labels[jobType] || jobType;
}

function getStatusBadgeStyle(status: string): { backgroundColor: string; color: string; border: string } {
    if (status === 'draft') {
        return {
            backgroundColor: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fcd34d',
        };
    }

    if (status === 'submitted' || status === 'screening') {
        return {
            backgroundColor: '#dbeafe',
            color: '#1d4ed8',
            border: '1px solid #93c5fd',
        };
    }

    if (status === 'pending_review' || status === 'shortlisted' || status === 'interviewing') {
        return {
            backgroundColor: '#e0f2fe',
            color: '#0c4a6e',
            border: '1px solid #7dd3fc',
        };
    }

    if (status === 'offered' || status === 'offer_pending') {
        return {
            backgroundColor: '#dcfce7',
            color: '#166534',
            border: '1px solid #86efac',
        };
    }

    if (status === 'rejected' || status === 'withdrawn') {
        return {
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
        };
    }

    return {
        backgroundColor: '#f1f5f9',
        color: '#334155',
        border: '1px solid #cbd5e1',
    };
}

export default function ApplicationsPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [applications, setApplications] = useState<CandidateApplication[]>([]);

    useEffect(() => {
        let isMounted = true;

        async function loadApplications() {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch(
                    buildApiUrl('/api/applications/mine?scope=all&limit=100'),
                    { credentials: 'include' }
                );

                if (response.status === 401) {
                    router.replace('/login?next=/applications');
                    return;
                }

                if (!response.ok) {
                    throw new Error('Unable to load applications');
                }

                const data = await response.json();
                if (isMounted) {
                    setApplications(Array.isArray(data.data) ? data.data : []);
                }
            } catch (err) {
                console.error('Error loading applications:', err);
                if (isMounted) {
                    setError('Unable to load your applications right now.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        void loadApplications();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <CandidateTopNav active="applications" />

            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px' }}>
                <div style={{ marginBottom: '18px' }}>
                    <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        My Applications
                    </h1>
                    <p style={{ color: '#64748b' }}>
                        Review the latest status of all your submitted and draft applications.
                    </p>
                </div>

                {loading && <p style={{ color: '#64748b' }}>Loading applications...</p>}

                {error && (
                    <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

                {!loading && !error && applications.length === 0 && (
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px' }}>
                        <p style={{ color: '#64748b', marginBottom: '10px' }}>
                            No applications yet. Start by browsing open roles.
                        </p>
                        <Link href="/jobs" style={{ color: '#6366f1', fontWeight: 600, textDecoration: 'none' }}>
                            Browse Jobs
                        </Link>
                    </div>
                )}

                {!loading && !error && applications.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px' }}>
                        {applications.map((application) => {
                            const statusBadge = getStatusBadgeStyle(application.status);

                            const isDraft = application.status === 'draft';
                            const primaryHref = isDraft
                                ? `/jobs/${application.requisitionId}/apply`
                                : `/applications/track/${application.id}`;

                            return (
                                <article key={application.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                                        <div>
                                            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                                                {application.requisition.title}
                                            </h2>
                                            <p style={{ color: '#64748b', fontSize: '13px' }}>
                                                {application.requisition.department} · {application.requisition.location} · {formatJobType(application.requisition.jobType)}
                                            </p>
                                        </div>
                                        <span style={{ borderRadius: '6px', padding: '4px 8px', fontSize: '12px', fontWeight: 600, ...statusBadge }}>
                                            {STATUS_LABELS[application.status] || application.status}
                                        </span>
                                    </div>

                                    <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>
                                        {isDraft
                                            ? `Last draft save: ${application.draftSavedAt ? new Date(application.draftSavedAt).toLocaleString() : 'Not available'}`
                                            : `Submitted on ${new Date(application.submittedAt).toLocaleDateString()}`}
                                    </p>

                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <Link href={primaryHref} style={{ backgroundColor: '#3b82f6', color: '#ffffff', textDecoration: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                            {isDraft ? 'Continue Draft' : 'Track Application'}
                                        </Link>
                                        <Link href={`/jobs/${application.requisitionId}`} style={{ border: '1px solid #e2e8f0', color: '#64748b', textDecoration: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                            View Job
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
