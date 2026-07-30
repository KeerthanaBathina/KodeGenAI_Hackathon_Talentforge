import cron from 'node-cron';
import logger from '../utils/logger';
import { processPendingGdprErasureRequests } from '../services/candidateAnonymizationService';

let anonymizationJobInFlight = false;

export async function runGdprAnonymizationCycle(): Promise<void> {
  if (anonymizationJobInFlight) {
    logger.warn('[GdprAnonymizationWorker] run skipped because previous run is still in progress');
    return;
  }

  anonymizationJobInFlight = true;
  const startedAt = Date.now();

  try {
    const summary = await processPendingGdprErasureRequests();
    const durationMs = Date.now() - startedAt;

    if (summary.failedCount > 0) {
      logger.warn(
        {
          selectedCount: summary.selectedCount,
          completedCount: summary.completedCount,
          failedCount: summary.failedCount,
          skippedCount: summary.skippedCount,
          overdueCount: summary.overdueCount,
          durationMs
        },
        '[GdprAnonymizationWorker] run completed with failures; failed requests remain retriable'
      );
      return;
    }

    logger.info(
      {
        selectedCount: summary.selectedCount,
        completedCount: summary.completedCount,
        failedCount: summary.failedCount,
        skippedCount: summary.skippedCount,
        overdueCount: summary.overdueCount,
        durationMs
      },
      '[GdprAnonymizationWorker] run completed'
    );
  } catch (error) {
    logger.error({ error }, '[GdprAnonymizationWorker] scheduled run failed');
  } finally {
    anonymizationJobInFlight = false;
  }
}

export function __resetGdprAnonymizationWorkerStateForTests(): void {
  anonymizationJobInFlight = false;
}

export function startGdprAnonymizationWorker(): void {
  logger.info('[GdprAnonymizationWorker] scheduling daily GDPR anonymization at 00:00 UTC');

  cron.schedule('0 0 * * *', async () => {
    await runGdprAnonymizationCycle();
  }, {
    timezone: 'UTC'
  });
}
