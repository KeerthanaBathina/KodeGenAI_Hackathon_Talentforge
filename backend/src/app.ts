import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { httpsRedirect } from './middleware/httpsRedirect';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware';
import { requestAuditLogger, requestLogger } from './middleware/requestLogger';
import authRouter from './routes/auth';
import { buildSecurityHeaders } from './middleware/securityHeaders';
import healthRouter from './routes/health';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(httpsRedirect);
  app.use(buildSecurityHeaders());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After']
    })
  );

  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(requestLogger);
  app.use(requestAuditLogger);

  app.disable('x-powered-by');

  app.use(rateLimitMiddleware);

  app.use('/api/auth', authRouter);
  app.use('/', healthRouter);

  return app;
}
