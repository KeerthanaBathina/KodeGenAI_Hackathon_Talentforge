'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface RequisitionCardProps {
    requisition: {
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
    };
}

interface EligibilityStatus {
    canApply: boolean;
    reason: 'active_application' | 'cooling_period' | 'eligible';
    existingApplicationId?: string;
    daysRemaining?: number;
    rejectedAt?: string;
    message?: string;
}

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
}

export default function RequisitionCard({ requisition }: RequisitionCardProps) {
    const [eligibility, setEligibility] = useState<EligibilityStatus | null>(null);
    const [hasDraft, setHasDraft] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showTooltip, setShowTooltip] = useState(false);

    useEffect(() => {
        async function checkStatus() {
            try {
                // Check eligibility (includes duplicate + cooling period)
                const eligibilityResponse = await fetch(
                    getApiUrl(`/api/requisitions/${requisition.id}/eligibility`),
                    { credentials: 'include' }
                );

                if (eligibilityResponse.ok) {
                    const eligibilityData = await eligibilityResponse.json();
                    setEligibility(eligibilityData);

                    // If eligible, check for draft
                    if (eligibilityData.canApply) {
                        const draftResponse = await fetch(
                            getApiUrl(`/api/requisitions/${requisition.id}/has-draft`),
                            { credentials: 'include' }
                        );

                        if (draftResponse.ok) {
                            const draftData = await draftResponse.json();
                            setHasDraft(draftData.hasDraft);
                        }
                    }
                }
            } catch (error) {
                console.error('Error checking application status:', error);
                // Default to eligible on error (fail open for better UX)
                setEligibility({ canApply: true, reason: 'eligible' });
            } finally {
                setIsLoading(false);
            }
        }

        checkStatus();
    }, [requisition.id]);
    const jobTypeLabels: Record<string, string> = {
        full_time: 'Full Time',
        part_time: 'Part Time',
        contract: 'Contract',
        internship: 'Internship',
    };

    const slotsRemaining = requisition.slots - requisition.filledSlots;

    return (
        <Link
            href={`/jobs/${requisition.id}`}
            data-testid="requisition-card"
            data-requisition-id={requisition.id}
            style={{
                display: 'block',
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: '1.5rem',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'box-shadow 0.2s, transform 0.2s',
                cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
            }}
        >
            {/* Title */}
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                {requisition.title}
            </h3>

            {/* Department & Location */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                <span>{requisition.department}</span>
                <span>•</span>
                <span>{requisition.location}</span>
            </div>

            {/* Job Type Badge */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <span
                    style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#e0e7ff',
                        color: '#3730a3',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                    }}
                >
                    {jobTypeLabels[requisition.jobType] || requisition.jobType}
                </span>
                {requisition.eligibilityCriteria.minYearsExperience !== undefined && (
                    <span
                        style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                        }}
                    >
                        {requisition.eligibilityCriteria.minYearsExperience}+ years
                    </span>
                )}
            </div>

            {/* Slots Remaining */}
            <div style={{ fontSize: '0.875rem', color: slotsRemaining > 0 ? '#059669' : '#dc2626', marginBottom: '1rem' }}>
                {slotsRemaining > 0
                    ? `${slotsRemaining} position${slotsRemaining > 1 ? 's' : ''} available`
                    : 'No positions available'}
            </div>

            {/* Application Status States */}
            {!isLoading && eligibility && (
                <div style={{ position: 'relative' }}>
                    {/* Active Application - Gray, Not Clickable */}
                    {eligibility.reason === 'active_application' && (
                        <div
                            style={{
                                display: 'inline-block',
                                padding: '0.5rem 1rem',
                                backgroundColor: '#9ca3af',
                                color: 'white',
                                borderRadius: '6px',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                cursor: 'not-allowed',
                            }}
                        >
                            Application In Progress
                        </div>
                    )}

                    {/* Cooling Period - Disabled with Tooltip */}
                    {eligibility.reason === 'cooling_period' && (
                        <div
                            style={{ position: 'relative', display: 'inline-block' }}
                            onMouseEnter={() => setShowTooltip(true)}
                            onMouseLeave={() => setShowTooltip(false)}
                        >
                            <button
                                disabled
                                style={{
                                    padding: '0.5rem 1rem',
                                    backgroundColor: '#d1d5db',
                                    color: '#6b7280',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    cursor: 'not-allowed',
                                    border: 'none',
                                }}
                            >
                                Apply (Available in {eligibility.daysRemaining} day{eligibility.daysRemaining !== 1 ? 's' : ''})
                            </button>

                            {/* Tooltip */}
                            {showTooltip && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        bottom: '110%',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: '#1f2937',
                                        color: 'white',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        whiteSpace: 'nowrap',
                                        zIndex: 10,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                    }}
                                >
                                    Re-application available in {eligibility.daysRemaining} day{eligibility.daysRemaining !== 1 ? 's' : ''}
                                    {/* Tooltip arrow */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: 0,
                                            height: 0,
                                            borderLeft: '6px solid transparent',
                                            borderRight: '6px solid transparent',
                                            borderTop: '6px solid #1f2937',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Eligible - Apply Now or Continue Application */}
                    {eligibility.canApply && (
                        <Link
                            href={`/jobs/${requisition.id}/apply`}
                            style={{
                                display: 'inline-block',
                                padding: '0.5rem 1rem',
                                backgroundColor: hasDraft ? '#3b82f6' : '#10b981',
                                color: 'white',
                                borderRadius: '6px',
                                textDecoration: 'none',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {hasDraft ? '↻ Continue Application' : 'Apply Now'}
                        </Link>
                    )}
                </div>
            )}
        </Link>
    );
}
