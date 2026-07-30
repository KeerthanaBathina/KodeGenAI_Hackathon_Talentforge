import './workers/offerWorker';
import './workers/emailDeliveryWorker';
import './workers/auditEventWorker';
import { startPipelineKpiRefreshWorker } from './workers/pipelineKpiRefreshWorker';
import { startGdprAnonymizationWorker } from './workers/gdprAnonymizationWorker';
import { startAuditRetentionArchiveWorker } from './workers/auditRetentionArchiveWorker';
import { startWeeklyAnalyticsDigestWorker } from './workers/weeklyAnalyticsDigestWorker';
import logger from './utils/logger';
import { closeAuditEventQueues } from './queues/auditEventQueue';
import { shutdownAuditEventWorker } from './workers/auditEventWorker';

startPipelineKpiRefreshWorker();
startWeeklyAnalyticsDigestWorker();
startGdprAnonymizationWorker();
startAuditRetentionArchiveWorker();

logger.info('All workers started');

let shutdownInProgress = false;

async function shutdownWorkers(signal: 'SIGTERM' | 'SIGINT'): Promise<void> {
  if (shutdownInProgress) {
    return;
  }

  shutdownInProgress = true;
  logger.info({ signal }, 'Shutdown signal received, closing workers');

  const shutdownResults = await Promise.allSettled([
    shutdownAuditEventWorker(),
    closeAuditEventQueues()
  ]);

  const failedShutdowns = shutdownResults.filter((result) => result.status === 'rejected');
  if (failedShutdowns.length > 0) {
    logger.error(
      {
        failedShutdownCount: failedShutdowns.length,
        failedShutdowns
      },
      'One or more worker shutdown actions failed'
    );
  }

  process.exit(0);
}

// Keep process alive
process.on('SIGTERM', () => {
  void shutdownWorkers('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdownWorkers('SIGINT');
});
