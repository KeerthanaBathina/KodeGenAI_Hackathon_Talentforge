import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  candidateFindMany: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      findMany: mocks.findMany
    },
    candidate: {
      findMany: mocks.candidateFindMany
    }
  }
}));

import { parseAuditLogQueryFilters } from '../auditLogQuerySchema';
import { streamAuditLogCsv } from '../auditLogExportService';

class MockResponse extends EventEmitter {
  headers: Record<string, string> = {};
  body = '';
  statusCode = 200;
  writableEnded = false;
  headersSent = false;
  firstWriteAt: number | null = null;
  private writeCalls = 0;

  constructor(private readonly stallFirstWrite = false) {
    super();
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  flushHeaders(): void {
    this.headersSent = true;
  }

  write(chunk: string): boolean {
    this.writeCalls += 1;

    if (this.firstWriteAt === null) {
      this.firstWriteAt = performance.now();
    }

    this.body += chunk;

    if (this.stallFirstWrite && this.writeCalls === 1) {
      process.nextTick(() => this.emit('drain'));
      return false;
    }

    return true;
  }

  end(chunk?: string): this {
    if (chunk) {
      this.body += chunk;
    }
    this.writableEnded = true;
    return this;
  }
}

describe('auditLogExportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.candidateFindMany.mockResolvedValue([]);
  });

  it('streams csv with deterministic chunks and keyset pagination', async () => {
    const t1 = new Date('2026-07-30T10:02:00.000Z');
    const t2 = new Date('2026-07-30T10:01:00.000Z');

    mocks.findMany
      .mockResolvedValueOnce([
        {
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          actorId: '11111111-1111-1111-1111-111111111111',
          eventType: 'auth.login',
          entityType: 'session',
          entityId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          payloadJson: { action: 'login', token: 'secret-token' },
          ipAddress: '198.51.100.10',
          userAgent: 'ExportTest/1.0',
          createdAt: t1,
          actor: { email: 'admin@example.com' }
        },
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          actorId: null,
          eventType: 'auth.logout',
          entityType: 'session',
          entityId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
          payloadJson: { action: 'logout' },
          ipAddress: null,
          userAgent: null,
          createdAt: t2,
          actor: null
        }
      ])
      .mockResolvedValueOnce([
        {
          id: '99999999-9999-9999-9999-999999999999',
          actorId: null,
          eventType: 'auth.login_failed',
          entityType: 'session',
          entityId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          payloadJson: { reason: 'invalid_password' },
          ipAddress: '198.51.100.11',
          userAgent: 'ExportTest/1.1',
          createdAt: new Date('2026-07-30T10:00:00.000Z'),
          actor: null
        }
      ])
      .mockResolvedValueOnce([]);

    const filters = parseAuditLogQueryFilters({
      actorEmail: 'Admin@example.com',
      eventTypes: 'auth.login,auth.logout',
      page: 1,
      pageSize: 50
    });

    const res = new MockResponse();
    await streamAuditLogCsv(filters, res as unknown as Response, { chunkSize: 2, filename: 'audit-export.csv' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('audit-export.csv');
    expect(res.writableEnded).toBe(true);

    const lines = res.body.trimEnd().split('\n');
    expect(lines[0]).toBe(
      'event_id,event_type,entity_type,entity_id,created_at,actor_id,actor_email,ip_address,user_agent,payload_json'
    );
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain('auth.login');
    expect(lines[1]).toContain('[REDACTED]');
    expect(lines[3]).toContain('auth.login_failed');

    expect(mocks.findMany).toHaveBeenCalledTimes(3);
    expect(mocks.findMany.mock.calls[0][0]).toMatchObject({
      take: 2,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });

    const secondWhere = mocks.findMany.mock.calls[1][0].where;
    expect(secondWhere).toMatchObject({
      AND: [
        expect.any(Object),
        {
          OR: [
            {
              createdAt: {
                lt: t2
              }
            },
            {
              createdAt: t2,
              id: {
                lt: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
              }
            }
          ]
        }
      ]
    });
  });

  it('handles write backpressure using drain before continuing', async () => {
    mocks.findMany.mockResolvedValueOnce([]);

    const res = new MockResponse(true);
    await expect(streamAuditLogCsv(parseAuditLogQueryFilters({}), res as unknown as Response)).resolves.toBeUndefined();

    expect(res.body).toContain('event_id,event_type,entity_type');
    expect(res.writableEnded).toBe(true);
  });

  it('writes only header when no rows match filters', async () => {
    mocks.findMany.mockResolvedValueOnce([]);

    const res = new MockResponse();
    await streamAuditLogCsv(parseAuditLogQueryFilters({ eventTypes: 'nonexistent.event' }), res as unknown as Response);

    const lines = res.body.trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('event_id,event_type,entity_type');
  });

  it('starts streaming within 30 seconds for 50,000 rows', async () => {
    const totalRows = 50000;
    const chunkSize = 5000;
    let emittedRows = 0;

    mocks.findMany.mockImplementation(async () => {
      if (emittedRows >= totalRows) {
        return [];
      }

      const rowsInChunk = Math.min(chunkSize, totalRows - emittedRows);
      const chunk = Array.from({ length: rowsInChunk }, (_value, index) => {
        const sequence = emittedRows + index + 1;
        return {
          id: `event-${String(sequence).padStart(6, '0')}`,
          actorId: null,
          eventType: 'perf.audit_export',
          entityType: 'audit_export_fixture',
          entityId: `entity-${String(sequence).padStart(6, '0')}`,
          payloadJson: { fixture: true, sequence },
          ipAddress: null,
          userAgent: 'AuditExportPerfTest/1.0',
          createdAt: new Date(Date.now() - sequence),
          actor: null
        };
      });

      emittedRows += rowsInChunk;
      return chunk;
    });

    const res = new MockResponse();
    const startedAt = performance.now();

    await streamAuditLogCsv(parseAuditLogQueryFilters({}), res as unknown as Response, { chunkSize });

    const firstByteMs = (res.firstWriteAt ?? performance.now()) - startedAt;
    const lines = res.body.trimEnd().split('\n');

    expect(firstByteMs).toBeLessThan(30000);
    expect(lines).toHaveLength(totalRows + 1);
  });

  it('redacts anonymized candidate pii in csv payload projection', async () => {
    const candidateId = 'abababab-abab-abab-abab-abababababab';

    mocks.findMany
      .mockResolvedValueOnce([
        {
          id: '11111111-1111-1111-1111-111111111111',
          actorId: null,
          eventType: 'privacy.integration.audit',
          entityType: 'candidate',
          entityId: candidateId,
          payloadJson: {
            fullName: 'Private Candidate',
            email: 'private.candidate@example.com',
            phone: '+1-555-1111',
            address: '12 Hidden Park',
            token: 'secret-value'
          },
          ipAddress: null,
          userAgent: null,
          createdAt: new Date('2026-07-30T11:10:00.000Z'),
          actor: null
        }
      ])
      .mockResolvedValueOnce([]);

    mocks.candidateFindMany.mockResolvedValueOnce([{ id: candidateId }]);

    const res = new MockResponse();
    await streamAuditLogCsv(parseAuditLogQueryFilters({}), res as unknown as Response, { chunkSize: 5 });

    expect(res.body).toContain('[REDACTED]');
    expect(res.body).not.toContain('Private Candidate');
    expect(res.body).not.toContain('private.candidate@example.com');
    expect(res.body).not.toContain('+1-555-1111');
    expect(res.body).not.toContain('12 Hidden Park');
  });
});
