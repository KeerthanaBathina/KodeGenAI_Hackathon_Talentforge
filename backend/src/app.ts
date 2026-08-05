import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { MulterError } from 'multer';
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
import interviewsRouter from './routes/interviews';
import interviewPathsRouter from './routes/interviewPaths';
import scorecardsRouter from './routes/scorecards';
import webhooksRouter from './routes/webhooks';
import assessmentsRouter from './routes/assessments';
import analyticsRouter from './routes/analytics';
import sessionTimerRouter from './routes/sessionTimer';
import manualReviewQueueRouter from './routes/manualReviewQueue';
import deadLetterJobsRouter from './routes/admin/deadLetterJobs';
import emailDLQRouter from './routes/admin/emailDLQ';
import queueStatsRouter from './routes/admin/queueStats';
import thresholdsRouter from './routes/admin/thresholds';
import systemStatusRouter from './routes/admin/systemStatus';
import interviewRemindersRouter from './routes/admin/interviewReminders';
import assessmentProvidersRouter from './routes/admin/assessmentProviders';
import socketRoomsRouter from './routes/admin/socketRooms';
import adminUsersRouter from './routes/admin/users';
import screeningThresholdsRouter from './routes/admin/screeningThresholds';
import scoringThresholdsRouter from './routes/admin/scoringThresholds';
import approvalPoliciesRouter from './routes/admin/approvalPolicies';
import adminAuditLogRouter from './routes/admin/auditLog';
import adminHealthRouter from './routes/admin/health';
import approvalsRouter from './routes/approvals';
import offersRouter from './routes/offers';
import templatesRouter from './routes/templates';
import notificationsRouter from './routes/notifications';
import notificationPreferencesRouter from './routes/notificationPreferences';
import jobFamiliesRouter from './routes/jobFamilies';
import { buildSecurityHeaders } from './middleware/securityHeaders';
import publicHealthRouter from './routes/health';

function createCorsOriginValidator() {
  const normalizedConfiguredOrigin = env.FRONTEND_URL.replace(/\/$/, '');
  const allowedOrigins = new Set<string>([normalizedConfiguredOrigin]);

  if (env.NODE_ENV === 'development') {
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3002',
      'http://127.0.0.1:3002'
    ].forEach((origin) => allowedOrigins.add(origin));
  }

  return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    // Allow non-browser and same-origin requests that do not send Origin.
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.has(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin not allowed: ${origin}`));
  };
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(httpsRedirect);
  app.use(buildSecurityHeaders());
  app.use(
    cors({
      origin: createCorsOriginValidator(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After']
    })
  );

  app.use(compression());
  app.use(cookieParser());
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
  app.use('/api/interviews', interviewsRouter);
  app.use('/api/interview-paths', interviewPathsRouter);
  app.use('/api/scorecards', scorecardsRouter);
  app.use('/api/resumes', resumesRouter);
  app.use('/api/screenings', screeningsRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/assessments', assessmentsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/sessions', sessionTimerRouter);
  app.use('/api/manual-review-queue', manualReviewQueueRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/offers', offersRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/job-families', jobFamiliesRouter);
  app.use('/api/notification-preferences', notificationPreferencesRouter);
  app.use('/api/admin/dead-letter-jobs', deadLetterJobsRouter);
  app.use('/api/admin/email-dlq', emailDLQRouter);
  app.use('/api/admin/queue-stats', queueStatsRouter);
  app.use('/api/admin/thresholds', thresholdsRouter);
  app.use('/api/admin/system-status', systemStatusRouter);
  app.use('/api/admin/interview-reminders', interviewRemindersRouter);
  app.use('/api/admin/assessment-providers', assessmentProvidersRouter);
  app.use('/api/admin/socket', socketRoomsRouter);
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin/screening-thresholds', screeningThresholdsRouter);
  app.use('/api/admin/scoring-thresholds', scoringThresholdsRouter);
  app.use('/api/admin/approval-policies', approvalPoliciesRouter);
  app.use('/api/admin/audit-log', adminAuditLogRouter);
  app.use('/api/admin/health', adminHealthRouter);
  app.use('/', publicHealthRouter);

  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          success: false,
          error: 'FILE_TOO_LARGE',
          message: 'File size exceeds 5MB limit'
        });
        return;
      }

      if (err.code === 'LIMIT_FILE_COUNT') {
        res.status(400).json({
          success: false,
          error: 'TOO_MANY_FILES',
          message: 'Only one file can be uploaded at a time'
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'UPLOAD_ERROR',
        message: err.message
      });
      return;
    }

    if (err.message === 'Only CSV files are allowed') {
      res.status(400).json({
        success: false,
        error: 'INVALID_FILE_TYPE',
        message: 'Only CSV files are allowed'
      });
      return;
    }

    next(err);
  });

  return app;
}

export const app = createApp();
