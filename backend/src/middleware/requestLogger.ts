import { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeRequestBody } from '../utils/piiMask';
import logger from '../utils/logger';

type AppRequest = Request & {
  id?: string;
  user?: { id: string };
  log?: {
    info: (obj: Record<string, unknown>, msg?: string) => void;
    warn: (obj: Record<string, unknown>, msg?: string) => void;
    error: (obj: Record<string, unknown>, msg?: string) => void;
  };
};

export const requestLogger = pinoHttp({
  logger,
  autoLogging: false,
  genReqId: (req) => {
    const existing = req.headers['x-request-id'];
    return typeof existing === 'string' && existing.length > 0 ? existing : uuidv4();
  }
});

export function requestAuditLogger(req: Request, res: Response, next: NextFunction): void {
  const appReq = req as AppRequest;
  const requestId = appReq.id;

  if (requestId) {
    res.setHeader('X-Request-Id', requestId);
  }

  const startedAt = process.hrtime.bigint();
  const path = req.originalUrl.split('?')[0];

  res.on('finish', () => {
    if (path === '/health' || path === '/ready') {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const payload: Record<string, unknown> = {
      requestId: requestId ?? null,
      userId: appReq.user?.id ?? null,
      method: req.method,
      path,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      req: {
        body: sanitizeRequestBody((req as Request & { body?: unknown }).body)
      }
    };

    if (res.statusCode >= 500) {
      appReq.log?.error(payload, 'request failed');
      return;
    }

    if (res.statusCode >= 400) {
      appReq.log?.warn(payload, 'request completed with client error');
      return;
    }

    appReq.log?.info(payload, 'request completed');
  });

  next();
}
