'use client';

import React from 'react';

interface EmptyStateProps {
    hasActiveFilters: boolean;
    onClearFilters: () => void;
}

export default function EmptyState({
    hasActiveFilters,
    onClearFilters,
}: EmptyStateProps) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4rem 2rem',
                textAlign: 'center',
            }}
        >
            {/* Illustration */}
            <svg
                style={{ width: '200px', height: '200px', marginBottom: '2rem', color: '#9ca3af' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
            </svg>

            {/* Message */}
            {hasActiveFilters ? (
                <>
                    <h2
                        style={{
                            fontSize: '1.5rem',
                            fontWeight: '600',
                            marginBottom: '0.75rem',
                            color: '#111827',
                        }}
                    >
                        No positions match your filters
                    </h2>
                    <p
                        style={{
                            fontSize: '1rem',
                            color: '#6b7280',
                            marginBottom: '2rem',
                            maxWidth: '500px',
                        }}
                    >
                        Try adjusting your search criteria or removing some filters to see more results.
                    </p>
                    <button
                        onClick={onClearFilters}
                        style={{
                            padding: '0.75rem 2rem',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                        }}
                    >
                        Clear All Filters
                    </button>
                </>
            ) : (
                <>
                    <h2
                        style={{
                            fontSize: '1.5rem',
                            fontWeight: '600',
                            marginBottom: '0.75rem',
                            color: '#111827',
                        }}
                    >
                        No open positions at the moment
                    </h2>
                    <p
                        style={{
                            fontSize: '1rem',
                            color: '#6b7280',
                            maxWidth: '500px',
                        }}
                    >
                        We're not currently hiring, but check back soon for new opportunities! You can also
                        sign up for job alerts to be notified when new positions open.
                    </p>
                </>
            )}
        </div>
    );
}
