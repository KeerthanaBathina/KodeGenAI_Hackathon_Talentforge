import { prisma } from '../db/prisma';
import { Notification, NotificationChannel } from '@prisma/client';
import { NotificationEventType, NotificationPayload } from '../types/notification';
import logger from '../utils/logger';
import { shouldSendNotification } from './notificationPreferenceService';
import { mapEventTypeToEnum } from '../utils/notificationMapping';

/**
 * Create a new notification for a user
 * 
 * Checks user's notification preferences before creating.
 * Returns null if user has disabled IN_APP notifications for this type.
 * 
 * @param userId - UUID of the user to notify
 * @param eventType - Type of event triggering the notification
 * @param payload - Notification content and metadata
 * @returns Created notification record, or null if skipped due to preferences
 */
export async function createNotification(
  userId: string,
  eventType: NotificationEventType,
  payload: NotificationPayload
): Promise<Notification | null> {
  // Map event type to enum for preference check
  const typeEnum = mapEventTypeToEnum(eventType);
  
  // Check if user wants in-app notifications for this type
  const shouldSend = await shouldSendNotification(
    userId,
    typeEnum,
    NotificationChannel.IN_APP
  );
  
  if (!shouldSend) {
    logger.info(
      { userId, eventType },
      '[notificationService] Skipped notification creation (user preference disabled)'
    );
    return null;
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      eventType,
      payload: payload as any // Prisma JsonValue type
    }
  });

  logger.info(
    { userId, eventType, notificationId: notification.id },
    '[notificationService] Notification created'
  );

  return notification;
}

/**
 * Get count of unread notifications for a user
 * 
 * @param userId - UUID of the user
 * @returns Number of unread notifications
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      readAt: null
    }
  });
}

/**
 * Get paginated list of notifications for a user
 * 
 * @param userId - UUID of the user
 * @param limit - Maximum number of notifications to return (default: 50)
 * @param offset - Number of notifications to skip for pagination (default: 0)
 * @returns Array of notification records, ordered by newest first
 */
export async function getNotifications(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset
  });
}

/**
 * Mark a single notification as read
 * 
 * Security: Uses updateMany to ensure user owns the notification
 * 
 * @param notificationId - UUID of the notification
 * @param userId - UUID of the user (for ownership validation)
 */
export async function markAsRead(
  notificationId: string,
  userId: string
): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId // Security: ensure user owns notification
    },
    data: {
      readAt: new Date()
    }
  });

  if (result.count > 0) {
    logger.info(
      { notificationId, userId },
      '[notificationService] Notification marked as read'
    );
  }
}

/**
 * Mark all unread notifications as read for a user
 * 
 * @param userId - UUID of the user
 * @returns Number of notifications marked as read
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });

  if (result.count > 0) {
    logger.info(
      { userId, count: result.count },
      '[notificationService] All notifications marked as read'
    );
  }

  return result.count;
}

/**
 * Delete a notification
 * 
 * Security: Uses deleteMany to ensure user owns the notification
 * 
 * @param notificationId - UUID of the notification
 * @param userId - UUID of the user (for ownership validation)
 */
export async function deleteNotification(
  notificationId: string,
  userId: string
): Promise<void> {
  const result = await prisma.notification.deleteMany({
    where: {
      id: notificationId,
      userId // Security: ensure user owns notification
    }
  });

  if (result.count > 0) {
    logger.info(
      { notificationId, userId },
      '[notificationService] Notification deleted'
    );
  }
}
