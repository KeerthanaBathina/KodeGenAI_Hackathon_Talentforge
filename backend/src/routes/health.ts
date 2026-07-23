import { Router, Request, Response } from 'express';
import prisma from '../db/prisma';
import { pingRedis } from '../db/redis';
import { getSocketServer } from '../socket';
import logger from '../utils/logger';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = { status: 'ok' };
  let statusCode = 200;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbMs = Date.now() - dbStart;
    checks.db = 'ok';
    checks.db_ms = String(dbMs);
    if (dbMs > 100) {
      logger.warn({ dbMs }, '[health] DB latency exceeds 100ms target');
    }
  } catch {
    checks.db = 'error';
    checks.status = 'degraded';
    statusCode = 503;
  }

  try {
    const redisMs = await pingRedis();
    checks.redis = 'ok';
    checks.redis_ms = String(redisMs);
    if (redisMs > 50) {
      logger.warn({ redisMs }, '[health] Redis PING latency exceeds 50ms target');
    }
  } catch {
    checks.redis = 'error';
    checks.status = 'degraded';
    statusCode = 503;
  }

  try {
    const socketServer = getSocketServer();
    checks.socket = 'ok';
    checks.connections = String(socketServer.engine.clientsCount);
  } catch {
    checks.socket = 'ok';
  }

  res.status(statusCode).json(checks);
});

router.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ready' });
});

router.get('/ping', (_req: Request, res: Response) => {
  res.status(200).json({ pong: true });
});

export default router;
