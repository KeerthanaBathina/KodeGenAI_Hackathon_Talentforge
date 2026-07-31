'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Requisition {
    id: string;
    title: string;
    department: string;
    location: string;
    jobType: string;
    slots: number;
    filledSlots: number;
    eligibilityCriteria: {
        minYearsExperience?: number;
    };
}

interface FilterOptions {
    departments: string[];
    locations: string[];
    jobTypes: string[];
}

interface PaginationMeta {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

interface ShowcasePosition {
    title: string;
    department: string;
    location: string;
    jobType: string;
    experienceLabel: string;
    status: 'open' | 'closing_soon' | 'new';
}

const SHOWCASE_POSITIONS: ShowcasePosition[] = [
    {
        title: 'Junior QA Engineer',
        department: 'Engineering',
        location: 'Chennai',
        jobType: 'full_time',
        experienceLabel: 'Entry Level (0-1 years)',
        status: 'new',
    },
    {
        title: 'DevOps Platform Engineer',
        department: 'Infrastructure',
        location: 'Pune',
        jobType: 'contract',
        experienceLabel: 'Mid Level (3-5 years)',
        status: 'open',
    },
    {
        title: 'Principal Data Scientist',
        department: 'Analytics',
        location: 'Remote',
        jobType: 'full_time',
        experienceLabel: 'Senior (8+ years)',
        status: 'closing_soon',
    },
    {
        title: 'UX Research Intern',
        department: 'Design',
        location: 'Bengaluru',
        jobType: 'internship',
        experienceLabel: 'Internship (students/freshers)',
        status: 'new',
    },
    {
        title: 'Product Operations Specialist',
        department: 'Product',
        location: 'Hyderabad',
        jobType: 'part_time',
        experienceLabel: 'Mid Level (2-4 years)',
        status: 'open',
    },
    {
        title: 'Cybersecurity Analyst',
        department: 'Security',
        location: 'Mumbai',
        jobType: 'full_time',
        experienceLabel: 'Senior (5-7 years)',
        status: 'open',
    },
];

function getApiUrl(pathname: string, params?: URLSearchParams): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    const isLocalDevHost =
        typeof window !== 'undefined' &&
        (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');

    if (isLocalDevHost) {
        const localUrl = `http://localhost:3001${pathname}`;
        return params ? `${localUrl}?${params.toString()}` : localUrl;
    }

    if (!base) {
        return params ? `${pathname}?${params.toString()}` : pathname;
    }

    const fullUrl = `${base}${pathname}`;
    return params ? `${fullUrl}?${params.toString()}` : fullUrl;
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

export default function CandidateJobsPage() {
    const [options, setOptions] = useState<FilterOptions>({
        departments: [],
        locations: [],
        jobTypes: ['full_time', 'part_time', 'contract', 'internship'],
    });
    const [keyword, setKeyword] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
    const [selectedJobType, setSelectedJobType] = useState<string | null>(null);
    const [selectedExperienceLevel, setSelectedExperienceLevel] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    const [jobs, setJobs] = useState<Requisition[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadFilterOptions() {
            try {
                const response = await fetch(getApiUrl('/api/requisitions/filters'), {
                    credentials: 'include',
                });

                if (response.ok) {
                    const data = await response.json();
                    setOptions({
                        departments: data.departments || [],
                        locations: data.locations || [],
                        jobTypes: data.jobTypes || ['full_time', 'part_time', 'contract', 'internship'],
                    });
                }
            } catch (err) {
                console.error('Error loading filter options:', err);
            }
        }

        void loadFilterOptions();
    }, []);

    useEffect(() => {
        async function loadJobs() {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams();
            params.set('page', String(currentPage));
            params.set('pageSize', '10');

            if (selectedDepartment) params.set('department', selectedDepartment);
            if (selectedLocation) params.set('location', selectedLocation);
            if (selectedJobType) params.set('jobType', selectedJobType);
            if (selectedExperienceLevel !== null) {
                params.set('experienceLevel', String(selectedExperienceLevel));
            }
            if (keyword.trim()) params.set('keyword', keyword.trim());

            try {
                const response = await fetch(getApiUrl('/api/requisitions', params), {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Unable to load jobs');
                }

                const data = await response.json();
                setJobs(Array.isArray(data.data) ? data.data : []);
                setPagination(data.pagination || null);
            } catch (err) {
                console.error('Error loading jobs:', err);
                setError('Unable to load jobs right now.');
            } finally {
                setLoading(false);
            }
        }

        void loadJobs();
    }, [selectedDepartment, selectedLocation, selectedJobType, selectedExperienceLevel, keyword, currentPage]);

    function resetFilters() {
        setKeyword('');
        setSelectedDepartment(null);
        setSelectedLocation(null);
        setSelectedJobType(null);
        setSelectedExperienceLevel(null);
        setCurrentPage(1);
    }

    function gotoPage(page: number) {
        setCurrentPage(page);
    }

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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Link href="/candidate/dashboard" style={{ padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', color: '#64748b', fontWeight: 500, fontSize: '14px' }}>
                        My Dashboard
                    </Link>
                    <Link href="/candidate/jobs" style={{ padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', backgroundColor: '#eef2ff', color: '#6366f1', fontWeight: 600, fontSize: '14px' }}>
                        Browse Jobs
                    </Link>
                </div>
            </nav>

            <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>
                <aside>
                    <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>Filters</h2>
                            <button onClick={resetFilters} style={{ border: 'none', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}>
                                Reset
                            </button>
                        </div>

                        <input
                            value={keyword}
                            onChange={(e) => setKeyword(e.target.value)}
                            placeholder="Search title or keyword"
                            style={{ width: '100%', height: '40px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '14px' }}
                        />

                        <div style={{ marginBottom: '14px' }}>
                            <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Department</p>
                            {options.departments.map((department) => (
                                <label key={department} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#0f172a', padding: '5px 0', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedDepartment === department}
                                        onChange={() => setSelectedDepartment(selectedDepartment === department ? null : department)}
                                    />
                                    {department}
                                </label>
                            ))}
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Location</p>
                            {options.locations.map((location) => (
                                <label key={location} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#0f172a', padding: '5px 0', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedLocation === location}
                                        onChange={() => setSelectedLocation(selectedLocation === location ? null : location)}
                                    />
                                    {location}
                                </label>
                            ))}
                        </div>

                        <div style={{ marginBottom: '14px' }}>
                            <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Experience</p>
                            {[0, 1, 3, 5].map((years) => (
                                <label key={years} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#0f172a', padding: '5px 0', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedExperienceLevel === years}
                                        onChange={() => setSelectedExperienceLevel(selectedExperienceLevel === years ? null : years)}
                                    />
                                    {years === 0 ? 'Entry level' : `${years}+ years`}
                                </label>
                            ))}
                        </div>

                        <div>
                            <p style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 700 }}>Job Type</p>
                            {options.jobTypes.map((jobType) => (
                                <label key={jobType} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#0f172a', padding: '5px 0', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedJobType === jobType}
                                        onChange={() => setSelectedJobType(selectedJobType === jobType ? null : jobType)}
                                    />
                                    {formatJobType(jobType)}
                                </label>
                            ))}
                        </div>
                    </div>
                </aside>

                <main>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <p style={{ color: '#64748b', fontSize: '14px' }}>
                            {pagination ? `Showing ${pagination.totalItems} jobs` : 'Loading jobs...'}
                        </p>
                    </div>

                    {error && (
                        <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div style={{ color: '#64748b' }}>Loading jobs...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {jobs.map((job) => {
                                const slotsLeft = Math.max(job.slots - job.filledSlots, 0);

                                return (
                                    <article key={job.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                                        <div style={{ minWidth: '280px', flex: 1 }}>
                                            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#6366f1', marginBottom: '5px' }}>
                                                <Link href={`/candidate/jobs/${job.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                                    {job.title}
                                                </Link>
                                            </h3>
                                            <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '8px' }}>
                                                {job.department} · {job.location} · {formatJobType(job.jobType)}
                                            </p>
                                            <p style={{ color: '#64748b', fontSize: '13px' }}>
                                                {job.eligibilityCriteria?.minYearsExperience !== undefined
                                                    ? `${job.eligibilityCriteria.minYearsExperience}+ years experience`
                                                    : 'Experience details available in job description'}
                                            </p>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '150px' }}>
                                            <Link href={`/jobs/${job.id}/apply`} style={{ backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '8px', padding: '9px 16px', fontWeight: 600, fontSize: '14px' }}>
                                                Apply Now
                                            </Link>
                                            <span style={{ color: '#94a3b8', fontSize: '12px' }}>{slotsLeft} slots left</span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}

                    {pagination && pagination.totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                            <span style={{ color: '#64748b', fontSize: '13px' }}>
                                Page {pagination.page} of {pagination.totalPages}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    onClick={() => gotoPage(pagination.page - 1)}
                                    disabled={!pagination.hasPrevPage}
                                    style={{ width: '34px', height: '34px', border: '1px solid #e2e8f0', borderRadius: '7px', backgroundColor: '#ffffff', cursor: pagination.hasPrevPage ? 'pointer' : 'not-allowed', opacity: pagination.hasPrevPage ? 1 : 0.5 }}
                                >
                                    {'<'}
                                </button>
                                <button
                                    onClick={() => gotoPage(pagination.page + 1)}
                                    disabled={!pagination.hasNextPage}
                                    style={{ width: '34px', height: '34px', border: '1px solid #e2e8f0', borderRadius: '7px', backgroundColor: '#ffffff', cursor: pagination.hasNextPage ? 'pointer' : 'not-allowed', opacity: pagination.hasNextPage ? 1 : 0.5 }}
                                >
                                    {'>'}
                                </button>
                            </div>
                        </div>
                    )}

                    <section style={{ marginTop: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                                More Positions by Experience and Role Type
                            </h3>
                            <span style={{ color: '#64748b', fontSize: '13px' }}>Curated variety</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                            {SHOWCASE_POSITIONS.map((position) => {
                                const badgeStyle =
                                    position.status === 'closing_soon'
                                        ? { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }
                                        : position.status === 'new'
                                            ? { backgroundColor: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd' }
                                            : { backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' };

                                const badgeLabel =
                                    position.status === 'closing_soon'
                                        ? 'Closing Soon'
                                        : position.status === 'new'
                                            ? 'New'
                                            : 'Open';

                                return (
                                    <article key={position.title} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                                            <h4 style={{ color: '#6366f1', fontSize: '15px', fontWeight: 700 }}>{position.title}</h4>
                                            <span style={{ borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, ...badgeStyle }}>
                                                {badgeLabel}
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                                            {position.department} · {position.location}
                                        </p>
                                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>
                                            {formatJobType(position.jobType)} · {position.experienceLabel}
                                        </p>
                                        <Link href="/candidate/jobs" style={{ color: '#6366f1', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>
                                            Explore similar roles
                                        </Link>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}