import { Prisma } from '@prisma/client';
import express, { type NextFunction, type Request, type Response } from 'express';
import { prisma } from '../db/prisma';
import { authenticate } from '../middleware/authenticate';
import logger from '../utils/logger';

const router = express.Router();
const MAX_NOTIFICATIONS = 100;

type NotificationRecord = {
  id: string;
  userId: string;
  eventType: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
};

function toNotificationResponse(record: NotificationRecord) {
  return {
    id: record.id,
    userId: record.userId,
    eventType: record.eventType,
    payload: record.payload,
    readAt: record.readAt ? record.readAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

function isSchemaCompatibilityError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  return error.code === 'P2021' || error.code === 'P2022';
}

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_NOTIFICATIONS,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    res.json({
      notifications: notifications.map((notification) =>
        toNotificationResponse(notification as NotificationRecord),
      ),
      unreadCount,
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      logger.warn({ error }, 'Notification schema mismatch detected. Returning empty notifications payload.');
      res.json({ notifications: [], unreadCount: 0 });
      return;
    }

    next(error);
  }
});

router.post(
  '/:notificationId/read',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
          },
        });
        return;
      }

      const { notificationId } = req.params;
      const existing = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
      });

      if (!existing) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Notification not found',
          },
        });
        return;
      }

      const notification = existing.readAt
        ? existing
        : await prisma.notification.update({
            where: { id: notificationId },
            data: { readAt: new Date() },
          });

      res.json({ notification: toNotificationResponse(notification as NotificationRecord) });
    } catch (error) {
      if (isSchemaCompatibilityError(error)) {
        logger.warn({ error }, 'Notification schema mismatch detected. Skipping mark-as-read operation.');
        res.json({ success: true });
        return;
      }

      next(error);
    }
  },
);

router.post('/read-all', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    res.json({ success: true, updatedCount: result.count });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      logger.warn({ error }, 'Notification schema mismatch detected. Skipping mark-all-as-read operation.');
      res.json({ success: true, updatedCount: 0 });
      return;
    }

    next(error);
  }
});

export default router;
