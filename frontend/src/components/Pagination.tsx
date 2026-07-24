'use client';

import React from 'react';

interface PaginationProps {
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    onPageChange: (page: number) => void;
}

export default function Pagination({
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage,
    onPageChange,
}: PaginationProps) {
    // Generate page numbers with ellipsis
    function getPageNumbers(): (number | string)[] {
        const pages: (number | string)[] = [];

        if (totalPages <= 7) {
            // Show all pages if 7 or fewer
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Always show first page
            pages.push(1);

            if (currentPage > 3) {
                pages.push('...');
            }

            // Show pages around current page
            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push('...');
            }

            // Always show last page
            pages.push(totalPages);
        }

        return pages;
    }

    const pageNumbers = getPageNumbers();

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
            }}
        >
            {/* Previous Button */}
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={!hasPrevPage}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: hasPrevPage ? 'white' : '#f3f4f6',
                    color: hasPrevPage ? '#374151' : '#9ca3af',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: hasPrevPage ? 'pointer' : 'not-allowed',
                }}
            >
                ← Previous
            </button>

            {/* Page Numbers */}
            {pageNumbers.map((page, index) => {
                if (page === '...') {
                    return (
                        <span
                            key={`ellipsis-${index}`}
                            style={{
                                padding: '0.5rem',
                                color: '#6b7280',
                            }}
                        >
                            ...
                        </span>
                    );
                }

                const isActive = page === currentPage;

                return (
                    <button
                        key={page}
                        onClick={() => onPageChange(page as number)}
                        disabled={isActive}
                        style={{
                            width: '40px',
                            height: '40px',
                            backgroundColor: isActive ? '#2563eb' : 'white',
                            color: isActive ? 'white' : '#374151',
                            border: `1px solid ${isActive ? '#2563eb' : '#d1d5db'}`,
                            borderRadius: '6px',
                            fontSize: '0.875rem',
                            fontWeight: isActive ? '600' : '500',
                            cursor: isActive ? 'default' : 'pointer',
                        }}
                    >
                        {page}
                    </button>
                );
            })}

            {/* Next Button */}
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={!hasNextPage}
                style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: hasNextPage ? 'white' : '#f3f4f6',
                    color: hasNextPage ? '#374151' : '#9ca3af',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: hasNextPage ? 'pointer' : 'not-allowed',
                }}
            >
                Next →
            </button>
        </div>
    );
}
