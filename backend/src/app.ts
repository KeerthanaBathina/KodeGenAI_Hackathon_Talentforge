import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import { httpsRedirect } from './middleware/httpsRedirect';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware';
import { requestAuditLogger, requestLogger } from './middleware/requestLogger';
import authRouter from './routes/auth';
import profileRouter from './routes/profile';
import consentRouter from './routes/consent';
import requisitionRouter from './routes/requisitions';
import applicationsRouter from './routes/applications';
import resumesRouter from './routes/resumes';
import screeningsRouter from './routes/screenings';
import webhooksRouter from './routes/webhooks';
import manualReviewQueueRouter from './routes/manualReviewQueue';
import deadLetterJobsRouter from './routes/admin/deadLetterJobs';
import queueStatsRouter from './routes/admin/queueStats';
import thresholdsRouter from './routes/admin/thresholds';
import systemStatusRouter from './routes/admin/systemStatus';
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
  app.use('/api/profile', profileRouter);
  app.use('/api/consent', consentRouter);
  app.use('/api/requisitions', requisitionRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/resumes', resumesRouter);
  app.use('/api/screenings', screeningsRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/manual-review-queue', manualReviewQueueRouter);
  app.use('/api/admin/dead-letter-jobs', deadLetterJobsRouter);
  app.use('/api/admin/queue-stats', queueStatsRouter);
  app.use('/api/admin/thresholds', thresholdsRouter);
  app.use('/api/admin/system-status', systemStatusRouter);
  app.use('/', healthRouter);

  return app;
}

export const app = createApp();
