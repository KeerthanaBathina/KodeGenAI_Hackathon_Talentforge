'use client';

import React from 'react';
import {
  AUDIT_ENTITY_TYPE_OPTIONS,
  AUDIT_EVENT_TYPE_OPTIONS,
  type AuditLogFilterFormState
} from '@/types/auditLog';

interface AuditLogFiltersProps {
  value: AuditLogFilterFormState;
  onChange: (next: AuditLogFilterFormState) => void;
  onApply: () => void;
  onClear: () => void;
  disabled?: boolean;
}

export function AuditLogFilters({
  value,
  onChange,
  onApply,
  onClear,
  disabled = false
}: AuditLogFiltersProps) {
  function updateField<Key extends keyof AuditLogFilterFormState>(
    key: Key,
    fieldValue: AuditLogFilterFormState[Key]
  ) {
    onChange({
      ...value,
      [key]: fieldValue
    });
  }

  return (
    <section
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      aria-labelledby="audit-log-filters-heading"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 id="audit-log-filters-heading" className="text-lg font-semibold text-gray-900">
            Audit Filters
          </h2>
          <p className="text-sm text-gray-600">
            Refine the event stream by actor, event type, entity, and date range.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Filters
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={disabled}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label htmlFor="audit-filter-actor-email" className="mb-1 block text-sm font-medium text-gray-700">
            Actor Email
          </label>
          <input
            id="audit-filter-actor-email"
            data-testid="audit-filter-actor-email"
            type="email"
            value={value.actorEmail}
            onChange={(event) => updateField('actorEmail', event.target.value)}
            placeholder="auditor@example.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-entity-type" className="mb-1 block text-sm font-medium text-gray-700">
            Entity Type
          </label>
          <select
            id="audit-filter-entity-type"
            data-testid="audit-filter-entity-type"
            value={value.entityType}
            onChange={(event) => updateField('entityType', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            <option value="">All entities</option>
            {AUDIT_ENTITY_TYPE_OPTIONS.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityType}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-filter-entity-id" className="mb-1 block text-sm font-medium text-gray-700">
            Entity ID
          </label>
          <input
            id="audit-filter-entity-id"
            data-testid="audit-filter-entity-id"
            type="text"
            value={value.entityId}
            onChange={(event) => updateField('entityId', event.target.value)}
            placeholder="UUID or domain identifier"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-from" className="mb-1 block text-sm font-medium text-gray-700">
            From Date
          </label>
          <input
            id="audit-filter-from"
            data-testid="audit-filter-from"
            type="date"
            value={value.from}
            onChange={(event) => updateField('from', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-to" className="mb-1 block text-sm font-medium text-gray-700">
            To Date
          </label>
          <input
            id="audit-filter-to"
            data-testid="audit-filter-to"
            type="date"
            value={value.to}
            onChange={(event) => updateField('to', event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-event-types" className="mb-1 block text-sm font-medium text-gray-700">
            Event Types
          </label>
          <select
            id="audit-filter-event-types"
            data-testid="audit-filter-event-types"
            multiple
            value={value.eventTypes}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
              updateField('eventTypes', selected);
            }}
            className="h-36 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {AUDIT_EVENT_TYPE_OPTIONS.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Hold Ctrl (Windows) or Command (Mac) to select multiple event types.
          </p>
        </div>
      </div>
    </section>
  );
}
