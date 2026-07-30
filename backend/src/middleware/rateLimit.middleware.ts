import { NextFunction, Request, Response } from 'express';
import { authLimiter, publicLimiter } from './rateLimiter';
import logger from '../utils/logger';

const EXEMPT_PATHS = new Set(['/health', '/ready']);

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function getAuthUserId(req: Request): string | undefined {
  return (req as Request & { user?: { id: string } }).user?.id;
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }

  const userId = getAuthUserId(req);
  const identifier = userId ?? getClientIp(req);
  const limiter = userId ? authLimiter : publicLimiter;
  const limitCeiling = userId ? 1000 : 100;

  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
    res.setHeader('X-RateLimit-Reset', String(reset));

    if (!success) {
      const retryAfterSeconds = Math.ceil((reset - Date.now()) / 1000);
      const retryAfter = Math.max(1, retryAfterSeconds);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter,
        limit: limitCeiling
      });
      return;
    }

    next();
  } catch (error) {
    logger.error({ error }, '[rate-limit] Redis error. Allowing request');
    next();
  }
}
