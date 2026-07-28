import './workers/offerWorker';
import './workers/emailDeliveryWorker';
import logger from './utils/logger';

logger.info('All workers started');

// Keep process alive
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down workers');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down workers');
  process.exit(0);
});
