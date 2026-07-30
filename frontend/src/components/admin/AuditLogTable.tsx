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
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="audit-log-results-heading">
      <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
        <h2 id="audit-log-results-heading" className="text-lg font-semibold text-gray-900">
          Audit Events
        </h2>
        <p className="text-sm text-gray-600">
          Showing {showingStart}-{showingEnd} of {totalItems} events
        </p>
      </div>

      {error ? (
        <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="p-6 text-sm text-gray-600" data-testid="audit-log-loading-state">
          Loading audit events...
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-gray-600" data-testid="audit-log-empty-state">
          No audit events match the current filters.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Event Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Actor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Request Context</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Payload Preview</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {items.map((item) => (
                  <tr key={item.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {formatTimestamp(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{item.eventType}</div>
                      <div className="text-xs text-gray-500">{item.id}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{item.actorEmail || 'System event'}</div>
                      <div className="text-xs text-gray-500">{item.actorId || 'N/A'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{item.entityType}</div>
                      <div className="text-xs text-gray-500">{item.entityId}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{item.ipAddress || 'N/A'}</div>
                      <div className="text-xs text-gray-500">{item.userAgent || 'N/A'}</div>
                    </td>
                    <td className="max-w-md px-4 py-3 text-xs text-gray-700">
                      <code className="break-all rounded bg-gray-100 px-1 py-0.5">
                        {formatPayloadPreview(item.payload)}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 sm:px-6">
            <div className="text-sm text-gray-600">
              Page <span data-testid="audit-pagination-current-page">{page}</span> of {Math.max(totalPages, 1)}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onPageChange(page - 1)}
                disabled={!hasPrevPage}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
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
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
