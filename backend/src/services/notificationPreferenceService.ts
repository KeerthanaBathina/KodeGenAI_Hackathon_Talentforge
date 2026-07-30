import { prisma } from '../db/prisma';
import {
  NotificationChannel,
  NotificationTypeEnum,
  NotificationPreference
} from '@prisma/client';
import { isSystemCritical } from '../utils/notificationPreferences';
import logger from '../utils/logger';

/**
 * Get all notification preferences for a user
 */
export async function getUserPreferences(
  userId: string
): Promise<NotificationPreference[]> {
  return prisma.notificationPreference.findMany({
    where: { userId },
    orderBy: [
      { notificationType: 'asc' },
      { channel: 'asc' }
    ]
  });
}

/**
 * Get a specific preference for a user
 */
export async function getPreference(
  userId: string,
  notificationType: NotificationTypeEnum,
  channel: NotificationChannel
): Promise<NotificationPreference | null> {
  return prisma.notificationPreference.findUnique({
    where: {
      user_notification_channel_unique: {
        userId,
        notificationType,
        channel
      }
    }
  });
}

/**
 * Update a single notification preference
 * System-critical types cannot be disabled
 */
export async function updatePreference(
  userId: string,
  notificationType: NotificationTypeEnum,
  channel: NotificationChannel,
  enabled: boolean
): Promise<NotificationPreference> {
  // Check if type is system-critical
  if (isSystemCritical(notificationType) && !enabled) {
    throw new Error(
      `Cannot disable system-critical notification type: ${notificationType}`
    );
  }

  // Upsert preference (create if doesn't exist)
  const preference = await prisma.notificationPreference.upsert({
    where: {
      user_notification_channel_unique: {
        userId,
        notificationType,
        channel
      }
    },
    update: { enabled },
    create: {
      userId,
      notificationType,
      channel,
      enabled
    }
  });

  logger.info(
    { userId, notificationType, channel, enabled },
    '[notificationPreferenceService] Preference updated'
  );

  return preference;
}

/**
 * Bulk update notification preferences
 * Returns count of updated preferences
 */
export async function bulkUpdatePreferences(
  userId: string,
  updates: Array<{
    notificationType: NotificationTypeEnum;
    channel: NotificationChannel;
    enabled: boolean;
  }>
): Promise<number> {
  // Filter out system-critical types trying to be disabled
  const validUpdates = updates.filter(update => {
    if (isSystemCritical(update.notificationType) && !update.enabled) {
      logger.warn(
        { userId, notificationType: update.notificationType },
        '[notificationPreferenceService] Blocked attempt to disable system-critical type'
      );
      return false;
    }
    return true;
  });

  // Perform updates in transaction
  const results = await prisma.$transaction(
    validUpdates.map(update =>
      prisma.notificationPreference.upsert({
        where: {
          user_notification_channel_unique: {
            userId,
            notificationType: update.notificationType,
            channel: update.channel
          }
        },
        update: { enabled: update.enabled },
        create: {
          userId,
          notificationType: update.notificationType,
          channel: update.channel,
          enabled: update.enabled
        }
      })
    )
  );

  logger.info(
    { userId, updateCount: results.length },
    '[notificationPreferenceService] Bulk preferences updated'
  );

  return results.length;
}

/**
 * Initialize default preferences for a new user
 * Creates enabled preferences for all notification types and channels
 */
export async function initializeDefaultPreferences(
  userId: string
): Promise<number> {
  const allTypes = Object.values(NotificationTypeEnum);
  const allChannels = Object.values(NotificationChannel);

  const defaultPreferences = allTypes.flatMap(type =>
    allChannels.map(channel => ({
      userId,
      notificationType: type,
      channel,
      enabled: true
    }))
  );

  const result = await prisma.notificationPreference.createMany({
    data: defaultPreferences,
    skipDuplicates: true
  });

  logger.info(
    { userId, createdCount: result.count },
    '[notificationPreferenceService] Default preferences initialized'
  );

  return result.count;
}

/**
 * Check if a notification should be sent to a user
 * Returns true if:
 * - Notification type is system-critical (always send)
 * - User has preference enabled for this type/channel
 * - User has no preference record (default to enabled)
 */
export async function shouldSendNotification(
  userId: string,
  notificationType: NotificationTypeEnum,
  channel: NotificationChannel
): Promise<boolean> {
  // System-critical types are always sent
  if (isSystemCritical(notificationType)) {
    return true;
  }

  // Look up user preference
  const preference = await getPreference(userId, notificationType, channel);

  // If no preference record exists, default to enabled
  if (!preference) {
    logger.warn(
      { userId, notificationType, channel },
      '[notificationPreferenceService] No preference found, defaulting to enabled'
    );
    return true;
  }

  return preference.enabled;
}

/**
 * Get preferences grouped by notification type
 * Returns map of notification type to channel preferences
 */
export async function getPreferencesGroupedByType(
  userId: string
): Promise<Map<NotificationTypeEnum, Map<NotificationChannel, boolean>>> {
  const preferences = await getUserPreferences(userId);

  const grouped = new Map<NotificationTypeEnum, Map<NotificationChannel, boolean>>();

  for (const pref of preferences) {
    if (!grouped.has(pref.notificationType)) {
      grouped.set(pref.notificationType, new Map());
    }
    grouped.get(pref.notificationType)!.set(pref.channel, pref.enabled);
  }

  return grouped;
}
