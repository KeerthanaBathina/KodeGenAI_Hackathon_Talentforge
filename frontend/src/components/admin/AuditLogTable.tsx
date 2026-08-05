'use client';

import React from 'react';
import type { AuditLogListItem } from '@/types/auditLog';

interface AuditLogTableProps {
  items: AuditLogListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  loading: boolean;
  error: string | null;
  onPageChange: (page: number) => void;
}

function formatPayloadPreview(payload: Record<string, unknown>): string {
  const raw = JSON.stringify(payload);

  if (raw.length <= 140) {
    return raw;
  }

  return `${raw.slice(0, 137)}...`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

type EventBadgeKind = 'create' | 'update' | 'delete' | 'auth' | 'default';

function toEventBadgeKind(eventType: string): EventBadgeKind {
  if (eventType.includes('create') || eventType.includes('submitted')) {
    return 'create';
  }

  if (eventType.includes('delete') || eventType.includes('withdrawn') || eventType.includes('deactivate')) {
    return 'delete';
  }

  if (eventType.startsWith('auth.') || eventType.startsWith('security.')) {
    return 'auth';
  }

  if (eventType.includes('update') || eventType.includes('changed') || eventType.includes('version')) {
    return 'update';
  }

  return 'default';
}

function toEventBadgeLabel(eventType: string): string {
  if (eventType.includes('create') || eventType.includes('submitted')) {
    return 'CREATE';
  }

  if (eventType.includes('delete') || eventType.includes('withdrawn') || eventType.includes('deactivate')) {
    return 'DELETE';
  }

  if (eventType.startsWith('auth.') || eventType.startsWith('security.')) {
    return 'AUTH';
  }

  if (eventType.includes('update') || eventType.includes('changed') || eventType.includes('version')) {
    return 'UPDATE';
  }

  return eventType.toUpperCase();
}

function eventBadgeClasses(kind: EventBadgeKind): string {
  switch (kind) {
    case 'create':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'update':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    case 'delete':
      return 'border-red-200 bg-red-50 text-red-700';
    case 'auth':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-slate-200 bg-slate-100 text-slate-700';
  }
}

function buildVisiblePages(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 1) {
    return [];
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

export function AuditLogTable({
  items,
  page,
  pageSize,
  totalItems,
  totalPages,
  hasNextPage,
  hasPrevPage,
  loading,
  error,
  onPageChange
}: AuditLogTableProps) {
  const showingStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingEnd = totalItems === 0 ? 0 : Math.min(page * pageSize, totalItems);
  const visiblePages = buildVisiblePages(page, totalPages);

  return (
    <section className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]" aria-labelledby="audit-log-results-heading">
      <div className="border-b border-[var(--admin-color-border)] px-4 py-3 sm:px-5">
        <h2 id="audit-log-results-heading" className="admin-heading text-lg font-semibold text-[var(--admin-color-ink-primary)]">
          Audit Events
        </h2>
        <p className="text-sm text-[var(--admin-color-ink-secondary)]">
          Showing {showingStart}-{showingEnd} of {totalItems} events
        </p>
      </div>

      {error ? (
        <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-sm text-[var(--admin-color-ink-secondary)]" data-testid="audit-log-loading-state">
          Loading audit events...
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-[var(--admin-color-ink-secondary)]" data-testid="audit-log-empty-state">
          No audit events match the current filters.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr>
                  <th className="bg-[var(--admin-color-surface-2)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">Timestamp</th>
                  <th className="bg-[var(--admin-color-surface-2)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">Actor</th>
                  <th className="bg-[var(--admin-color-surface-2)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">Event</th>
                  <th className="bg-[var(--admin-color-surface-2)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">Entity</th>
                  <th className="bg-[var(--admin-color-surface-2)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--admin-color-border)] align-top hover:bg-[var(--admin-color-surface-1)]">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--admin-color-ink-secondary)] sm:px-5">
                      {formatTimestamp(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--admin-color-ink-primary)] sm:px-5">
                      <div className="font-medium">{item.actorEmail || 'system'}</div>
                      <div className="text-xs text-[var(--admin-color-ink-tertiary)]">{item.actorId || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm sm:px-5">
                      <div className="mb-1">
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${eventBadgeClasses(toEventBadgeKind(item.eventType))}`}>
                          {toEventBadgeLabel(item.eventType)}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--admin-color-ink-tertiary)]">{item.eventType}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-[var(--admin-color-ink-secondary)] sm:px-5">
                      <div>{item.entityType}</div>
                      <div className="text-xs text-[var(--admin-color-ink-tertiary)]">{item.entityId}</div>
                    </td>
                    <td className="px-4 py-3 text-sm sm:px-5">
                      <button
                        type="button"
                        title={formatPayloadPreview(item.payload)}
                        className="text-sm font-semibold text-[var(--admin-color-brand-primary)] hover:underline"
                      >
                        Details -&gt;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-color-border)] px-4 py-3 sm:px-5">
            <div className="text-sm text-[var(--admin-color-ink-secondary)]">
              Page <span data-testid="audit-pagination-current-page">{page}</span> of {Math.max(totalPages, 1)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(page - 1)}
                disabled={!hasPrevPage}
                className="rounded-md border border-[var(--admin-color-border)] px-3 py-1.5 text-sm text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>

              {visiblePages.map((pageNumber) => {
                const isActive = pageNumber === page;
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => onPageChange(pageNumber)}
                    disabled={isActive}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      isActive
                        ? 'border-[var(--admin-color-brand-primary)] bg-[var(--admin-color-brand-primary)] text-white'
                        : 'border-[var(--admin-color-border)] text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => onPageChange(page + 1)}
                disabled={!hasNextPage}
                className="rounded-md border border-[var(--admin-color-border)] px-3 py-1.5 text-sm text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
