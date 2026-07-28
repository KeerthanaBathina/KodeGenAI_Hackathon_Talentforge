import { getSocketServer } from '../socket';
import { Notification, NotificationChannel } from '@prisma/client';
import { getUnreadCount, createNotification } from './notificationService';
import { NotificationEventType, NotificationPayload } from '../types/notification';
import logger from '../utils/logger';
import { shouldSendNotification } from './notificationPreferenceService';
import { mapEventTypeToEnum } from '../utils/notificationMapping';

/**
 * Notification Broadcast Payload
 * 
 * Structure of the payload sent via Socket.IO notification:new event
 */
export interface NotificationBroadcastPayload {
  notification: Notification;
  unreadCount: number;
}

/**
 * Broadcast notification to a specific user via Socket.IO
 * 
 * Checks user's notification preferences before broadcasting.
 * Sends notification:new event to user's room with notification object and updated unread count.
 * This is a best-effort operation - failures do not throw errors since notification is persisted in DB.
 * 
 * @param userId - UUID of the user to notify
 * @param notification - Notification record to broadcast
 */
export async function broadcastNotificationToUser(
  userId: string,
  notification: Notification
): Promise<void> {
  try {
    // Map event type to enum for preference check
    const typeEnum = mapEventTypeToEnum(notification.eventType as NotificationEventType);
    
    // Check if user wants in-app notifications for this type
    const shouldSend = await shouldSendNotification(
      userId,
      typeEnum,
      NotificationChannel.IN_APP
    );
    
    if (!shouldSend) {
      logger.info(
        { userId, notificationId: notification.id },
        '[notificationBroadcast] Skipped Socket.IO broadcast (user preference disabled)'
      );
      return;
    }

    const io = getSocketServer();
    const roomName = `user:${userId}`;
    
    // Get updated unread count
    const unreadCount = await getUnreadCount(userId);
    
    const payload: NotificationBroadcastPayload = {
      notification,
      unreadCount
    };
    
    io.to(roomName).emit('notification:new', payload);
    
    logger.info(
      { userId, notificationId: notification.id, roomName, unreadCount },
      '[notificationBroadcast] Notification broadcast to user'
    );
  } catch (error) {
    logger.error(
      { userId, notificationId: notification.id, error },
      '[notificationBroadcast] Failed to broadcast notification'
    );
    // Don't throw - notification persisted in DB, broadcast is best-effort
  }
}

/**
 * Create notification in database and broadcast via Socket.IO
 * 
 * Convenience function that combines notification creation and broadcasting.
 * Notification creation checks user preferences - returns null if disabled.
 * Notification is always persisted to database if preferences allow; broadcast is best-effort.
 * 
 * @param userId - UUID of the user to notify
 * @param eventType - Type of event triggering the notification
 * @param payload - Notification content and metadata
 * @returns Created notification record, or null if skipped due to preferences
 */
export async function createAndBroadcastNotification(
  userId: string,
  eventType: NotificationEventType,
  payload: NotificationPayload
): Promise<Notification | null> {
  // Create notification in database (checks preferences internally)
  const notification = await createNotification(userId, eventType, payload);
  
  // If notification was skipped due to preferences, return null
  if (!notification) {
    return null;
  }
  
  // Broadcast via WebSocket (best-effort, checks preferences internally)
  await broadcastNotificationToUser(userId, notification);
  
  return notification;
}
