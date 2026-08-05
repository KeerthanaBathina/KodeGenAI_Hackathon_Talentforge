'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildApiUrl } from '@/lib/api/url';

type CandidateNavTab = 'dashboard' | 'jobs' | 'applications' | 'profile';

interface CandidateTopNavProps {
    active: CandidateNavTab;
}

function getLinkStyle(isActive: boolean) {
    if (isActive) {
        return {
            padding: '8px 14px',
            borderRadius: '8px',
            textDecoration: 'none',
            backgroundColor: '#eef2ff',
            color: '#6366f1',
            fontWeight: 600,
            fontSize: '14px',
        };
    }

    return {
        padding: '8px 14px',
        borderRadius: '8px',
        textDecoration: 'none',
        color: '#64748b',
        fontWeight: 500,
        fontSize: '14px',
    };
}

export default function CandidateTopNav({ active }: CandidateTopNavProps) {
    const router = useRouter();
    const [loggingOut, setLoggingOut] = useState(false);

    async function handleLogout() {
        setLoggingOut(true);

        try {
            await fetch(buildApiUrl('/api/auth/logout'), {
                method: 'POST',
                credentials: 'include',
            });
        } catch (error) {
            console.error('Logout request failed:', error);
        } finally {
            if (typeof window !== 'undefined') {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_role');
                localStorage.removeItem('auth_email');
            }

            router.replace('/login');
        }
    }

    return (
        <nav
            aria-label="Candidate navigation"
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Link
                    href="/candidate/dashboard"
                    style={getLinkStyle(active === 'dashboard')}
                    aria-current={active === 'dashboard' ? 'page' : undefined}
                >
                    My Dashboard
                </Link>
                <Link
                    href="/jobs"
                    style={getLinkStyle(active === 'jobs')}
                    aria-current={active === 'jobs' ? 'page' : undefined}
                >
                    Browse Jobs
                </Link>
                <Link
                    href="/applications"
                    style={getLinkStyle(active === 'applications')}
                    aria-current={active === 'applications' ? 'page' : undefined}
                >
                    My Applications
                </Link>
                <Link
                    href="/profile"
                    style={getLinkStyle(active === 'profile')}
                    aria-current={active === 'profile' ? 'page' : undefined}
                >
                    Profile
                </Link>
                <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    style={{
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        color: '#334155',
                        fontWeight: 600,
                        fontSize: '14px',
                        cursor: loggingOut ? 'not-allowed' : 'pointer',
                        opacity: loggingOut ? 0.7 : 1,
                    }}
                >
                    {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
            </div>
        </nav>
    );
}
