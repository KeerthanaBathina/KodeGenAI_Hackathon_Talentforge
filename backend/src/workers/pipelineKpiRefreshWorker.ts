import cron from 'node-cron';
import logger from '../utils/logger';
import { refreshPipelineKpiMaterializedView } from '../services/pipelineKpiRefreshService';

let refreshInFlight = false;

async function runRefresh(): Promise<void> {
  if (refreshInFlight) {
    logger.warn('[PipelineKPIWorker] refresh skipped because previous run is still in progress');
    return;
  }

  refreshInFlight = true;

  try {
    await refreshPipelineKpiMaterializedView();
  } finally {
    refreshInFlight = false;
  }
}

export function startPipelineKpiRefreshWorker(): void {
  logger.info('[PipelineKPIWorker] scheduling pipeline KPI refresh every 5 minutes');

  cron.schedule('*/5 * * * *', async () => {
    try {
      await runRefresh();
    } catch (error) {
      logger.error({ error }, '[PipelineKPIWorker] scheduled refresh failed');
    }
  });

  runRefresh().catch((error) => {
    logger.error({ error }, '[PipelineKPIWorker] initial refresh failed');
  });
}
