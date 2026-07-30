import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

vi.mock('../../config/env', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    AUDIT_RETENTION_YEARS: 7,
    AUDIT_ARCHIVE_BUCKET: 'archive-bucket',
    AUDIT_ARCHIVE_PATH_PREFIX: 'audit-events',
    AUDIT_ARCHIVE_BATCH_SIZE: 5000,
    AUDIT_ARCHIVE_CHUNK_SIZE: 1000
  }
}));

vi.mock('../auditService', () => ({
  auditEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import {
  archiveExpiredAuditEvents,
  __setAuditArchiveStorageAdapterForTests
} from '../auditArchiveService';

const prisma = new PrismaClient();
const describeIfDatabaseAvailable = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDatabaseAvailable('auditArchiveService integration', () => {
  let supportsArchiveDeleteBypass = false;
  const insertedRowIds = new Set<string>();
  const createdArchivePaths = new Set<string>();

  beforeAll(async () => {
    const functionDefinition = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_functiondef('prevent_audit_modification'::regproc) AS definition
    `;

    supportsArchiveDeleteBypass = Boolean(
      functionDefinition[0]?.definition?.includes('app.audit_archive_purge')
    );
  });

  afterAll(async () => {
    __setAuditArchiveStorageAdapterForTests(null);
    await prisma.$disconnect();
  });

  beforeEach(() => {
    const payloadStore = new Map<string, Buffer>();

    __setAuditArchiveStorageAdapterForTests({
      async upload(_bucket, path, payload) {
        payloadStore.set(path, Buffer.from(payload));
      },
      async download(_bucket, path) {
        const payload = payloadStore.get(path);
        if (!payload) {
          throw new Error(`Missing payload for ${path}`);
        }
        return Buffer.from(payload);
      }
    });
  });

  afterEach(async () => {
    if (insertedRowIds.size > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT set_config('app.audit_archive_purge', 'true', true)");
        await tx.auditEvent.deleteMany({
          where: {
            id: {
              in: Array.from(insertedRowIds)
            }
          }
        });
      });
    }

    if (createdArchivePaths.size > 0) {
      await prisma.auditArchiveIndex.deleteMany({
        where: {
          storagePath: {
            in: Array.from(createdArchivePaths)
          }
        }
      });
    }

    insertedRowIds.clear();
    createdArchivePaths.clear();
    __setAuditArchiveStorageAdapterForTests(null);
  });

  it('creates archive index rows linked to deleted source audit rows', async () => {
    if (!supportsArchiveDeleteBypass) {
      expect(true).toBe(true);
      return;
    }

    const rowOne = await prisma.auditEvent.create({
      data: {
        eventType: 'integration.audit_retention_archive',
        entityType: 'integration_test',
        entityId: '00000000-0000-0000-0000-000000000001',
        payloadJson: {
          marker: 'archive-linkage-1'
        },
        createdAt: new Date('1900-01-01T00:00:00.000Z')
      }
    });

    const rowTwo = await prisma.auditEvent.create({
      data: {
        eventType: 'integration.audit_retention_archive',
        entityType: 'integration_test',
        entityId: '00000000-0000-0000-0000-000000000002',
        payloadJson: {
          marker: 'archive-linkage-2'
        },
        createdAt: new Date('1900-01-01T00:01:00.000Z')
      }
    });

    insertedRowIds.add(rowOne.id);
    insertedRowIds.add(rowTwo.id);

    const result = await archiveExpiredAuditEvents({
      now: new Date('2026-07-30T00:00:00.000Z'),
      retentionYears: 7,
      batchSize: 2,
      chunkSize: 2
    });

    expect(result.chunkCount).toBe(1);
    expect(result.archivedRowCount).toBe(2);
    expect(result.deletedRowCount).toBe(2);

    const archivedChunk = result.chunks[0];
    expect(archivedChunk?.rowCount).toBe(2);
    expect(archivedChunk?.deletedRowCount).toBe(2);

    if (archivedChunk) {
      createdArchivePaths.add(archivedChunk.storagePath);
    }

    const sourceRowsRemaining = await prisma.auditEvent.count({
      where: {
        id: {
          in: [rowOne.id, rowTwo.id]
        }
      }
    });

    expect(sourceRowsRemaining).toBe(0);

    const archiveIndexEntry = await prisma.auditArchiveIndex.findUnique({
      where: {
        storagePath: archivedChunk?.storagePath
      }
    });

    expect(archiveIndexEntry).toBeTruthy();
    expect(archiveIndexEntry?.rowCount).toBe(2);
    expect(archiveIndexEntry?.sourceWindowStart.toISOString()).toBe('1900-01-01T00:00:00.000Z');
    expect(archiveIndexEntry?.sourceWindowEnd.toISOString()).toBe('1900-01-01T00:01:00.000Z');
  });
});
