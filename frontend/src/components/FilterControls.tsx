'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Filters {
    department: string | null;
    location: string | null;
    jobType: string | null;
    experienceLevel: number | null;
    keyword: string;
}

interface FilterControlsProps {
    filters: Filters;
    onFilterChange: (filters: Partial<Filters>) => void;
    onClearFilters: () => void;
}

interface FilterOptions {
    departments: string[];
    locations: string[];
    jobTypes: string[];
}

function getApiUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
    if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
        return pathname;
    }
    return `${base}${pathname}`;
}

export default function FilterControls({
    filters,
    onFilterChange,
    onClearFilters,
}: FilterControlsProps) {
    const [options, setOptions] = useState<FilterOptions>({
        departments: [],
        locations: [],
        jobTypes: ['full_time', 'part_time', 'contract', 'internship'],
    });
    const [keywordInput, setKeywordInput] = useState(filters.keyword);
    const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch filter options on mount
    useEffect(() => {
        async function fetchOptions() {
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
                console.error('Error fetching filter options:', err);
            }
        }
        fetchOptions();
    }, []);

    // Debounced keyword search (300ms)
    useEffect(() => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            if (keywordInput !== filters.keyword) {
                onFilterChange({ keyword: keywordInput });
            }
        }, 300);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, [keywordInput]);

    const jobTypeLabels: Record<string, string> = {
        full_time: 'Full Time',
        part_time: 'Part Time',
        contract: 'Contract',
        internship: 'Internship',
    };

    const hasActiveFilters =
        filters.department ||
        filters.location ||
        filters.jobType ||
        filters.experienceLevel !== null ||
        filters.keyword;

    return (
        <div style={{ marginBottom: '2rem' }}>
            {/* Search and Filters Row */}
            <div
                style={{
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    padding: '1.5rem',
                    marginBottom: '1rem',
                }}
            >
                {/* Keyword Search */}
                <div style={{ marginBottom: '1rem' }}>
                    <label
                        htmlFor="keyword-search"
                        style={{
                            display: 'block',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            marginBottom: '0.5rem',
                            color: '#374151',
                        }}
                    >
                        Search by keyword
                    </label>
                    <input
                        id="keyword-search"
                        type="text"
                        placeholder="Search job titles, departments..."
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '1rem',
                        }}
                    />
                </div>

                {/* Filter Dropdowns */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '1rem',
                    }}
                >
                    {/* Department */}
                    <div>
                        <label
                            htmlFor="department-filter"
                            style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                marginBottom: '0.5rem',
                                color: '#374151',
                            }}
                        >
                            Department
                        </label>
                        <select
                            id="department-filter"
                            value={filters.department || ''}
                            onChange={(e) =>
                                onFilterChange({ department: e.target.value || null })
                            }
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '1rem',
                            }}
                        >
                            <option value="">All Departments</option>
                            {options.departments.map((dept) => (
                                <option key={dept} value={dept}>
                                    {dept}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Location */}
                    <div>
                        <label
                            htmlFor="location-filter"
                            style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                marginBottom: '0.5rem',
                                color: '#374151',
                            }}
                        >
                            Location
                        </label>
                        <select
                            id="location-filter"
                            value={filters.location || ''}
                            onChange={(e) =>
                                onFilterChange({ location: e.target.value || null })
                            }
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '1rem',
                            }}
                        >
                            <option value="">All Locations</option>
                            {options.locations.map((loc) => (
                                <option key={loc} value={loc}>
                                    {loc}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Job Type */}
                    <div>
                        <label
                            htmlFor="jobtype-filter"
                            style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                marginBottom: '0.5rem',
                                color: '#374151',
                            }}
                        >
                            Job Type
                        </label>
                        <select
                            id="jobtype-filter"
                            value={filters.jobType || ''}
                            onChange={(e) =>
                                onFilterChange({ jobType: e.target.value || null })
                            }
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '1rem',
                            }}
                        >
                            <option value="">All Types</option>
                            {options.jobTypes.map((type) => (
                                <option key={type} value={type}>
                                    {jobTypeLabels[type] || type}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Experience Level */}
                    <div>
                        <label
                            htmlFor="experience-filter"
                            style={{
                                display: 'block',
                                fontSize: '0.875rem',
                                fontWeight: '500',
                                marginBottom: '0.5rem',
                                color: '#374151',
                            }}
                        >
                            Experience Level
                        </label>
                        <select
                            id="experience-filter"
                            value={filters.experienceLevel !== null ? filters.experienceLevel : ''}
                            onChange={(e) =>
                                onFilterChange({
                                    experienceLevel: e.target.value ? parseInt(e.target.value) : null,
                                })
                            }
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '6px',
                                fontSize: '1rem',
                            }}
                        >
                            <option value="">Any Experience</option>
                            <option value="0">Entry Level</option>
                            <option value="1">1+ years</option>
                            <option value="3">3+ years</option>
                            <option value="5">5+ years</option>
                            <option value="10">10+ years</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Active Filters Chips */}
            {hasActiveFilters && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280' }}>
                        Active filters:
                    </span>

                    {filters.keyword && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                borderRadius: '999px',
                                fontSize: '0.875rem',
                            }}
                        >
                            <span>Keyword: {filters.keyword}</span>
                            <button
                                onClick={() => {
                                    setKeywordInput('');
                                    onFilterChange({ keyword: '' });
                                }}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#3730a3',
                                    cursor: 'pointer',
                                    fontSize: '1.25rem',
                                    lineHeight: '1',
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {filters.department && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                borderRadius: '999px',
                                fontSize: '0.875rem',
                            }}
                        >
                            <span>Dept: {filters.department}</span>
                            <button
                                onClick={() => onFilterChange({ department: null })}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#3730a3',
                                    cursor: 'pointer',
                                    fontSize: '1.25rem',
                                    lineHeight: '1',
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {filters.location && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                borderRadius: '999px',
                                fontSize: '0.875rem',
                            }}
                        >
                            <span>Loc: {filters.location}</span>
                            <button
                                onClick={() => onFilterChange({ location: null })}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#3730a3',
                                    cursor: 'pointer',
                                    fontSize: '1.25rem',
                                    lineHeight: '1',
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {filters.jobType && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                borderRadius: '999px',
                                fontSize: '0.875rem',
                            }}
                        >
                            <span>Type: {jobTypeLabels[filters.jobType]}</span>
                            <button
                                onClick={() => onFilterChange({ jobType: null })}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#3730a3',
                                    cursor: 'pointer',
                                    fontSize: '1.25rem',
                                    lineHeight: '1',
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    {filters.experienceLevel !== null && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0.75rem',
                                backgroundColor: '#e0e7ff',
                                color: '#3730a3',
                                borderRadius: '999px',
                                fontSize: '0.875rem',
                            }}
                        >
                            <span>
                                Exp: {filters.experienceLevel === 0 ? 'Entry Level' : `${filters.experienceLevel}+ years`}
                            </span>
                            <button
                                onClick={() => onFilterChange({ experienceLevel: null })}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#3730a3',
                                    cursor: 'pointer',
                                    fontSize: '1.25rem',
                                    lineHeight: '1',
                                }}
                            >
                                ×
                            </button>
                        </div>
                    )}

                    <button
                        onClick={onClearFilters}
                        style={{
                            padding: '0.25rem 0.75rem',
                            backgroundColor: 'transparent',
                            color: '#dc2626',
                            border: '1px solid #dc2626',
                            borderRadius: '999px',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                        }}
                    >
                        Clear All
                    </button>
                </div>
            )}
        </div>
    );
}
