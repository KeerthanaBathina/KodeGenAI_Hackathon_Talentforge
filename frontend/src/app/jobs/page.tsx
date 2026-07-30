'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FilterControls from '@/components/FilterControls';
import RequisitionCard from '@/components/RequisitionCard';
import Pagination from '@/components/Pagination';
import EmptyState from '@/components/EmptyState';

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
    openedAt: string;
}

interface PaginationMeta {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

interface Filters {
    department: string | null;
    location: string | null;
    jobType: string | null;
    experienceLevel: number | null;
    keyword: string;
}

function getApiUrl(pathname: string, params?: URLSearchParams): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        const url = pathname;
        return params ? `${url}?${params.toString()}` : url;
    }
    const url = `${base}${pathname}`;
    return params ? `${url}?${params.toString()}` : url;
}

export default function JobsPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [requisitions, setRequisitions] = useState<Requisition[]>([]);
    const [pagination, setPagination] = useState<PaginationMeta | null>(null);
    const [filters, setFilters] = useState<Filters>({
        department: searchParams.get('department'),
        location: searchParams.get('location'),
        jobType: searchParams.get('jobType'),
        experienceLevel: searchParams.get('experienceLevel')
            ? parseInt(searchParams.get('experienceLevel')!)
            : null,
        keyword: searchParams.get('keyword') || '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch requisitions when filters or page changes
    useEffect(() => {
        async function fetchRequisitions() {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams();
            params.set('page', searchParams.get('page') || '1');
            params.set('pageSize', '20');

            if (filters.department) params.set('department', filters.department);
            if (filters.location) params.set('location', filters.location);
            if (filters.jobType) params.set('jobType', filters.jobType);
            if (filters.experienceLevel !== null)
                params.set('experienceLevel', filters.experienceLevel.toString());
            if (filters.keyword) params.set('keyword', filters.keyword);

            try {
                const response = await fetch(getApiUrl('/api/requisitions', params), {
                    credentials: 'include',
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch requisitions');
                }

                const data = await response.json();
                setRequisitions(data.data);
                setPagination(data.pagination);
            } catch (err) {
                console.error('Error fetching requisitions:', err);
                setError('Unable to load job listings. Please try again later.');
            } finally {
                setLoading(false);
            }
        }

        fetchRequisitions();
    }, [searchParams, filters]);

    // Update URL when filters change
    useEffect(() => {
        const params = new URLSearchParams();
        if (filters.department) params.set('department', filters.department);
        if (filters.location) params.set('location', filters.location);
        if (filters.jobType) params.set('jobType', filters.jobType);
        if (filters.experienceLevel !== null)
            params.set('experienceLevel', filters.experienceLevel.toString());
        if (filters.keyword) params.set('keyword', filters.keyword);
        if (searchParams.get('page')) params.set('page', searchParams.get('page')!);

        const newUrl = params.toString() ? `/jobs?${params.toString()}` : '/jobs';
        router.push(newUrl, { scroll: false });
    }, [filters]);

    function handleFilterChange(newFilters: Partial<Filters>) {
        setFilters((prev) => ({ ...prev, ...newFilters }));
        // Reset to page 1 when filters change
        const params = new URLSearchParams(searchParams.toString());
        params.delete('page');
        router.push(`/jobs?${params.toString()}`, { scroll: false });
    }

    function handleClearFilters() {
        setFilters({
            department: null,
            location: null,
            jobType: null,
            experienceLevel: null,
            keyword: '',
        });
        router.push('/jobs');
    }

    function handlePageChange(page: number) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', page.toString());
        router.push(`/jobs?${params.toString()}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const hasActiveFilters =
        filters.department ||
        filters.location ||
        filters.jobType ||
        filters.experienceLevel !== null ||
        filters.keyword;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        Open Positions
                    </h1>
                    <p style={{ color: '#6b7280' }}>
                        {pagination ? `${pagination.totalItems} open roles` : 'Loading...'}
                    </p>
                </div>

                {/* Filter Controls */}
                <FilterControls
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onClearFilters={handleClearFilters}
                />

                {/* Error State */}
                {error && (
                    <div
                        style={{
                            backgroundColor: '#fee',
                            border: '1px solid #fcc',
                            borderRadius: '6px',
                            padding: '1rem',
                            marginBottom: '2rem',
                            color: '#c00',
                        }}
                    >
                        {error}
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div
                                key={i}
                                style={{
                                    backgroundColor: '#e5e7eb',
                                    borderRadius: '8px',
                                    height: '200px',
                                    animation: 'pulse 2s infinite',
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!loading && requisitions.length === 0 && (
                    <EmptyState
                        hasActiveFilters={!!hasActiveFilters}
                        onClearFilters={handleClearFilters}
                    />
                )}

                {/* Requisition Grid */}
                {!loading && requisitions.length > 0 && (
                    <>
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '1.5rem',
                                marginBottom: '2rem',
                            }}
                        >
                            {requisitions.map((req) => (
                                <RequisitionCard key={req.id} requisition={req} />
                            ))}
                        </div>

                        {/* Pagination */}
                        {pagination && pagination.totalPages > 1 && (
                            <Pagination
                                currentPage={pagination.page}
                                totalPages={pagination.totalPages}
                                hasNextPage={pagination.hasNextPage}
                                hasPrevPage={pagination.hasPrevPage}
                                onPageChange={handlePageChange}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
