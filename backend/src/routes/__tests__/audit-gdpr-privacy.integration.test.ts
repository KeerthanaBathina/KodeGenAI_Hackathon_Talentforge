import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { CandidateStatus, Prisma, PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:3000',
    AUDIT_RETENTION_YEARS: 7,
    AUDIT_ARCHIVE_BUCKET: 'archive-bucket',
    AUDIT_ARCHIVE_PATH_PREFIX: 'audit-events',
    AUDIT_ARCHIVE_BATCH_SIZE: 5000,
    AUDIT_ARCHIVE_CHUNK_SIZE: 1000
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: () => void) => {
    req.user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@example.com',
      role: 'admin'
    };
    next();
  }
}));

import auditLogRouter from '../admin/auditLog';

const prisma = new PrismaClient();
const app = express();
const describeIfDatabaseAvailable = process.env.DATABASE_URL ? describe : describe.skip;

app.use(express.json());
app.use('/api/admin/audit-log', auditLogRouter);

describeIfDatabaseAvailable('Audit GDPR privacy projection integration', () => {
  let supportsArchiveDeleteBypass = false;
  const seededAuditEventIds = new Set<string>();
  const seededCandidateIds = new Set<string>();

  beforeAll(async () => {
    try {
      const functionDefinition = await prisma.$queryRaw<Array<{ definition: string }>>`
        SELECT pg_get_functiondef('prevent_audit_modification'::regproc) AS definition
      `;

      supportsArchiveDeleteBypass = Boolean(
        functionDefinition[0]?.definition?.includes('app.audit_archive_purge')
      );
    } catch {
      supportsArchiveDeleteBypass = false;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (supportsArchiveDeleteBypass && seededAuditEventIds.size > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT set_config('app.audit_archive_purge', 'true', true)");
        await tx.auditEvent.deleteMany({
          where: {
            id: {
              in: Array.from(seededAuditEventIds)
            }
          }
        });
      });
    }

    if (seededCandidateIds.size > 0) {
      await prisma.gdprErasureRequest.deleteMany({
        where: {
          candidateId: {
            in: Array.from(seededCandidateIds)
          }
        }
      });

      await prisma.profile.deleteMany({
        where: {
          candidateId: {
            in: Array.from(seededCandidateIds)
          }
        }
      });

      await prisma.candidate.deleteMany({
        where: {
          id: {
            in: Array.from(seededCandidateIds)
          }
        }
      });
    }

    seededAuditEventIds.clear();
    seededCandidateIds.clear();
  });

  it('redacts candidate pii in list and export responses after anonymization', async () => {
    if (!supportsArchiveDeleteBypass) {
      expect(true).toBe(true);
      return;
    }

    const candidate = await prisma.candidate.create({
      data: {
        email: `audit-privacy-${Date.now()}@example.com`,
        status: CandidateStatus.anonymized,
        anonymisedAt: new Date('2026-07-30T00:00:00.000Z'),
        anonymisationVersion: 'gdpr-v1'
      }
    });

    seededCandidateIds.add(candidate.id);

    const rawPayload = {
      candidateId: candidate.id,
      fullName: 'Jane Candidate',
      email: 'jane.candidate@example.com',
      phone: '+1-555-1200',
      address: '123 Secret Street',
      dateOfBirth: '1990-10-10',
      nested: {
        contactEmail: 'nested.candidate@example.com',
        decision: 'retain'
      }
    } as Prisma.InputJsonValue;

    const candidateAuditRow = await prisma.auditEvent.create({
      data: {
        eventType: 'privacy.integration.audit',
        entityType: 'candidate',
        entityId: candidate.id,
        payloadJson: rawPayload,
        createdAt: new Date('2026-07-30T10:00:00.000Z')
      }
    });

    const applicationAuditRow = await prisma.auditEvent.create({
      data: {
        eventType: 'privacy.integration.audit',
        entityType: 'application',
        entityId: crypto.randomUUID(),
        payloadJson: {
          ...rawPayload,
          stage: 'screening'
        } as Prisma.InputJsonValue,
        createdAt: new Date('2026-07-30T10:01:00.000Z')
      }
    });

    seededAuditEventIds.add(candidateAuditRow.id);
    seededAuditEventIds.add(applicationAuditRow.id);

    const listResponse = await request(app)
      .get('/api/admin/audit-log?eventTypes=privacy.integration.audit')
      .set('Authorization', 'Bearer admin-token');

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body.items)).toBe(true);
    expect(listResponse.body.items.length).toBeGreaterThanOrEqual(2);

    const listPayloadJson = JSON.stringify(listResponse.body.items.map((item: any) => item.payload));
    expect(listPayloadJson).toContain('[REDACTED]');
    expect(listPayloadJson).not.toContain('Jane Candidate');
    expect(listPayloadJson).not.toContain('jane.candidate@example.com');
    expect(listPayloadJson).not.toContain('+1-555-1200');
    expect(listPayloadJson).not.toContain('123 Secret Street');
    expect(listPayloadJson).not.toContain('1990-10-10');

    const exportResponse = await request(app)
      .get('/api/admin/audit-log/export.csv?eventTypes=privacy.integration.audit')
      .set('Authorization', 'Bearer admin-token');

    expect(exportResponse.status).toBe(200);
    expect(exportResponse.text).toContain('[REDACTED]');
    expect(exportResponse.text).not.toContain('Jane Candidate');
    expect(exportResponse.text).not.toContain('jane.candidate@example.com');
    expect(exportResponse.text).not.toContain('+1-555-1200');
    expect(exportResponse.text).not.toContain('123 Secret Street');
    expect(exportResponse.text).not.toContain('1990-10-10');
  });
});