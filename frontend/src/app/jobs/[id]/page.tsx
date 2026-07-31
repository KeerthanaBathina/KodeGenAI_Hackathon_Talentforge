'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface RequisitionDetail {
    id: string;
    title: string;
    department: string;
    location: string;
    jobType: string;
    slots: number;
    filledSlots: number;
    eligibilityCriteria?: {
        minYearsExperience?: number;
    };
    description?: string;
    requiredSkills?: string[];
    preferredSkills?: string[];
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

function formatJobType(jobType: string): string {
    const labels: Record<string, string> = {
        full_time: 'Full-time',
        part_time: 'Part-time',
        contract: 'Contract',
        internship: 'Internship',
    };

    return labels[jobType] || jobType;
}

export default function JobDetailPage() {
    const params = useParams<{ id: string }>();
    const requisitionId = params.id;

    const [job, setJob] = useState<RequisitionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadRequisition() {
            try {
                const response = await fetch(getApiUrl(`/api/requisitions/${requisitionId}`), {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Unable to load job details');
                }

                const data = await response.json();
                setJob(data);
            } catch (err) {
                console.error('Error loading requisition detail:', err);
                setError('Unable to load job details right now.');
            } finally {
                setLoading(false);
            }
        }

        void loadRequisition();
    }, [requisitionId]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>Loading job details...</p>
            </div>
        );
    }

    if (error || !job) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', padding: '2rem' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem' }}>
                    <p style={{ color: '#b91c1c', marginBottom: '1rem' }}>{error || 'Job not found'}</p>
                    <Link href="/jobs" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                        Back to jobs
                    </Link>
                </div>
            </div>
        );
    }

    const slotsRemaining = Math.max(job.slots - job.filledSlots, 0);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <nav
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '64px',
                    padding: '0 24px',
                    backgroundColor: '#ffffff',
                    borderBottom: '1px solid #e2e8f0',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6366f1', fontWeight: 700, fontSize: '18px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#6366f1', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
                        TF
                    </div>
                    TalentForge
                </div>
                <Link href="/candidate/jobs" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 600 }}>
                    Browse Jobs
                </Link>
            </nav>

            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' }}>
                <p style={{ color: '#64748b', fontSize: '13px' }}>
                    <Link href="/jobs" style={{ color: '#6366f1', textDecoration: 'none' }}>Jobs</Link>
                    {' > '}
                    <span>{job.title}</span>
                </p>

                <section style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '10px', background: 'linear-gradient(135deg,#6366f1,#06b6d4)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginBottom: '10px' }}>
                        TF
                    </div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>{job.title}</h1>
                    <p style={{ color: '#64748b', marginBottom: '12px' }}>{job.department} · {job.location}</p>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <span style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#64748b' }}>{formatJobType(job.jobType)}</span>
                        <span style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#64748b' }}>{slotsRemaining} slots left</span>
                        {job.eligibilityCriteria?.minYearsExperience !== undefined && (
                            <span style={{ border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#64748b' }}>
                                {job.eligibilityCriteria.minYearsExperience}+ years exp.
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <Link href={`/jobs/${job.id}/apply`} style={{ backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: 600, fontSize: '14px' }}>
                            Apply Now
                        </Link>
                        <Link href="/jobs" style={{ border: '1px solid #e2e8f0', color: '#64748b', textDecoration: 'none', borderRadius: '10px', padding: '11px 18px', fontWeight: 600, fontSize: '14px' }}>
                            Back to List
                        </Link>
                    </div>
                </section>

                <section style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px' }}>
                    <h2 style={{ fontSize: '18px', color: '#0f172a', fontWeight: 700, marginBottom: '10px' }}>About this role</h2>
                    <p style={{ color: '#64748b', lineHeight: 1.7, marginBottom: '12px' }}>
                        {job.description || 'Join our team and contribute to high-impact product and engineering outcomes in a fast-paced hiring platform.'}
                    </p>

                    <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '8px' }}>Required skills</h3>
                    <ul style={{ paddingLeft: '18px', color: '#64748b', marginBottom: '12px' }}>
                        {(job.requiredSkills && job.requiredSkills.length > 0 ? job.requiredSkills : ['Communication', 'Problem solving', 'Role-relevant technical skills']).map((skill) => (
                            <li key={skill} style={{ marginBottom: '5px' }}>{skill}</li>
                        ))}
                    </ul>

                    <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 700, marginBottom: '8px' }}>Preferred skills</h3>
                    <ul style={{ paddingLeft: '18px', color: '#64748b' }}>
                        {(job.preferredSkills && job.preferredSkills.length > 0 ? job.preferredSkills : ['Collaboration', 'Adaptability', 'Ownership mindset']).map((skill) => (
                            <li key={skill} style={{ marginBottom: '5px' }}>{skill}</li>
                        ))}
                    </ul>
                </section>
            </div>
        </div>
    );
}