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
      className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-4 shadow-[var(--admin-shadow-sm)]"
      aria-labelledby="audit-log-filters-heading"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="audit-log-filters-heading" className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">
            Audit Log Filters
          </h2>
          <p className="text-sm text-[var(--admin-color-ink-secondary)]">
            Refine immutable events by actor, event type, entity, and date range.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="h-9 rounded-md border border-[var(--admin-color-border)] px-3 text-sm font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear Filters
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={disabled}
            className="h-9 rounded-md bg-[var(--admin-color-brand-primary)] px-3 text-sm font-semibold text-white hover:bg-[var(--admin-color-brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <div>
          <label htmlFor="audit-filter-actor-email" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
            Actor Email
          </label>
          <input
            id="audit-filter-actor-email"
            data-testid="audit-filter-actor-email"
            type="email"
            value={value.actorEmail}
            onChange={(event) => updateField('actorEmail', event.target.value)}
            placeholder="auditor@example.com"
            className="h-9 w-full rounded-md border border-[var(--admin-color-border)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] placeholder:text-[var(--admin-color-ink-tertiary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-entity-type" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
            Entity Type
          </label>
          <select
            id="audit-filter-entity-type"
            data-testid="audit-filter-entity-type"
            value={value.entityType}
            onChange={(event) => updateField('entityType', event.target.value)}
            className="h-9 w-full rounded-md border border-[var(--admin-color-border)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
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
          <label htmlFor="audit-filter-entity-id" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
            Entity ID
          </label>
          <input
            id="audit-filter-entity-id"
            data-testid="audit-filter-entity-id"
            type="text"
            value={value.entityId}
            onChange={(event) => updateField('entityId', event.target.value)}
            placeholder="UUID or domain identifier"
            className="h-9 w-full rounded-md border border-[var(--admin-color-border)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] placeholder:text-[var(--admin-color-ink-tertiary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-from" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
            From Date
          </label>
          <input
            id="audit-filter-from"
            data-testid="audit-filter-from"
            type="date"
            value={value.from}
            onChange={(event) => updateField('from', event.target.value)}
            className="h-9 w-full rounded-md border border-[var(--admin-color-border)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-to" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
            To Date
          </label>
          <input
            id="audit-filter-to"
            data-testid="audit-filter-to"
            type="date"
            value={value.to}
            onChange={(event) => updateField('to', event.target.value)}
            className="h-9 w-full rounded-md border border-[var(--admin-color-border)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="audit-filter-event-types" className="mb-1 block text-xs font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)]">
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
            className="h-20 w-full rounded-md border border-[var(--admin-color-border)] px-2.5 py-1.5 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
          >
            {AUDIT_EVENT_TYPE_OPTIONS.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--admin-color-ink-tertiary)]">
            Hold Ctrl (Windows) or Command (Mac) to select multiple event types.
          </p>
        </div>
      </div>
    </section>
  );
}
