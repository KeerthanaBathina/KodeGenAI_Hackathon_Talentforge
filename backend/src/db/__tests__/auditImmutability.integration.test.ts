import crypto from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

function makeAuditRow(): Prisma.AuditEventCreateInput {
  return {
    eventType: 'test.immutability',
    entityType: 'test',
    entityId: crypto.randomUUID(),
    payloadJson: { test: true } as Prisma.InputJsonValue,
    userAgent: 'integration-test-agent'
  };
}

describe('audit_events immutability trigger', () => {
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
});
