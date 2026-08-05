/**
 * Admin Health Dashboard Routes
 *
 * REST API endpoints for system health metrics
 * All routes require admin authentication
 *
 * @module routes/admin/health
 */

import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import {
  getHealthDashboardData,
  getQueueMetrics,
} from '../../services/healthMetricsService';
import { screeningQueue } from '../../queues/screeningQueue';
import { resumeParseQueue } from '../../queues/resumeParseQueue';
import { emailDeliveryQueue } from '../../queues/emailDeliveryQueue';
import { offerQueue } from '../../queues/offerQueue';
import { interviewReminderQueue } from '../../queues/interviewReminderQueue';
import { prisma } from '../../db/prisma';
import logger from '../../utils/logger';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize(['admin']));

/**
 * GET /api/admin/health
 *
 * Returns comprehensive system health metrics including queue depths, worker status,
 * and email delivery metrics.
 *
 * @returns 200 - Health metrics data with timestamp
 * @returns 500 - Internal server error
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();

    // Collect health metrics
    const healthData = await getHealthDashboardData([
      screeningQueue,
      resumeParseQueue,
      emailDeliveryQueue,
      offerQueue,
      interviewReminderQueue,
    ]);

    const duration = Date.now() - startTime;

    // Log slow responses
    if (duration > 500) {
      logger.warn('[HealthAPI] Slow health check', {
        duration,
        userId: req.user?.id,
      });
    }

    // Add performance metadata
    const response = {
      ...healthData,
      meta: {
        collectionTimeMs: duration,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    logger.error('[HealthAPI] Failed to fetch health metrics:', error);

    res.status(500).json({
      error: 'Failed to fetch health metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/admin/health/queue/:queueName
 *
 * Get detailed metrics for a specific queue including job details
 *
 * @param queueName - Name of the queue (e.g., 'screening', 'email-delivery', 'resume-parse', 'offers', 'interview-reminders')
 * @returns 200 - Queue metrics with job details
 * @returns 404 - Queue not found
 * @returns 500 - Internal server error
 */
router.get(
  '/queue/:queueName',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { queueName } = req.params;

      // Map queue names to queue instances
      const queueMap: Record<string, any> = {
        screening: screeningQueue,
        'resume-parse': resumeParseQueue,
        'email-delivery': emailDeliveryQueue,
        offers: offerQueue,
        'interview-reminders': interviewReminderQueue,
      };

      const queue = queueMap[queueName];

      if (!queue) {
        res.status(404).json({
          error: 'Queue not found',
          availableQueues: Object.keys(queueMap),
        });
        return;
      }

      // Get detailed queue metrics
      const [active, waiting, failed, delayed, metrics] = await Promise.all([
        queue.getActive(0, 10), // Get first 10 active jobs
        queue.getWaiting(0, 10),
        queue.getFailed(0, 10),
        queue.getDelayed(0, 10),
        getQueueMetrics(queue),
      ]);

      res.status(200).json({
        queueName,
        metrics,
        jobs: {
          active: active.map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
          })),
          waiting: waiting.map((job) => ({
            id: job.id,
            name: job.name,
            data: job.data,
            timestamp: job.timestamp,
          })),
          failed: failed.map((job) => ({
            id: job.id,
            name: job.name,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
          })),
          delayed: delayed.map((job) => ({
            id: job.id,
            name: job.name,
            delay: job.opts?.delay,
            timestamp: job.timestamp,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[HealthAPI] Failed to fetch queue details:', error);

      res.status(500).json({
        error: 'Failed to fetch queue details',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

/**
 * GET /api/admin/health/email/failed
 *
 * Get paginated list of failed emails (Dead Letter Queue viewer)
 *
 * @query limit - Number of results (default 50, max 100)
 * @query offset - Pagination offset (default 0)
 * @returns 200 - List of failed emails with pagination metadata
 * @returns 500 - Internal server error
 */
router.get(
  '/email/failed',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [failedEmails, totalCount] = await Promise.all([
        prisma.communication.findMany({
          where: {
            channel: 'email',
            status: 'failed',
            createdAt: { gte: oneHourAgo },
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            applicationId: true,
            application: {
              select: {
                candidate: {
                  select: {
                    email: true,
                  },
                },
              },
            },
            template: {
              select: {
                type: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
        }),
        prisma.communication.count({
          where: {
            channel: 'email',
            status: 'failed',
            createdAt: { gte: oneHourAgo },
          },
        }),
      ]);

      res.status(200).json({
        failedEmails: failedEmails.map((email) => ({
          id: email.id,
          to: email.application?.candidate?.email ?? `application:${email.applicationId}`,
          templateType: email.template?.type ?? 'unknown',
          status: email.status,
          createdAt: email.createdAt,
        })),
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[HealthAPI] Failed to fetch failed emails:', error);

      res.status(500).json({
        error: 'Failed to fetch failed emails',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  },
);

export default router;
