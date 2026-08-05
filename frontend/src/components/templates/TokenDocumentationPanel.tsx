/**
 * Token Documentation Panel Component
 * 
 * Displays available tokens for the selected template type with:
 * - Token name (e.g., {{candidate_name}})
 * - Description
 * - Sample value from sample data
 * - Copy-to-clipboard functionality
 */

import React, { useState, useEffect } from 'react';
import { buildApiUrl } from '@/lib/api/url';

interface TokenDocumentationPanelProps {
    templateType: string;
    missingTokens?: string[];
}

interface TokenInfo {
    token: string;
    description: string;
}

interface SampleDataResponse {
    type: string;
    sampleData: Record<string, string>;
    tokenCount: number;
}

// Token definitions (same as TokenInserter)
const TOKEN_DEFINITIONS: Record<string, TokenInfo[]> = {
    general: [
        { token: 'recipient_name', description: 'Recipient\'s name' },
        { token: 'company_name', description: 'Company name' },
        { token: 'support_email', description: 'Support email address' },
    ],
    screening_invite: [
        { token: 'candidate_name', description: 'Candidate\'s full name' },
        { token: 'role_title', description: 'Job position title' },
        { token: 'screening_link', description: 'Screening assessment link' },
        { token: 'deadline', description: 'Screening completion deadline' },
        { token: 'company_name', description: 'Company name' },
    ],
    assessment_invite: [
        { token: 'candidate_name', description: 'Candidate\'s full name' },
        { token: 'role_title', description: 'Job position title' },
        { token: 'assessment_link', description: 'Assessment link' },
        { token: 'deadline', description: 'Assessment completion deadline' },
        { token: 'duration', description: 'Expected assessment duration' },
        { token: 'company_name', description: 'Company name' },
    ],
    interview_invite: [
        { token: 'candidate_name', description: 'Candidate\'s full name' },
        { token: 'role_title', description: 'Job position title' },
        { token: 'interview_date', description: 'Interview date' },
        { token: 'interview_time', description: 'Interview time' },
        { token: 'interview_timezone', description: 'Interview timezone' },
        { token: 'interview_duration', description: 'Interview duration' },
        { token: 'interviewer_name', description: 'Interviewer name' },
        { token: 'interview_type', description: 'Interview type (e.g., Technical)' },
        { token: 'meeting_link', description: 'Video meeting link' },
        { token: 'company_name', description: 'Company name' },
    ],
    offer: [
        { token: 'candidate_name', description: 'Candidate\'s full name' },
        { token: 'role_title', description: 'Job position title' },
        { token: 'offer_expiry_date', description: 'Offer expiration date' },
        { token: 'salary', description: 'Annual salary' },
        { token: 'start_date', description: 'Employment start date' },
        { token: 'company_name', description: 'Company name' },
        { token: 'hiring_manager_name', description: 'Hiring manager name' },
    ],
    rejection: [
        { token: 'candidate_name', description: 'Candidate\'s full name' },
        { token: 'role_title', description: 'Job position title' },
        { token: 'company_name', description: 'Company name' },
        { token: 'feedback', description: 'Optional feedback' },
    ],
    withdrawal_ack: [
        { token: 'candidate_name', description: 'Candidate\'s full name' },
        { token: 'role_title', description: 'Job position title' },
        { token: 'company_name', description: 'Company name' },
        { token: 'withdrawal_date', description: 'Date of withdrawal' },
    ],
};

export default function TokenDocumentationPanel({
    templateType,
    missingTokens = [],
}: TokenDocumentationPanelProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [sampleData, setSampleData] = useState<Record<string, string>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const tokens = TOKEN_DEFINITIONS[templateType] || [];

    // Fetch sample data for this template type
    useEffect(() => {
        async function fetchSampleData() {
            if (!templateType) return;

            setIsLoading(true);
            try {
                const response = await fetch(
                    buildApiUrl(`/api/templates/sample-data/${templateType}`),
                    {
                        credentials: 'include',
                    }
                );

                if (response.ok) {
                    const data: SampleDataResponse = await response.json();
                    setSampleData(data.sampleData || {});
                }
            } catch (error) {
                console.error('Error fetching sample data:', error);
            } finally {
                setIsLoading(false);
            }
        }

        fetchSampleData();
    }, [templateType]);

    // Filter tokens based on search query
    const filteredTokens = tokens.filter((tokenInfo) =>
        tokenInfo.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tokenInfo.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCopyToken = async (token: string) => {
        try {
            await navigator.clipboard.writeText(`{{${token}}}`);
            setCopiedToken(token);
            setTimeout(() => setCopiedToken(null), 2000);
        } catch (error) {
            console.error('Failed to copy token:', error);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
            {/* Header */}
            <div className="border-b border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-3">
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="flex items-center justify-between w-full text-left"
                    aria-expanded={!isCollapsed}
                >
                    <div>
                        <h3 className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">
                            Available Tokens
                        </h3>
                        <p className="mt-1 text-sm text-[var(--admin-color-ink-secondary)]">
                            {tokens.length} token{tokens.length === 1 ? '' : 's'} for this template
                        </p>
                    </div>
                    <svg
                        className={`h-5 w-5 text-[var(--admin-color-ink-tertiary)] transition-transform ${
                            isCollapsed ? '-rotate-90' : ''
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
            </div>

            {/* Content */}
            {!isCollapsed && (
                <>
                    {/* Search */}
                    {tokens.length > 5 && (
                        <div className="px-4 pt-3">
                            <input
                                type="text"
                                placeholder="Search tokens..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="block h-9 w-full rounded-md border border-[var(--admin-color-border)] px-3 text-sm text-[var(--admin-color-ink-primary)] placeholder:text-[var(--admin-color-ink-tertiary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                                aria-label="Search tokens"
                            />
                        </div>
                    )}

                    {/* Missing Tokens Warning */}
                    {missingTokens.length > 0 && (
                        <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                            <div className="flex">
                                <svg
                                    className="h-5 w-5 flex-shrink-0 text-amber-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                                <div className="ml-3 flex-1">
                                    <h4 className="text-sm font-medium text-amber-800">
                                        Missing Tokens
                                    </h4>
                                    <p className="mt-1 text-xs text-amber-700">
                                        {missingTokens.map((token) => `{{${token}}}`).join(', ')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Token List */}
                    <div className="flex-1 space-y-3 overflow-auto p-4">
                        {isLoading ? (
                            <div className="py-8 text-center text-sm text-[var(--admin-color-ink-secondary)]">
                                Loading sample data...
                            </div>
                        ) : filteredTokens.length > 0 ? (
                            filteredTokens.map((tokenInfo) => {
                                const sampleValue = sampleData[tokenInfo.token];
                                const isMissing = missingTokens.includes(tokenInfo.token);

                                return (
                                    <div
                                        key={tokenInfo.token}
                                        className={`border rounded-lg p-3 ${
                                            isMissing
                                                ? 'border-amber-300 bg-amber-50'
                                                : 'border-[var(--admin-color-border)] bg-white'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                                <code className="admin-mono break-all text-sm font-medium text-[var(--admin-color-brand-primary)]">
                                                    {`{{${tokenInfo.token}}}`}
                                                </code>
                                                <p className="mt-1 text-xs text-[var(--admin-color-ink-secondary)]">
                                                    {tokenInfo.description}
                                                </p>
                                                {sampleValue && (
                                                    <p className="mt-1 text-xs text-[var(--admin-color-ink-tertiary)]">
                                                        <span className="font-medium">Example:</span> {sampleValue}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCopyToken(tokenInfo.token)}
                                                className="ml-2 inline-flex flex-shrink-0 items-center rounded border border-[var(--admin-color-border)] bg-white px-2 py-1 text-xs font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--admin-color-brand-primary)]"
                                                aria-label={`Copy ${tokenInfo.token} token`}
                                            >
                                                {copiedToken === tokenInfo.token ? (
                                                    <>
                                                        <svg
                                                            className="h-3 w-3 text-green-500"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                        <span className="ml-1">Copied</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg
                                                            className="h-3 w-3"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                        <span className="ml-1">Copy</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-8 text-center text-sm text-[var(--admin-color-ink-secondary)]">
                                {searchQuery ? 'No tokens match your search' : 'No tokens available'}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
