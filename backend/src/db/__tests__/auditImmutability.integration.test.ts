import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const describeIfDatabaseAvailable = process.env.DATABASE_URL ? describe : describe.skip;

afterAll(async () => {
  await prisma.$disconnect();
});

function makeAuditRow(
  overrides: Partial<Prisma.AuditEventCreateInput> = {}
): Prisma.AuditEventCreateInput {
  return {
    eventType: 'test.immutability',
    entityType: 'test',
    entityId: crypto.randomUUID(),
    payloadJson: { test: true } as Prisma.InputJsonValue,
    userAgent: 'integration-test-agent',
    ...overrides
  };
}

describeIfDatabaseAvailable('audit_events immutability trigger', () => {
  it('allows INSERT and persists row', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });

    expect(row.id).toBeDefined();
    expect(row.eventType).toBe('test.immutability');
  });

  it('raises IMMUTABLE_AUDIT_RECORD on UPDATE', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });

    await expect(
      prisma.auditEvent.update({
        where: { id: row.id },
        data: { eventType: 'tampered' }
      })
    ).rejects.toThrow('IMMUTABLE_AUDIT_RECORD');
  });

  it('raises IMMUTABLE_AUDIT_RECORD on DELETE', async () => {
    const row = await prisma.auditEvent.create({ data: makeAuditRow() });

    await expect(prisma.auditEvent.delete({ where: { id: row.id } })).rejects.toThrow(
      'IMMUTABLE_AUDIT_RECORD'
    );
  });

  it('preserves deterministic UTC ordering for sequential inserts', async () => {
    const firstCreatedAt = new Date('2026-07-01T10:00:00.000Z');
    const secondCreatedAt = new Date('2026-07-01T10:00:01.000Z');

    const first = await prisma.auditEvent.create({
      data: makeAuditRow({
        eventType: 'test.ordering',
        createdAt: firstCreatedAt,
        payloadJson: { sequence: 1 } as Prisma.InputJsonValue
      })
    });

    const second = await prisma.auditEvent.create({
      data: makeAuditRow({
        eventType: 'test.ordering',
        createdAt: secondCreatedAt,
        payloadJson: { sequence: 2 } as Prisma.InputJsonValue
      })
    });

    const ordered = await prisma.auditEvent.findMany({
      where: {
        eventType: 'test.ordering',
        entityType: 'test',
        entityId: {
          in: [first.entityId, second.entityId]
        }
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        createdAt: true,
        payloadJson: true
      }
    });

    const sequence = ordered.map((row) => {
      const payload = row.payloadJson as { sequence?: number };
      return payload.sequence;
    });

    expect(sequence).toEqual([1, 2]);
    expect(ordered[0]?.createdAt.toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(ordered[1]?.createdAt.toISOString()).toBe('2026-07-01T10:00:01.000Z');
  });
});
