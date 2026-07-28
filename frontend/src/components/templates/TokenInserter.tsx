/**
 * Token Inserter Component
 * 
 * Dropdown menu for inserting tokens into email templates.
 * Displays available tokens for the selected template type with descriptions.
 */

import React, { useState, useEffect } from 'react';

interface TokenInserterProps {
    templateType: string;
    onInsertToken: (token: string) => void;
}

interface TokenInfo {
    token: string;
    description: string;
}

// Token definitions for each template type
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

export default function TokenInserter({
    templateType,
    onInsertToken,
}: TokenInserterProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [availableTokens, setAvailableTokens] = useState<TokenInfo[]>([]);

    useEffect(() => {
        const tokens = TOKEN_DEFINITIONS[templateType] || [];
        setAvailableTokens(tokens);
    }, [templateType]);

    const handleInsert = (token: string) => {
        onInsertToken(token);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                aria-haspopup="true"
                aria-expanded={isOpen}
            >
                <svg
                    className="mr-2 h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                    />
                </svg>
                Insert Token
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Dropdown */}
                    <div className="absolute left-0 mt-2 w-80 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
                        <div
                            className="py-1 max-h-96 overflow-y-auto"
                            role="menu"
                            aria-orientation="vertical"
                            aria-labelledby="token-menu"
                        >
                            {availableTokens.length > 0 ? (
                                availableTokens.map((tokenInfo) => (
                                    <button
                                        key={tokenInfo.token}
                                        type="button"
                                        onClick={() => handleInsert(tokenInfo.token)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none transition-colors"
                                        role="menuitem"
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-mono font-medium text-blue-600">
                                                {'{{' + tokenInfo.token + '}}'}
                                            </span>
                                            <span className="text-xs text-gray-500 mt-1">
                                                {tokenInfo.description}
                                            </span>
                                        </div>
                                    </button>
                                ))
                            ) : (
                                <div className="px-4 py-3 text-sm text-gray-500">
                                    No tokens available for this template type
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
