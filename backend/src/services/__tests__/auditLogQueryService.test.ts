import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  candidateFindMany: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      findMany: mocks.findMany,
      count: mocks.count
    },
    candidate: {
      findMany: mocks.candidateFindMany
    }
  }
}));

import { parseAuditLogQueryFilters } from '../auditLogQuerySchema';
import { getAuditLogPage } from '../auditLogQueryService';

describe('auditLogQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.candidateFindMany.mockResolvedValue([]);
  });

  it('keeps findMany and count filters aligned for pagination accuracy', async () => {
    const filters = parseAuditLogQueryFilters({
      actorEmail: 'audit@example.com',
      eventTypes: 'auth.login,auth.logout',
      entityType: 'candidate',
      entityId: '99999999-9999-9999-9999-999999999999',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.999Z',
      page: '3',
      pageSize: '50'
    });

    await getAuditLogPage(filters);

    expect(mocks.findMany).toHaveBeenCalledOnce();
    expect(mocks.count).toHaveBeenCalledOnce();

    const findManyWhere = mocks.findMany.mock.calls[0][0].where;
    const countWhere = mocks.count.mock.calls[0][0].where;

    expect(findManyWhere).toStrictEqual(countWhere);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 50,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
      })
    );
  });

  it('maps actor email and redacts sensitive payload fields', async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: 'evt-1',
        actorId: '11111111-1111-1111-1111-111111111111',
        eventType: 'auth.login',
        entityType: 'session',
        entityId: '22222222-2222-2222-2222-222222222222',
        payloadJson: {
          token: 'super-secret-token',
          nested: {
            password: 'plaintext',
            decision: 'allow'
          }
        },
        ipAddress: '198.51.100.24',
        userAgent: 'AuditServiceTest/1.0',
        createdAt: new Date('2026-07-30T10:00:00.000Z'),
        actor: {
          email: 'admin@example.com'
        }
      }
    ]);
    mocks.count.mockResolvedValueOnce(1);

    const filters = parseAuditLogQueryFilters({});
    const result = await getAuditLogPage(filters);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      actorEmail: 'admin@example.com',
      eventType: 'auth.login',
      payload: {
        nested: {
          decision: 'allow',
          password: '[REDACTED]'
        },
        token: '[REDACTED]'
      }
    });
  });

  it('normalizes non-object payloads to viewer-safe object shape', async () => {
    mocks.findMany.mockResolvedValueOnce([
      {
        id: 'evt-2',
        actorId: null,
        eventType: 'auth.logout',
        entityType: 'session',
        entityId: '33333333-3333-3333-3333-333333333333',
        payloadJson: 'raw-message',
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-07-30T10:05:00.000Z'),
        actor: null
      },
      {
        id: 'evt-3',
        actorId: null,
        eventType: 'auth.logout',
        entityType: 'session',
        entityId: '44444444-4444-4444-4444-444444444444',
        payloadJson: ['a', 'b'],
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-07-30T10:06:00.000Z'),
        actor: null
      }
    ]);
    mocks.count.mockResolvedValueOnce(2);

    const result = await getAuditLogPage(parseAuditLogQueryFilters({}));

    expect(result.items[0]?.payload).toEqual({ value: 'raw-message' });
    expect(result.items[1]?.payload).toEqual({ items: ['a', 'b'] });
  });

  it('returns consistent pagination metadata', async () => {
    mocks.count.mockResolvedValueOnce(151);

    const filters = parseAuditLogQueryFilters({ page: '3', pageSize: '50' });
    const result = await getAuditLogPage(filters);

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(50);
    expect(result.totalItems).toBe(151);
    expect(result.totalPages).toBe(4);
    expect(result.hasPrevPage).toBe(true);
    expect(result.hasNextPage).toBe(true);
  });

  it('applies anonymized candidate privacy projection before viewer sanitization', async () => {
    const candidateId = '77777777-7777-7777-7777-777777777777';

    mocks.findMany.mockResolvedValueOnce([
      {
        id: 'evt-privacy-1',
        actorId: null,
        eventType: 'privacy.integration.audit',
        entityType: 'application',
        entityId: '88888888-8888-8888-8888-888888888888',
        payloadJson: {
          candidateId,
          fullName: 'Jane Candidate',
          email: 'jane.candidate@example.com',
          phone: '+1-555-9876',
          nested: {
            address: '99 Secret Street',
            token: 'session-secret',
            note: 'retained'
          }
        },
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-07-30T11:00:00.000Z'),
        actor: null
      }
    ]);

    mocks.count.mockResolvedValueOnce(1);
    mocks.candidateFindMany.mockResolvedValueOnce([{ id: candidateId }]);

    const result = await getAuditLogPage(parseAuditLogQueryFilters({}));

    expect(result.items[0]?.payload).toEqual({
      candidateId,
      fullName: '[REDACTED]',
      email: '[REDACTED]',
      phone: null,
      nested: {
        address: null,
        note: 'retained',
        token: '[REDACTED]'
      }
    });

    expect(mocks.candidateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: [candidateId]
          },
          status: 'anonymized'
        })
      })
    );
  });
});
