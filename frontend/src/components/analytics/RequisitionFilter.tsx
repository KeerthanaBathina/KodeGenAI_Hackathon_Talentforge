import React, { useMemo } from 'react';
import type { RequisitionOption } from '@/services/pipelineAnalyticsService';

interface RequisitionFilterProps {
  options: RequisitionOption[];
  selectedRequisitionId?: string;
  searchTerm: string;
  loading: boolean;
  onSearchTermChange: (value: string) => void;
  onSelectionChange: (requisitionId?: string) => void;
  onClear: () => void;
}

export function RequisitionFilter({
  options,
  selectedRequisitionId,
  searchTerm,
  loading,
  onSearchTermChange,
  onSelectionChange,
  onClear
}: RequisitionFilterProps) {
  const filteredOptions = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    if (!normalized) {
      return options;
    }

    return options.filter((option) => option.title.toLowerCase().includes(normalized));
  }, [options, searchTerm]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4" aria-label="Requisition filter">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <div>
          <label htmlFor="requisition-search" className="block text-sm font-medium text-gray-700 mb-1">
            Search requisitions
          </label>
          <input
            id="requisition-search"
            type="text"
            value={searchTerm}
            onChange={(event) => onSearchTermChange(event.target.value)}
            placeholder="Type role title"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="requisition-select" className="block text-sm font-medium text-gray-700 mb-1">
            Requisition
          </label>
          <select
            id="requisition-select"
            value={selectedRequisitionId ?? ''}
            onChange={(event) => onSelectionChange(event.target.value || undefined)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            aria-label="Requisition selection"
            disabled={loading}
          >
            <option value="">All requisitions</option>
            {filteredOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          disabled={!selectedRequisitionId && searchTerm.trim() === ''}
        >
          Clear Filter
        </button>
      </div>
    </section>
  );
}
