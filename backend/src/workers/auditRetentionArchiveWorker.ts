import cron from 'node-cron';
import logger from '../utils/logger';
import { archiveExpiredAuditEvents } from '../services/auditArchiveService';

let archiveJobInFlight = false;

export async function runAuditRetentionArchiveCycle(): Promise<void> {
  if (archiveJobInFlight) {
    logger.warn('[AuditRetentionArchiveWorker] run skipped because previous run is still in progress');
    return;
  }

  archiveJobInFlight = true;
  const startedAt = Date.now();

  try {
    const summary = await archiveExpiredAuditEvents();

    logger.info(
      {
        cutoff: summary.cutoff.toISOString(),
        chunkCount: summary.chunkCount,
        archivedRowCount: summary.archivedRowCount,
        deletedRowCount: summary.deletedRowCount,
        durationMs: Date.now() - startedAt
      },
      '[AuditRetentionArchiveWorker] monthly archive run completed'
    );
  } catch (error) {
    logger.error({ error }, '[AuditRetentionArchiveWorker] monthly archive run failed');
  } finally {
    archiveJobInFlight = false;
  }
}

export function __resetAuditRetentionArchiveWorkerStateForTests(): void {
  archiveJobInFlight = false;
}

export function startAuditRetentionArchiveWorker(): void {
  logger.info('[AuditRetentionArchiveWorker] scheduling monthly archive on day 1 at 00:00 UTC');

  cron.schedule('0 0 1 * *', async () => {
    await runAuditRetentionArchiveCycle();
  }, {
    timezone: 'UTC'
  });
}
