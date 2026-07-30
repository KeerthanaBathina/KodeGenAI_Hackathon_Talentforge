import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuditLogServiceError,
  buildAuditLogExportUrl,
  buildAuditLogQueryParams,
  exportAuditLogCsv,
  fetchAuditLog
} from '@/services/auditLogService';

function createCsvResponse(body: string, fileName = 'audit-log.csv'): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-disposition') {
          return `attachment; filename="${fileName}"`;
        }
        return null;
      }
    },
    blob: async () => new Blob([body], { type: 'text/csv' })
  } as unknown as Response;
}

describe('auditLogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes query filters with normalized actor email and event types', () => {
    const params = buildAuditLogQueryParams({
      actorEmail: ' Auditor@Example.com ',
      eventTypes: ['auth.login', 'auth.logout,auth.login'],
      entityType: 'session',
      entityId: 'abc-123',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      page: 3,
      pageSize: 50
    });

    expect(params.get('actorEmail')).toBe('auditor@example.com');
    expect(params.get('eventTypes')).toBe('auth.login,auth.logout');
    expect(params.get('entityType')).toBe('session');
    expect(params.get('entityId')).toBe('abc-123');
    expect(params.get('from')).toBe('2026-07-01T00:00:00.000Z');
    expect(params.get('to')).toBe('2026-07-31T23:59:59.999Z');
    expect(params.get('page')).toBe('3');
    expect(params.get('pageSize')).toBe('50');
  });

  it('constructs export URL with active filters', () => {
    const url = buildAuditLogExportUrl({
      actorEmail: 'compliance@example.com',
      eventTypes: ['auth.login_failed'],
      page: 2,
      pageSize: 50
    });

    expect(url).toContain('/api/admin/audit-log/export.csv?');
    expect(url).toContain('actorEmail=compliance%40example.com');
    expect(url).toContain('eventTypes=auth.login_failed');
    expect(url).toContain('page=2');
    expect(url).toContain('pageSize=50');
  });

  it('fetches paginated audit logs with include credentials', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        items: [{
          id: 'evt-1',
          actorId: null,
          actorEmail: 'admin@example.com',
          eventType: 'auth.login',
          entityType: 'session',
          entityId: 'entity-1',
          payload: { reason: 'login' },
          ipAddress: '127.0.0.1',
          userAgent: 'Vitest/1.0',
          createdAt: '2026-07-30T10:00:00.000Z'
        }],
        page: 1,
        pageSize: 50,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      })
    } as Response);

    const payload = await fetchAuditLog({ page: 1, pageSize: 50 });

    expect(payload.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/audit-log?page=1&pageSize=50'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include'
      })
    );
  });

  it('parses filename from export response and returns csv blob', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(createCsvResponse('a,b\n1,2\n', 'audit-export.csv'));

    const result = await exportAuditLogCsv({ page: 1, pageSize: 50 });

    expect(result.fileName).toBe('audit-export.csv');
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('throws typed error payload for non-success response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied'
        }
      })
    } as Response);

    await expect(fetchAuditLog({ page: 1 })).rejects.toEqual(
      expect.objectContaining({
        name: 'AuditLogServiceError',
        status: 403,
        code: 'FORBIDDEN',
        message: 'Access denied'
      })
    );
  });

  it('exposes typed error class for consumer guards', () => {
    const error = new AuditLogServiceError('Forbidden', 403, 'FORBIDDEN');

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });
});
