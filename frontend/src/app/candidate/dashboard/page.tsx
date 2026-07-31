'use client';

import Link from 'next/link';

export default function CandidateDashboardPage() {
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
                    <Link href="/candidate/dashboard" style={{ padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', backgroundColor: '#eef2ff', color: '#6366f1', fontWeight: 600, fontSize: '14px' }}>
                        My Dashboard
                    </Link>
                    <Link href="/candidate/jobs" style={{ padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', color: '#64748b', fontWeight: 500, fontSize: '14px' }}>
                        Browse Jobs
                    </Link>
                    <Link href="/jobs" style={{ padding: '8px 14px', borderRadius: '8px', textDecoration: 'none', color: '#64748b', fontWeight: 500, fontSize: '14px' }}>
                        My Applications
                    </Link>
                </div>
            </nav>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                    <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Good day, Candidate</h1>
                    <p style={{ color: '#64748b' }}>Track your applications and discover jobs matching your profile.</p>
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
                        <h2 style={{ fontSize: '18px', color: '#0f172a', fontWeight: 700, marginBottom: '6px' }}>Complete your profile to stand out</h2>
                        <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '12px' }}>A complete profile improves your interview shortlisting chances.</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <div style={{ width: '240px', maxWidth: '100%', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                                <div style={{ width: '65%', backgroundColor: '#6366f1', height: '100%' }} />
                            </div>
                            <span style={{ color: '#6366f1', fontWeight: 700, fontSize: '13px' }}>65%</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '12px', border: '1px solid #6ee7b7', color: '#10b981', borderRadius: '999px', padding: '4px 10px', backgroundColor: '#d1fae5' }}>Done: Contact details</span>
                            <span style={{ fontSize: '12px', border: '1px solid #6ee7b7', color: '#10b981', borderRadius: '999px', padding: '4px 10px', backgroundColor: '#d1fae5' }}>Done: Resume</span>
                            <span style={{ fontSize: '12px', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '999px', padding: '4px 10px', backgroundColor: '#ffffff' }}>Todo: Experience</span>
                            <span style={{ fontSize: '12px', border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '999px', padding: '4px 10px', backgroundColor: '#ffffff' }}>Todo: Skills</span>
                        </div>
                    </div>
                    <Link
                        href="/profile"
                        style={{
                            backgroundColor: '#6366f1',
                            color: '#ffffff',
                            padding: '10px 18px',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            fontWeight: 600,
                            fontSize: '14px',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        Complete Profile
                    </Link>
                </section>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Active Applications</h2>
                    <Link href="/jobs" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                        View all
                    </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '28px' }}>
                    <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                            <div>
                                <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>Senior Frontend Engineer</h3>
                                <p style={{ color: '#64748b', fontSize: '13px' }}>Engineering · Bengaluru</p>
                            </div>
                            <span style={{ border: '1px solid #93c5fd', backgroundColor: '#dbeafe', color: '#3b82f6', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', fontWeight: 600, height: 'fit-content' }}>Technical Interview</span>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>Applied recently · App #TF-2024-0142</p>
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <Link href="/jobs" style={{ backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                View Status
                            </Link>
                            <Link href="/jobs" style={{ border: '1px solid #e2e8f0', color: '#64748b', textDecoration: 'none', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                Timeline
                            </Link>
                        </div>
                    </article>

                    <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '8px' }}>
                            <div>
                                <h3 style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>Product Manager - Growth</h3>
                                <p style={{ color: '#64748b', fontSize: '13px' }}>Product · Remote</p>
                            </div>
                            <span style={{ border: '1px solid #fcd34d', backgroundColor: '#fef3c7', color: '#f59e0b', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', fontWeight: 600, height: 'fit-content' }}>AI Screening</span>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>Applied recently · App #TF-2024-0156</p>
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <span style={{ border: '1px solid #e2e8f0', color: '#64748b', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>
                                Screening in progress
                            </span>
                            <Link href="/jobs" style={{ border: '1px solid #e2e8f0', color: '#64748b', textDecoration: 'none', borderRadius: '7px', padding: '8px 12px', fontSize: '13px', fontWeight: 600 }}>
                                Timeline
                            </Link>
                        </div>
                    </article>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Recommended Jobs</h2>
                    <Link href="/candidate/jobs" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
                        Browse all jobs
                    </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
                    <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                        <h3 style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '6px' }}>Full Stack Developer</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>Engineering · Bengaluru · Full-time</p>
                        <p style={{ color: '#06b6d4', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>Match 87%</p>
                        <Link href="/candidate/jobs" style={{ display: 'block', textAlign: 'center', backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontWeight: 600 }}>
                            Apply Now
                        </Link>
                    </article>

                    <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                        <h3 style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '6px' }}>UX Designer</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>Design · Remote · Full-time</p>
                        <p style={{ color: '#06b6d4', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>Match 74%</p>
                        <Link href="/candidate/jobs" style={{ display: 'block', textAlign: 'center', backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontWeight: 600 }}>
                            Apply Now
                        </Link>
                    </article>

                    <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px' }}>
                        <h3 style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a', marginBottom: '6px' }}>DevOps Engineer</h3>
                        <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '10px' }}>Infrastructure · Pune · Full-time</p>
                        <p style={{ color: '#06b6d4', fontWeight: 700, fontSize: '12px', marginBottom: '10px' }}>Match 61%</p>
                        <Link href="/candidate/jobs" style={{ display: 'block', textAlign: 'center', backgroundColor: '#6366f1', color: '#ffffff', textDecoration: 'none', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', fontWeight: 600 }}>
                            Apply Now
                        </Link>
                    </article>
                </div>
            </div>
        </div>
    );
}