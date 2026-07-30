import { Router, Request, Response } from 'express';
import prisma from '../../db/prisma';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import { enqueueEmailDelivery } from '../../queues/emailDeliveryQueue';
import { generateEmailIdempotencyKey } from '../../utils/idempotencyKey';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/admin/email-dlq
 * List failed email deliveries in DLQ (Dead Letter Queue)
 * 
 * Query params:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 50, max: 100)
 * 
 * @security OWASP A01 - Requires admin role
 */
router.get(
  '/',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
      const skip = (page - 1) * pageSize;

      // Fetch failed communications with related data
      const failed = await prisma.communication.findMany({
        where: { status: 'failed' },
        include: {
          template: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          application: {
            select: {
              id: true,
              candidate: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
              requisition: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });

      const total = await prisma.communication.count({
        where: { status: 'failed' },
      });

      const totalPages = Math.ceil(total / pageSize);

      logger.info(
        {
          userId: req.user?.id,
          page,
          pageSize,
          total,
        },
        'Admin viewed email DLQ'
      );

      res.status(200).json({
        failed,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId: req.user?.id,
        },
        'Failed to fetch email DLQ'
      );

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch email DLQ',
        },
      });
    }
  }
);

/**
 * GET /api/admin/email-dlq/stats
 * Get DLQ statistics and trends
 * 
 * @security OWASP A01 - Requires admin role
 */
router.get(
  '/stats',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      // Get counts by status
      const [failedCount, sentCount, queuedCount, deliveredCount] = await Promise.all([
        prisma.communication.count({ where: { status: 'failed' } }),
        prisma.communication.count({ where: { status: 'sent' } }),
        prisma.communication.count({ where: { status: 'queued' } }),
        prisma.communication.count({ where: { status: 'delivered' } }),
      ]);

      // Get failed communications grouped by template
      const failedByTemplate = await prisma.communication.groupBy({
        by: ['templateId'],
        where: { status: 'failed' },
        _count: true,
      });

      // Get template names for the grouped results
      const templateIds = failedByTemplate.map((f) => f.templateId);
      const templates = await prisma.template.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true, type: true },
      });

      const failedByTemplateWithNames = failedByTemplate.map((f) => {
        const template = templates.find((t) => t.id === f.templateId);
        return {
          templateId: f.templateId,
          templateName: template?.name || 'Unknown',
          templateType: template?.type || 'unknown',
          count: f._count,
        };
      });

      // Get recent failures
      const recentFailures = await prisma.communication.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          retryCount: true,
          createdAt: true,
          template: {
            select: {
              name: true,
              type: true,
            },
          },
          application: {
            select: {
              candidate: {
                select: {
                  email: true,
                },
              },
            },
          },
        },
      });

      const totalSent = sentCount + deliveredCount;
      const totalAttempted = failedCount + totalSent;
      const failureRate = totalAttempted > 0 ? (failedCount / totalAttempted) * 100 : 0;

      logger.info(
        {
          userId: req.user?.id,
          failedCount,
          sentCount,
          failureRate,
        },
        'Admin viewed email DLQ stats'
      );

      res.status(200).json({
        total: {
          failed: failedCount,
          sent: sentCount,
          queued: queuedCount,
          delivered: deliveredCount,
        },
        failureRate: Number(failureRate.toFixed(2)),
        failedByTemplate: failedByTemplateWithNames,
        recentFailures: recentFailures.map((f) => ({
          id: f.id,
          retryCount: f.retryCount,
          createdAt: f.createdAt,
          templateName: f.template.name,
          templateType: f.template.type,
          recipientEmail: f.application.candidate.email,
        })),
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId: req.user?.id,
        },
        'Failed to fetch email DLQ stats'
      );

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch email DLQ stats',
        },
      });
    }
  }
);

/**
 * POST /api/admin/email-dlq/:id/retry
 * Manually retry a failed email delivery
 * 
 * Re-queues the communication for email delivery with a fresh idempotency key.
 * 
 * @security OWASP A01 - Requires admin role
 * @security OWASP A03 - Validates communication ID before processing
 */
router.post(
  '/:id/retry',
  authenticate,
  authorize(['admin']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Fetch communication with all required data
      const communication = await prisma.communication.findUnique({
        where: { id },
        include: {
          template: true,
          application: {
            include: {
              candidate: true,
              requisition: true,
            },
          },
        },
      });

      if (!communication) {
        return res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Communication not found',
          },
        });
      }

      if (communication.status !== 'failed') {
        return res.status(400).json({
          error: {
            code: 'INVALID_STATUS',
            message: 'Only failed communications can be retried',
            currentStatus: communication.status,
          },
        });
      }

      // Reset communication status to queued
      await prisma.communication.update({
        where: { id },
        data: {
          status: 'queued',
          retryCount: 0,
        },
      });

      // Generate new idempotency key for manual retry
      const idempotencyKey = generateEmailIdempotencyKey(
        'manual_retry',
        id,
        communication.application.candidate.email
      );

      // Re-enqueue job with basic token data
      // Note: This uses minimal token data. Consider storing original tokens if needed.
      await enqueueEmailDelivery({
        communicationId: id,
        to: communication.application.candidate.email,
        templateType: communication.template.type,
        templateId: communication.templateId,
        tokenData: {
          candidateName: communication.application.candidate.fullName || 'Candidate',
          requisitionTitle: communication.application.requisition?.title || 'Position',
        },
        idempotencyKey,
        eventType: 'manual_retry',
        entityId: id,
      });

      logger.info(
        {
          communicationId: id,
          adminId: req.user?.id,
          adminEmail: req.user?.email,
        },
        'Manual email retry triggered by admin'
      );

      res.status(200).json({
        success: true,
        message: 'Email delivery re-enqueued successfully',
        communicationId: id,
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          communicationId: req.params.id,
          userId: req.user?.id,
        },
        'Failed to retry failed email'
      );

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retry email delivery',
        },
      });
    }
  }
);

export default router;
