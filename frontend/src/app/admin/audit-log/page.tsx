'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import { AuditLogFilters } from '@/components/admin/AuditLogFilters';
import { AuditLogTable } from '@/components/admin/AuditLogTable';
import {
  AuditLogServiceError,
  exportAuditLogCsv,
  fetchAuditLog
} from '@/services/auditLogService';
import {
  AUDIT_LOG_DEFAULT_PAGE_SIZE,
  type AuditLogFilterFormState,
  type AuditLogListResponse,
  type AuditLogQueryFilters
} from '@/types/auditLog';

const EMPTY_FILTER_FORM: AuditLogFilterFormState = {
  actorEmail: '',
  eventTypes: [],
  entityType: '',
  entityId: '',
  from: '',
  to: ''
};

function toPositivePage(value: string | null): number {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseEventTypes(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function toDateInputValue(rawValue: string | undefined): string {
  if (!rawValue) {
    return '';
  }

  const asDate = new Date(rawValue);
  if (Number.isNaN(asDate.getTime())) {
    return rawValue.slice(0, 10);
  }

  return asDate.toISOString().slice(0, 10);
}

function toBoundaryIsoDate(dateValue: string, boundary: 'from' | 'to'): string {
  if (boundary === 'from') {
    return `${dateValue}T00:00:00.000Z`;
  }

  return `${dateValue}T23:59:59.999Z`;
}

type SearchParamsReader = {
  get(name: string): string | null;
};

function toQueryFilters(searchParams: SearchParamsReader): AuditLogQueryFilters {
  return {
    actorEmail: searchParams.get('actorEmail') || undefined,
    eventTypes: parseEventTypes(searchParams.get('eventTypes')),
    entityType: searchParams.get('entityType') || undefined,
    entityId: searchParams.get('entityId') || undefined,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
    page: toPositivePage(searchParams.get('page')),
    pageSize: AUDIT_LOG_DEFAULT_PAGE_SIZE
  };
}

function toFilterFormState(filters: AuditLogQueryFilters): AuditLogFilterFormState {
  return {
    actorEmail: filters.actorEmail || '',
    eventTypes: filters.eventTypes || [],
    entityType: filters.entityType || '',
    entityId: filters.entityId || '',
    from: toDateInputValue(filters.from),
    to: toDateInputValue(filters.to)
  };
}

function buildQueryString(formState: AuditLogFilterFormState, page: number): string {
  const params = new URLSearchParams();

  params.set('page', String(page));

  const actorEmail = formState.actorEmail.trim().toLowerCase();
  if (actorEmail) {
    params.set('actorEmail', actorEmail);
  }

  if (formState.eventTypes.length > 0) {
    params.set('eventTypes', formState.eventTypes.join(','));
  }

  const entityType = formState.entityType.trim();
  if (entityType) {
    params.set('entityType', entityType);
  }

  const entityId = formState.entityId.trim();
  if (entityId) {
    params.set('entityId', entityId);
  }

  const fromDate = formState.from.trim();
  if (fromDate) {
    params.set('from', toBoundaryIsoDate(fromDate, 'from'));
  }

  const toDate = formState.to.trim();
  if (toDate) {
    params.set('to', toBoundaryIsoDate(toDate, 'to'));
  }

  return params.toString();
}

function isStatusError(error: unknown, status: number): boolean {
  if (error instanceof AuditLogServiceError) {
    return error.status === status;
  }

  if (typeof error === 'object' && error !== null && 'status' in error) {
    return Number((error as { status?: unknown }).status) === status;
  }

  return false;
}

export default function AuditLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryFilters = useMemo(() => toQueryFilters(searchParams), [searchParams]);
  const [formState, setFormState] = useState<AuditLogFilterFormState>(() => toFilterFormState(queryFilters));

  const [auditData, setAuditData] = useState<AuditLogListResponse>({
    items: [],
    page: queryFilters.page || 1,
    pageSize: AUDIT_LOG_DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    setFormState(toFilterFormState(queryFilters));
  }, [
    queryFilters.actorEmail,
    queryFilters.entityType,
    queryFilters.entityId,
    queryFilters.from,
    queryFilters.to,
    (queryFilters.eventTypes || []).join(','),
    queryFilters.page
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadAuditLog() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetchAuditLog(queryFilters);
        if (!cancelled) {
          setAuditData(response);
        }
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        if (isStatusError(loadError, 401)) {
          router.replace('/login');
          return;
        }

        if (isStatusError(loadError, 403)) {
          router.replace('/unauthorized');
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load audit log events');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAuditLog();

    return () => {
      cancelled = true;
    };
  }, [queryFilters, router]);

  function replaceRoute(nextFormState: AuditLogFilterFormState, page: number) {
    const query = buildQueryString(nextFormState, page);
    router.replace(`/admin/audit-log?${query}`, { scroll: false });
  }

  function handleApplyFilters() {
    if (formState.from && formState.to && formState.from > formState.to) {
      setError('Date range invalid: "From Date" cannot be later than "To Date".');
      return;
    }

    setError(null);
    replaceRoute(formState, 1);
  }

  function handleClearFilters() {
    setError(null);
    setFormState(EMPTY_FILTER_FORM);
    replaceRoute(EMPTY_FILTER_FORM, 1);
  }

  function handlePageChange(nextPage: number) {
    if (nextPage < 1) {
      return;
    }

    const appliedState = toFilterFormState(queryFilters);
    replaceRoute(appliedState, nextPage);
  }

  async function handleExport() {
    setExportError(null);
    setExporting(true);

    try {
      const { blob, fileName } = await exportAuditLogCsv({
        ...queryFilters,
        page: 1,
        pageSize: AUDIT_LOG_DEFAULT_PAGE_SIZE
      });

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (exportCsvError) {
      if (isStatusError(exportCsvError, 401)) {
        router.replace('/login');
        return;
      }

      if (isStatusError(exportCsvError, 403)) {
        router.replace('/unauthorized');
        return;
      }

      setExportError(exportCsvError instanceof Error ? exportCsvError.message : 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AdminPageShell
      title="Audit Log Viewer"
      description="Immutable log of system and user actions with export-ready compliance evidence."
      actions={
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="h-9 rounded-md border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-4 text-sm font-semibold text-[var(--admin-color-ink-secondary)] transition hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? 'Exporting CSV...' : 'Export CSV'}
          </button>
          {/* <span className="text-xs text-[var(--admin-color-ink-tertiary)]">Exports use current filters and fixed page size of 50 rows.</span> */}
        </div>
      }
    >
      <div className="space-y-6">
        {exportError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {exportError}
          </div>
        ) : null}

        <AuditLogFilters
          value={formState}
          onChange={setFormState}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
          disabled={loading || exporting}
        />

        <AuditLogTable
          items={auditData.items}
          page={auditData.page}
          pageSize={auditData.pageSize}
          totalItems={auditData.totalItems}
          totalPages={auditData.totalPages}
          hasNextPage={auditData.hasNextPage}
          hasPrevPage={auditData.hasPrevPage}
          loading={loading}
          error={error}
          onPageChange={handlePageChange}
        />
      </div>
    </AdminPageShell>
  );
}
