import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLogPage from '@/app/admin/audit-log/page';
import type { AuditLogListResponse } from '@/types/auditLog';

const routingMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  query: 'page=1'
}));

const serviceMocks = vi.hoisted(() => ({
  fetchAuditLog: vi.fn(),
  exportAuditLogCsv: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: routingMocks.replace
  }),
  useSearchParams: () => new URLSearchParams(routingMocks.query)
}));

vi.mock('@/services/auditLogService', async () => {
  const actual = await vi.importActual<typeof import('@/services/auditLogService')>('@/services/auditLogService');
  return {
    ...actual,
    fetchAuditLog: serviceMocks.fetchAuditLog,
    exportAuditLogCsv: serviceMocks.exportAuditLogCsv
  };
});

function buildAuditResponse(page: number, totalItems: number): AuditLogListResponse {
  const pageSize = 50;
  const start = (page - 1) * pageSize + 1;
  const count = Math.min(pageSize, Math.max(totalItems - start + 1, 0));

  return {
    items: Array.from({ length: count }, (_, index) => {
      const offset = start + index;
      return {
        id: `evt-${offset}`,
        actorId: null,
        actorEmail: 'auditor@example.com',
        eventType: index % 2 === 0 ? 'auth.login' : 'auth.logout',
        entityType: 'session',
        entityId: `entity-${offset}`,
        payload: { sequence: offset },
        ipAddress: '127.0.0.1',
        userAgent: 'Vitest/1.0',
        createdAt: `2026-07-30T10:${String(index).padStart(2, '0')}:00.000Z`
      };
    }),
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
    hasNextPage: page * pageSize < totalItems,
    hasPrevPage: page > 1
  };
}

describe('AuditLogViewer page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routingMocks.query = 'page=1';

    serviceMocks.fetchAuditLog.mockResolvedValue(buildAuditResponse(1, 110));
    serviceMocks.exportAuditLogCsv.mockResolvedValue({
      blob: new Blob(['event_id,event_type\n1,auth.login\n'], { type: 'text/csv' }),
      fileName: 'audit-log.csv'
    });

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock-export')
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn()
    });

    Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
  });

  it('hydrates filters and page from URL, then loads page 3 results', async () => {
    routingMocks.query =
      'page=3&actorEmail=auditor%40example.com&eventTypes=auth.login%2Cauth.logout&entityType=session';
    serviceMocks.fetchAuditLog.mockResolvedValue(buildAuditResponse(3, 170));

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(serviceMocks.fetchAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 3,
          pageSize: 50,
          actorEmail: 'auditor@example.com',
          eventTypes: ['auth.login', 'auth.logout'],
          entityType: 'session'
        })
      );
    });

    expect(screen.getByTestId('audit-filter-actor-email')).toHaveValue('auditor@example.com');
    expect(screen.getByTestId('audit-pagination-current-page')).toHaveTextContent('3');
    expect(screen.getByText('Showing 101-150 of 170 events')).toBeInTheDocument();
  });

  it('applies filters and persists state to URL with page reset', async () => {
    routingMocks.query = 'page=3';

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(serviceMocks.fetchAuditLog).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByTestId('audit-filter-actor-email'), {
      target: { value: ' Auditor@Example.com ' }
    });

    fireEvent.change(screen.getByTestId('audit-filter-entity-type'), {
      target: { value: 'session' }
    });

    const eventTypesSelect = screen.getByTestId('audit-filter-event-types') as HTMLSelectElement;
    Array.from(eventTypesSelect.options).forEach((option) => {
      option.selected = option.value === 'auth.login' || option.value === 'auth.logout';
    });
    fireEvent.change(eventTypesSelect);

    const applyButton = screen.getByRole('button', { name: 'Apply Filters' });
    await waitFor(() => {
      expect(applyButton).toBeEnabled();
    });

    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(routingMocks.replace).toHaveBeenLastCalledWith(
        '/admin/audit-log?page=1&actorEmail=auditor%40example.com&eventTypes=auth.login%2Cauth.logout&entityType=session',
        { scroll: false }
      );
    });
  });

  it('updates URL page param when pagination is changed', async () => {
    routingMocks.query = 'page=3&actorEmail=auditor%40example.com';
    serviceMocks.fetchAuditLog.mockResolvedValue(buildAuditResponse(3, 220));

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(routingMocks.replace).toHaveBeenLastCalledWith(
      '/admin/audit-log?page=4&actorEmail=auditor%40example.com',
      { scroll: false }
    );
  });

  it('uses active filters for CSV export and shows in-progress feedback', async () => {
    routingMocks.query = 'page=2&actorEmail=compliance%40example.com&eventTypes=auth.login_failed';

    let resolveExport: ((value: { blob: Blob; fileName: string }) => void) | null = null;
    serviceMocks.exportAuditLogCsv.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        })
    );

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(serviceMocks.fetchAuditLog).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(screen.getByRole('button', { name: 'Exporting CSV...' })).toBeDisabled();

    resolveExport?.({
      blob: new Blob(['event_id,event_type\n1,auth.login\n'], { type: 'text/csv' }),
      fileName: 'audit-log-export.csv'
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
    });

    expect(serviceMocks.exportAuditLogCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        actorEmail: 'compliance@example.com',
        eventTypes: ['auth.login_failed'],
        page: 1,
        pageSize: 50
      })
    );

    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('shows export error feedback and recovers button state when export fails', async () => {
    routingMocks.query = 'page=2&actorEmail=compliance%40example.com&eventTypes=auth.login_failed';
    serviceMocks.exportAuditLogCsv.mockRejectedValueOnce(new Error('Export failed for current filters'));

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(serviceMocks.fetchAuditLog).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exporting CSV...' })).toBeDisabled();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Export failed for current filters');
    });

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('redirects to unauthorized flow when backend returns 403', async () => {
    serviceMocks.fetchAuditLog.mockReset();
    serviceMocks.fetchAuditLog.mockRejectedValue({
      status: 403,
      message: 'Access denied'
    });

    render(<AuditLogPage />);

    await waitFor(() => {
      expect(routingMocks.replace).toHaveBeenCalledWith('/unauthorized');
    });
  });
});
