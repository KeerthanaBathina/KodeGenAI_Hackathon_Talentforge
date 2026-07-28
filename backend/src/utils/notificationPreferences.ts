import { NotificationTypeEnum } from '@prisma/client';

/**
 * Notification types that cannot be disabled by users.
 * These are critical for security or system operation.
 */
export const SYSTEM_CRITICAL_NOTIFICATION_TYPES: Set<NotificationTypeEnum> = new Set([
  // Reserved for future security alerts
  // Example: NotificationTypeEnum.SECURITY_ALERT
]);

/**
 * Check if a notification type is system-critical (cannot be disabled)
 */
export function isSystemCritical(notificationType: NotificationTypeEnum): boolean {
  return SYSTEM_CRITICAL_NOTIFICATION_TYPES.has(notificationType);
}

/**
 * Get all notification types that can be user-configured
 */
export function getConfigurableNotificationTypes(): NotificationTypeEnum[] {
  return Object.values(NotificationTypeEnum).filter(
    type => !isSystemCritical(type)
  );
}
