'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '@/lib/api/url';
import CandidateTopNav from '@/components/CandidateTopNav';

interface ProfilePayload {
    fullName?: string;
    experienceYears?: number;
    skills?: string[];
}

interface CompletionStatus {
    completedSections: string[];
    percentage: number;
    missingFields: string[];
}

interface CandidateApplication {
    id: string;
    requisitionId: string;
    status: string;
    submittedAt: string;
    aptitudeTestUrl?: string | null;
    hasCompletedAptitudeStep?: boolean;
    scheduledStage?: {
        type: 'aptitude' | 'coding' | 'technical' | 'hr' | string;
        scheduledAt: string | null;
        endAt: string | null;
        timezone: string;
    } | null;
    requisition: {
        id: string;
        title: string;
        department: string;
        location: string;
        jobType: string;
    };
}

interface Requisition {
    id: string;
    title: string;
    department: string;
    location: string;
    jobType: string;
    slots: number;
    filledSlots: number;
    requiredSkills?: string[];
    minExperienceYears?: number;
    eligibilityCriteria?: {
        minYearsExperience?: number;
    };
}

const COMPLETION_SECTION_LABELS: Record<string, string> = {
    basic_info: 'Contact details',
    skills: 'Skills',
    education: 'Education',
    work_history: 'Experience',
    privacy_consent: 'Privacy consent',
};

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

function getApplicationStatusLabel(application: CandidateApplication): string {
    const normalizedStatus = application.status.trim().toLowerCase().replace(/\s+/g, '_');

    if (
        !application.scheduledStage &&
        (normalizedStatus === 'queue_unavailable_dev' || normalizedStatus === 'queue_unavailable')
    ) {
        return 'Unknown Status';
    }

    return STATUS_LABELS[normalizedStatus] || application.status;
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

function formatStageLabel(stageType: string): string {
    const labels: Record<string, string> = {
        aptitude: 'aptitude test',
        coding: 'programming assessment',
        technical: 'technical interview',
        hr: 'HR round',
    };

    return labels[stageType] || stageType;
}

function normalizeSkill(skill: string): string {
    return skill.trim().toLowerCase();
}

interface RecommendationResult {
    score: number;
    overlapCount: number;
    overlapSkills: string[];
}

interface AiScorePayload {
    overallScorePercent?: number;
    source?: 'groq' | 'heuristic';
}

interface AiRecommendedJob {
    requisition: Requisition;
    score: number;
}

function getStatusBadgeStyle(status: string): { backgroundColor: string; color: string; border: string } {
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

export default function CandidateDashboardPage() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [candidateName, setCandidateName] = useState('Candidate');
    const [completion, setCompletion] = useState<CompletionStatus>({
        completedSections: [],
        percentage: 0,
        missingFields: [],
    });
    const [profileSkills, setProfileSkills] = useState<string[]>([]);
    const [experienceYears, setExperienceYears] = useState(0);
    const [activeApplications, setActiveApplications] = useState<CandidateApplication[]>([]);
    const [openRequisitions, setOpenRequisitions] = useState<Requisition[]>([]);
    const [recommendedJobs, setRecommendedJobs] = useState<AiRecommendedJob[]>([]);
    const [loadingRecommendations, setLoadingRecommendations] = useState(true);

    useEffect(() => {
        let isMounted = true;

        async function loadDashboardData() {
            setLoading(true);
            setError(null);

            try {
                const [profileResponse, completionResponse, activeApplicationsResponse, requisitionsResponse] =
                    await Promise.all([
                        fetch(buildApiUrl('/api/profile'), { credentials: 'include' }),
                        fetch(buildApiUrl('/api/profile/completion'), { credentials: 'include' }),
                        fetch(buildApiUrl('/api/applications/mine?scope=active&limit=6'), {
                            credentials: 'include',
                        }),
                        fetch(buildApiUrl('/api/requisitions?page=1&pageSize=50'), {
                            credentials: 'include',
                        }),
                    ]);

                if (
                    profileResponse.status === 401 ||
                    completionResponse.status === 401 ||
                    activeApplicationsResponse.status === 401
                ) {
                    router.replace('/login?next=/candidate/dashboard');
                    return;
                }

                if (profileResponse.ok) {
                    const profile: ProfilePayload = await profileResponse.json();

                    const firstName = profile.fullName?.trim().split(/\s+/)[0];
                    if (firstName && isMounted) {
                        setCandidateName(firstName);
                    }

                    if (Array.isArray(profile.skills) && isMounted) {
                        setProfileSkills(profile.skills);
                    }

                    if (typeof profile.experienceYears === 'number' && isMounted) {
                        setExperienceYears(profile.experienceYears);
                    }
                }

                if (completionResponse.ok) {
                    const completionData: CompletionStatus = await completionResponse.json();
                    if (isMounted) {
                        setCompletion({
                            completedSections: Array.isArray(completionData.completedSections)
                                ? completionData.completedSections
                                : [],
                            percentage:
                                typeof completionData.percentage === 'number'
                                    ? completionData.percentage
                                    : 0,
                            missingFields: Array.isArray(completionData.missingFields)
                                ? completionData.missingFields
                                : [],
                        });
                    }
                }

                if (activeApplicationsResponse.ok) {
                    const activeApplicationsData = await activeApplicationsResponse.json();
                    if (isMounted) {
                        setActiveApplications(
                            Array.isArray(activeApplicationsData.data)
                                ? activeApplicationsData.data
                                : []
                        );
                    }
                }

                if (!requisitionsResponse.ok) {
                    throw new Error('Unable to load open requisitions');
                }

                const requisitionsData = await requisitionsResponse.json();
                if (isMounted) {
                    setOpenRequisitions(
                        Array.isArray(requisitionsData.data) ? requisitionsData.data : []
                    );
                }
            } catch (err) {
                console.error('Error loading candidate dashboard:', err);
                if (isMounted) {
                    setError('Unable to load dashboard right now. Please refresh and try again.');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        void loadDashboardData();

        return () => {
            isMounted = false;
        };
    }, []);

    const activeRequisitionIds = useMemo(() => {
        return new Set(activeApplications.map((application) => application.requisitionId));
    }, [activeApplications]);

    useEffect(() => {
        let cancelled = false;

        async function loadAiMatchScores() {
            if (!cancelled) {
                setLoadingRecommendations(true);
            }

            const recommendationPool = openRequisitions.filter(
                (requisition) => !activeRequisitionIds.has(requisition.id)
            );

            if (recommendationPool.length === 0) {
                if (!cancelled) {
                    setRecommendedJobs([]);
                    setLoadingRecommendations(false);
                }
                return;
            }

            const entries = await Promise.all(
                recommendationPool.map(async (requisition) => {
                    try {
                        const response = await fetch(
                            buildApiUrl(`/api/applications/ai-score/${requisition.id}`),
                            { credentials: 'include' }
                        );

                        if (!response.ok) {
                            return null;
                        }

                        const payload: AiScorePayload = await response.json();
                        if (payload.source !== 'groq') {
                            return null;
                        }

                        const score = Number(payload.overallScorePercent);

                        if (!Number.isFinite(score)) {
                            return null;
                        }

                        return {
                            requisition,
                            score,
                        } satisfies AiRecommendedJob;
                    } catch {
                        return null;
                    }
                })
            );

            if (cancelled) {
                return;
            }

            const ranked = entries
                .filter((entry): entry is AiRecommendedJob => entry !== null)
                .sort((left, right) => right.score - left.score)
                .slice(0, 3);

            setRecommendedJobs(ranked);
            setLoadingRecommendations(false);
        }

        void loadAiMatchScores();

        return () => {
            cancelled = true;
        };
    }, [activeRequisitionIds, openRequisitions]);

    const completedSectionLabels = completion.completedSections
        .map((section) => COMPLETION_SECTION_LABELS[section] || section)
        .filter((label) => Boolean(label));

    const hasPrivacyConsentTodo = completion.missingFields.some((field) =>
        field.toLowerCase().includes('privacy consent')
    );

    const hasOutstandingProfileTodos = completion.missingFields
        .filter((field) => field !== 'Profile not created')
        .length > 0;

    const isProfileComplete = completion.percentage >= 100 && !hasOutstandingProfileTodos;

    const missingSectionLabels = completion.missingFields
        .filter((field) => field !== 'Profile not created')
        .map((field) =>
            field.toLowerCase().includes('privacy consent')
                ? 'Privacy consent (required for 100%)'
                : field
        )
        .slice(0, 4);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
            <CandidateTopNav active="dashboard" />

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                    <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                        Good day, {candidateName}
                    </h1>
                    <p style={{ color: '#64748b' }}>
                        Track your applications and discover jobs matching your profile.
                    </p>
                </div>

                <section
                    style={{
                        background: 'linear-gradient(135deg, #eef2ff, #e0f2fe)',
                        border: '1px solid #c7d2fe',
                        borderRadius: '16px',
                        padding: '20px',
                        marginBottom: '24px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '16px',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ minWidth: '280px', flex: 1 }}>
                        <h2 style={{ fontSize: '18px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>
                            Complete your profile to stand out
                        </h2>
                        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '12px' }}>
                            A complete profile improves your interview shortlisting chances.
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ width: '240px', maxWidth: '100%', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                                <div style={{ width: `${completion.percentage}%`, backgroundColor: '#6366f1', height: '100%' }} />
                            </div>
                            <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '13px' }}>
                                {completion.percentage}%
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {completedSectionLabels.map((label) => (
                                <span key={label} style={{ fontSize: '12px', border: '1px solid #6ee7b7', color: '#10b981', borderRadius: '999px', padding: '4px 10px', backgroundColor: '#d1fae5' }}>
                                    Done: {label}
                                </span>
                            ))}
                            {missingSectionLabels.map((field) => (
                                <span key={field} style={{ fontSize: '12px', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '999px', padding: '4px 10px', backgroundColor: '#ffffff' }}>
                                    Todo: {field}
                                </span>
                            ))}
                        </div>

                        {hasPrivacyConsentTodo && (
                            <p style={{ marginTop: '10px', marginBottom: 0, color: '#9a3412', fontSize: '13px' }}>
                                Why 80%? Profile completion has 5 sections worth 20% each, and privacy consent is one of them.
                            </p>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <Link
                            href="/profile"
                            style={{
                                backgroundColor: isProfileComplete ? '#0f766e' : '#6366f1',
                                color: '#ffffff',
                                padding: '10px 18px',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: 600,
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {isProfileComplete ? 'View Profile' : 'Complete Profile'}
                        </Link>

                        {hasPrivacyConsentTodo && (
                            <Link
                                href="/consent?returnTo=/candidate/dashboard"
                                style={{
                                    backgroundColor: '#ffffff',
                                    color: '#334155',
                                    border: '1px solid #cbd5e1',
                                    padding: '10px 18px',
                                    borderRadius: '8px',
                                    textDecoration: 'none',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'center',
                                }}
                            >
                                Accept Privacy Consent
                            </Link>
                        )}
                    </div>
                </section>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Active Applications</h2>
                    <Link href="/applications" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                        View all
                    </Link>
                </div>

                {loading ? (
                    <div style={{ color: '#64748b', marginBottom: '28px' }}>Loading dashboard data...</div>
                ) : error ? (
                    <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '28px' }}>
                        {error}
                    </div>
                ) : activeApplications.length === 0 ? (
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', marginBottom: '28px' }}>
                        <p style={{ color: '#64748b', marginBottom: '10px' }}>You have no active applications yet.</p>
                        <Link href="/jobs" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                            Browse open positions
                        </Link>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                        {activeApplications.map((application) => {
                            const statusBadge = getStatusBadgeStyle(application.status);
                            const candidateStepMessage = application.scheduledStage
                                ? `Check your email. Your ${formatStageLabel(application.scheduledStage.type)} got scheduled.`
                                : application.aptitudeTestUrl
                                  ? 'Check your email. Your aptitude test got scheduled.'
                                  : application.hasCompletedAptitudeStep
                                    ? 'Your aptitude test is completed. Wait for further communication.'
                                    : null;

                            return (
                                <article key={application.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                                        <div>
                                            <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>
                                                {application.requisition.title}
                                            </h3>
                                            <p style={{ color: '#64748b', fontSize: '13px' }}>
                                                {application.requisition.department} · {application.requisition.location}
                                            </p>
                                        </div>
                                        <span style={{ borderRadius: '6px', padding: '4px 8px', fontSize: '12px', fontWeight: 600, height: 'fit-content', ...statusBadge }}>
                                            {getApplicationStatusLabel(application)}
                                        </span>
                                    </div>

                                    <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>
                                        Applied on {new Date(application.submittedAt).toLocaleDateString()}
                                    </p>

                                    {candidateStepMessage ? (
                                        <p style={{ color: '#0f766e', fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>
                                            {candidateStepMessage}
                                        </p>
                                    ) : null}

                                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                                        <Link href={`/applications/track/${application.id}`} style={{ backgroundColor: '#3b82f6', color: '#ffffff', textDecoration: 'none', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                            Track Application
                                        </Link>
                                        <Link href={`/jobs/${application.requisitionId}`} style={{ border: '1px solid #e2e8f0', color: '#64748b', textDecoration: 'none', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                            View Job
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Recommended Jobs</h2>
                    <Link href="/jobs" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                        Browse all jobs
                    </Link>
                </div>

                {recommendedJobs.length === 0 ? (
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                        <p style={{ color: '#64748b' }}>
                            {loadingRecommendations
                                ? 'Loading match recommendations...'
                                : 'No match recommendations available yet. Upload a parsed resume and check again.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
                        {recommendedJobs.map(({ requisition, score }) => {
                            const minYearsExperience =
                                requisition.minExperienceYears ??
                                requisition.eligibilityCriteria?.minYearsExperience ??
                                0;

                            return (
                                <article key={requisition.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                                    <h3 style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '6px' }}>
                                        {requisition.title}
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>
                                        {requisition.department} · {requisition.location} · {formatJobType(requisition.jobType)}
                                    </p>
                                    <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>
                                        {minYearsExperience}+ years experience
                                    </p>
                                    <p style={{ color: '#06b6d4', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>
                                        Match {score}%
                                    </p>
                                    <Link href={`/jobs/${requisition.id}/apply`} style={{ display: 'block', textAlign: 'center', backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontWeight: 600 }}>
                                        Apply Now
                                    </Link>
                                </article>
                            );
                        })}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
