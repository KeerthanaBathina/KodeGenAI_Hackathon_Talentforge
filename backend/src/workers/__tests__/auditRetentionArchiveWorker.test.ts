import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(),
  archiveExpiredAuditEvents: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  scheduledHandler: null as null | (() => Promise<void>)
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.schedule
  }
}));

vi.mock('../../services/auditArchiveService', () => ({
  archiveExpiredAuditEvents: mocks.archiveExpiredAuditEvents
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import {
  __resetAuditRetentionArchiveWorkerStateForTests,
  runAuditRetentionArchiveCycle,
  startAuditRetentionArchiveWorker
} from '../auditRetentionArchiveWorker';

describe('auditRetentionArchiveWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetAuditRetentionArchiveWorkerStateForTests();

    mocks.schedule.mockImplementation((_expression: string, callback: () => Promise<void>) => {
      mocks.scheduledHandler = callback;
      return { stop: vi.fn() };
    });

    mocks.archiveExpiredAuditEvents.mockResolvedValue({
      fileFormat: 'jsonl',
      hashAlgorithm: 'sha256',
      cutoff: new Date('2026-01-01T00:00:00.000Z'),
      batchSize: 1000,
      chunkSize: 500,
      chunkCount: 2,
      archivedRowCount: 750,
      deletedRowCount: 750,
      durationMs: 120,
      chunks: []
    });
  });

  it('registers monthly UTC schedule at first day midnight', () => {
    startAuditRetentionArchiveWorker();

    expect(mocks.schedule).toHaveBeenCalledWith(
      '0 0 1 * *',
      expect.any(Function),
      expect.objectContaining({ timezone: 'UTC' })
    );
    expect(mocks.scheduledHandler).toBeTypeOf('function');
  });

  it('runs archive cycle and logs completion summary', async () => {
    await runAuditRetentionArchiveCycle();

    expect(mocks.archiveExpiredAuditEvents).toHaveBeenCalledTimes(1);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkCount: 2,
        archivedRowCount: 750,
        deletedRowCount: 750
      }),
      '[AuditRetentionArchiveWorker] monthly archive run completed'
    );
  });

  it('skips overlapping runs while prior run is in progress', async () => {
    let releaseRun: (() => void) | null = null;

    mocks.archiveExpiredAuditEvents.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseRun = () => resolve({
            fileFormat: 'jsonl',
            hashAlgorithm: 'sha256',
            cutoff: new Date('2026-01-01T00:00:00.000Z'),
            batchSize: 1000,
            chunkSize: 500,
            chunkCount: 1,
            archivedRowCount: 100,
            deletedRowCount: 100,
            durationMs: 20,
            chunks: []
          });
        })
    );

    const first = runAuditRetentionArchiveCycle();
    const second = runAuditRetentionArchiveCycle();

    await second;

    expect(mocks.archiveExpiredAuditEvents).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      '[AuditRetentionArchiveWorker] run skipped because previous run is still in progress'
    );

    releaseRun?.();
    await first;
  });

  it('logs failure and resets in-flight state for recovery run', async () => {
    mocks.archiveExpiredAuditEvents.mockRejectedValueOnce(new Error('supabase unavailable'));

    await runAuditRetentionArchiveCycle();
    await runAuditRetentionArchiveCycle();

    expect(mocks.archiveExpiredAuditEvents).toHaveBeenCalledTimes(2);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      '[AuditRetentionArchiveWorker] monthly archive run failed'
    );
  });
});
