import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cronSchedule: vi.fn(),
  processPendingGdprErasureRequests: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  scheduledHandler: null as null | (() => Promise<void>)
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.cronSchedule
  }
}));

vi.mock('../../services/candidateAnonymizationService', () => ({
  processPendingGdprErasureRequests: mocks.processPendingGdprErasureRequests
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError
  }
}));

import {
  __resetGdprAnonymizationWorkerStateForTests,
  runGdprAnonymizationCycle,
  startGdprAnonymizationWorker
} from '../gdprAnonymizationWorker';

describe('gdprAnonymizationWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetGdprAnonymizationWorkerStateForTests();

    mocks.cronSchedule.mockImplementation((_expression: string, handler: () => Promise<void>) => {
      mocks.scheduledHandler = handler;
      return { stop: vi.fn() };
    });

    mocks.processPendingGdprErasureRequests.mockResolvedValue({
      selectedCount: 2,
      completedCount: 2,
      failedCount: 0,
      skippedCount: 0,
      overdueCount: 0,
      results: []
    });
  });

  it('registers midnight cron schedule', () => {
    startGdprAnonymizationWorker();

    expect(mocks.cronSchedule).toHaveBeenCalledWith(
      '0 0 * * *',
      expect.any(Function),
      expect.objectContaining({ timezone: 'UTC' })
    );
    expect(mocks.scheduledHandler).toBeTypeOf('function');
  });

  it('runs anonymization cycle successfully and logs summary', async () => {
    await runGdprAnonymizationCycle();

    expect(mocks.processPendingGdprErasureRequests).toHaveBeenCalledTimes(1);
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCount: 2,
        completedCount: 2,
        failedCount: 0
      }),
      '[GdprAnonymizationWorker] run completed'
    );
  });

  it('logs warning when run completes with partial failures', async () => {
    mocks.processPendingGdprErasureRequests.mockResolvedValue({
      selectedCount: 3,
      completedCount: 2,
      failedCount: 1,
      skippedCount: 0,
      overdueCount: 1,
      results: []
    });

    await runGdprAnonymizationCycle();

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedCount: 3,
        completedCount: 2,
        failedCount: 1,
        overdueCount: 1
      }),
      '[GdprAnonymizationWorker] run completed with failures; failed requests remain retriable'
    );
  });

  it('skips overlapping executions to keep retries safe', async () => {
    let resolveFirstRun: (() => void) | null = null;
    mocks.processPendingGdprErasureRequests.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFirstRun = () => resolve({
            selectedCount: 1,
            completedCount: 1,
            failedCount: 0,
            skippedCount: 0,
            overdueCount: 0,
            results: []
          });
        })
    );

    const firstRun = runGdprAnonymizationCycle();
    const secondRun = runGdprAnonymizationCycle();

    await secondRun;

    expect(mocks.processPendingGdprErasureRequests).toHaveBeenCalledTimes(1);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      '[GdprAnonymizationWorker] run skipped because previous run is still in progress'
    );

    resolveFirstRun?.();
    await firstRun;
  });

  it('logs errors and resets in-flight flag for next retry', async () => {
    mocks.processPendingGdprErasureRequests.mockRejectedValueOnce(new Error('database timeout'));

    await runGdprAnonymizationCycle();
    await runGdprAnonymizationCycle();

    expect(mocks.processPendingGdprErasureRequests).toHaveBeenCalledTimes(2);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      '[GdprAnonymizationWorker] scheduled run failed'
    );
  });
});
