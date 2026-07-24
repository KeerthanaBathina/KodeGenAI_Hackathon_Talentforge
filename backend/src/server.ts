import './telemetry/otel';
import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import prisma from './db/prisma';
import { initSocketServer } from './socket';
import { startSystemHealthWorker } from './workers/systemHealthWorker';
import logger from './utils/logger';

const app = createApp();
const server = http.createServer(app);
const io = initSocketServer(server);
const port = Number.parseInt(env.PORT, 10);

// Start system health monitoring
startSystemHealthWorker();

server.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, '[server] Listening');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, '[server] Shutdown signal received');

  io.close(async () => {
    logger.info('[socket] All socket connections closed');
    await prisma.$disconnect();
    logger.info('[db] Prisma disconnected');

    server.close((error) => {
      if (error) {
        logger.error({ error }, '[server] Error while closing HTTP server');
        process.exit(1);
      }
      logger.info('[server] HTTP server closed. Exiting.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error('[server] Graceful shutdown timed out. Force exiting.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
