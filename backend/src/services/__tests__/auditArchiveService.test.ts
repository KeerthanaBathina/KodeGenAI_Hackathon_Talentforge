import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auditEventFindMany: vi.fn(),
  auditArchiveIndexFindUnique: vi.fn(),
  transaction: vi.fn(),
  txExecuteRawUnsafe: vi.fn(),
  txAuditEventDeleteMany: vi.fn(),
  txAuditArchiveIndexCreate: vi.fn(),
  auditEvent: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn()
}));

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

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      findMany: mocks.auditEventFindMany
    },
    auditArchiveIndex: {
      findUnique: mocks.auditArchiveIndexFindUnique
    },
    $transaction: mocks.transaction
  }
}));

vi.mock('../auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import {
  archiveExpiredAuditEvents,
  AuditArchiveError,
  __setAuditArchiveStorageAdapterForTests
} from '../auditArchiveService';

type ArchiveRow = {
  id: string;
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payloadJson: Prisma.JsonValue;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

function buildRow(id: string, createdAt: string): ArchiveRow {
  return {
    id,
    actorId: null,
    eventType: 'test.audit_event',
    entityType: 'test',
    entityId: `entity-${id}`,
    payloadJson: {
      id,
      marker: true
    },
    ipAddress: null,
    userAgent: 'vitest',
    createdAt: new Date(createdAt)
  };
}

describe('auditArchiveService', () => {
  let storagePayloads: Map<string, Buffer>;
  let storageAdapter: {
    upload: ReturnType<typeof vi.fn>;
    download: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    storagePayloads = new Map<string, Buffer>();
    storageAdapter = {
      upload: vi.fn(async (_bucket: string, path: string, payload: Buffer) => {
        storagePayloads.set(path, Buffer.from(payload));
      }),
      download: vi.fn(async (_bucket: string, path: string) => {
        const payload = storagePayloads.get(path);
        if (!payload) {
          throw new Error('payload not found');
        }
        return Buffer.from(payload);
      })
    };

    __setAuditArchiveStorageAdapterForTests(storageAdapter);

    mocks.auditEventFindMany.mockResolvedValue([]);
    mocks.auditArchiveIndexFindUnique.mockResolvedValue(null);
    mocks.txExecuteRawUnsafe.mockResolvedValue(undefined);
    mocks.txAuditEventDeleteMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) => ({
      count: args.where.id.in.length
    }));
    mocks.txAuditArchiveIndexCreate.mockResolvedValue({ id: 'archive-index-1' });
    mocks.transaction.mockImplementation(async (callback: (tx: any) => Promise<any>) => {
      return callback({
        $executeRawUnsafe: mocks.txExecuteRawUnsafe,
        auditEvent: {
          deleteMany: mocks.txAuditEventDeleteMany
        },
        auditArchiveIndex: {
          create: mocks.txAuditArchiveIndexCreate
        }
      });
    });
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __setAuditArchiveStorageAdapterForTests(null);
  });

  it('archives expired rows, verifies upload checksum, deletes rows, and writes archive index', async () => {
    const firstChunk = [
      buildRow('a-1', '2018-01-01T00:00:00.000Z'),
      buildRow('a-2', '2018-01-01T00:01:00.000Z')
    ];

    mocks.auditEventFindMany
      .mockResolvedValueOnce(firstChunk)
      .mockResolvedValueOnce([]);

    const result = await archiveExpiredAuditEvents({
      now: new Date('2026-07-30T00:00:00.000Z'),
      retentionYears: 7,
      batchSize: 20,
      chunkSize: 10
    });

    expect(result.archivedRowCount).toBe(2);
    expect(result.deletedRowCount).toBe(2);
    expect(result.chunkCount).toBe(1);
    expect(result.fileFormat).toBe('jsonl');
    expect(result.chunks[0]?.outcome).toBe('archived');

    expect(storageAdapter.upload).toHaveBeenCalledTimes(1);
    expect(storageAdapter.download).toHaveBeenCalledTimes(1);

    expect(mocks.txExecuteRawUnsafe).toHaveBeenCalledWith(
      "SELECT set_config('app.audit_archive_purge', 'true', true)"
    );

    expect(mocks.txAuditEventDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['a-1', 'a-2']
          }
        })
      })
    );

    expect(mocks.txAuditArchiveIndexCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rowCount: 2,
          storagePath: expect.stringContaining('/chunk-'),
          hashAlgorithm: 'sha256'
        })
      })
    );

    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'compliance.audit_archive_chunk_completed'
      })
    );
    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'compliance.audit_archive_run_completed'
      })
    );
  });

  it('stops purge/index write when upload fails', async () => {
    mocks.auditEventFindMany.mockResolvedValueOnce([
      buildRow('b-1', '2018-02-01T00:00:00.000Z')
    ]);

    storageAdapter.upload.mockRejectedValueOnce(new Error('upload failed'));

    await expect(
      archiveExpiredAuditEvents({
        now: new Date('2026-07-30T00:00:00.000Z'),
        batchSize: 10,
        chunkSize: 10
      })
    ).rejects.toThrow('upload failed');

    expect(mocks.txAuditEventDeleteMany).not.toHaveBeenCalled();
    expect(mocks.txAuditArchiveIndexCreate).not.toHaveBeenCalled();
    expect(mocks.auditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'compliance.audit_archive_run_failed'
      })
    );
  });

  it('stops purge/index write when checksum verification fails', async () => {
    mocks.auditEventFindMany.mockResolvedValueOnce([
      buildRow('c-1', '2018-03-01T00:00:00.000Z')
    ]);

    storageAdapter.download.mockResolvedValueOnce(Buffer.from('tampered-payload', 'utf8'));

    await expect(
      archiveExpiredAuditEvents({
        now: new Date('2026-07-30T00:00:00.000Z'),
        batchSize: 10,
        chunkSize: 10
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AuditArchiveError',
        code: 'CHECKSUM_MISMATCH'
      })
    );

    expect(mocks.txAuditEventDeleteMany).not.toHaveBeenCalled();
    expect(mocks.txAuditArchiveIndexCreate).not.toHaveBeenCalled();
  });

  it('reuses existing archive index path and only purges matching rows', async () => {
    mocks.auditEventFindMany
      .mockResolvedValueOnce([
        buildRow('d-1', '2018-04-01T00:00:00.000Z')
      ])
      .mockResolvedValueOnce([]);

    mocks.auditArchiveIndexFindUnique.mockResolvedValueOnce({ id: 'existing-index' });

    const result = await archiveExpiredAuditEvents({
      now: new Date('2026-07-30T00:00:00.000Z'),
      batchSize: 10,
      chunkSize: 10
    });

    expect(result.chunkCount).toBe(1);
    expect(result.chunks[0]?.outcome).toBe('reused_archive_index');
    expect(storageAdapter.upload).not.toHaveBeenCalled();
    expect(mocks.txAuditArchiveIndexCreate).not.toHaveBeenCalled();
    expect(mocks.txAuditEventDeleteMany).toHaveBeenCalledTimes(1);
  });

  it('archives in multiple chunks while respecting batch limit', async () => {
    mocks.auditEventFindMany
      .mockResolvedValueOnce([
        buildRow('e-1', '2018-05-01T00:00:00.000Z'),
        buildRow('e-2', '2018-05-01T00:01:00.000Z')
      ])
      .mockResolvedValueOnce([
        buildRow('e-3', '2018-05-01T00:02:00.000Z')
      ])
      .mockResolvedValueOnce([]);

    const result = await archiveExpiredAuditEvents({
      now: new Date('2026-07-30T00:00:00.000Z'),
      batchSize: 3,
      chunkSize: 2
    });

    expect(result.archivedRowCount).toBe(3);
    expect(result.deletedRowCount).toBe(3);
    expect(result.chunkCount).toBe(2);
    expect(storageAdapter.upload).toHaveBeenCalledTimes(2);
  });

  it('throws configuration error for non-positive retention years', async () => {
    await expect(
      archiveExpiredAuditEvents({
        retentionYears: 0
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AuditArchiveError',
        code: 'INVALID_CONFIGURATION'
      })
    );
  });

  it('throws delete count mismatch when purge count differs from selected chunk size', async () => {
    mocks.auditEventFindMany.mockReset();
    mocks.auditEventFindMany
      .mockResolvedValueOnce([
        buildRow('f-1', '2018-06-01T00:00:00.000Z'),
        buildRow('f-2', '2018-06-01T00:01:00.000Z')
      ])
      .mockResolvedValueOnce([]);

    mocks.auditArchiveIndexFindUnique.mockResolvedValueOnce(null);

    mocks.txAuditEventDeleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(
      archiveExpiredAuditEvents({
        now: new Date('2026-07-30T00:00:00.000Z'),
        batchSize: 10,
        chunkSize: 10
      })
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'AuditArchiveError',
        code: 'DELETE_COUNT_MISMATCH'
      })
    );
  });
});
