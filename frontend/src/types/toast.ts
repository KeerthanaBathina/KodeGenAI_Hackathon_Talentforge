import { NotificationEventType } from './notification';

/**
 * Toast Type
 * 
 * Defines the visual style and behavior of a toast notification.
 */
export type ToastType = 'info' | 'success' | 'warning' | 'error';

/**
 * Toast Interface
 * 
 * Represents a temporary notification displayed in the UI.
 */
export interface Toast {
  /** Unique identifier for the toast */
  id: string;

  /** Toast title (short) */
  title: string;

  /** Toast message (detailed) */
  message: string;

  /** Visual type/severity */
  type: ToastType;

  /** Optional URL to navigate to when clicked */
  actionUrl?: string;

  /** Auto-dismiss duration in milliseconds (default: 5000) */
  duration?: number;
}

/**
 * Important Notification Event Types
 * 
 * Only these notification types trigger toast notifications.
 * Other events appear only in the notification panel.
 */
export const TOAST_ENABLED_EVENTS: Set<NotificationEventType> = new Set([
  NotificationEventType.OFFER_APPROVED,
  NotificationEventType.OFFER_EXTENDED,
  NotificationEventType.INTERVIEW_SCHEDULED,
  NotificationEventType.SLA_WARNING,
  NotificationEventType.PATH_OVERRIDE_REQUESTED,
  NotificationEventType.DECISION_MADE
]);

/**
 * Check if a notification event should trigger a toast
 * 
 * @param eventType - The notification event type
 * @returns True if toast should be shown
 */
export function shouldShowToast(eventType: NotificationEventType): boolean {
  return TOAST_ENABLED_EVENTS.has(eventType);
}

/**
 * Get toast type for a notification event
 * 
 * Maps notification event types to toast visual styles.
 * 
 * @param eventType - The notification event type
 * @returns Toast type (info, success, warning, error)
 */
export function getToastType(eventType: NotificationEventType): ToastType {
  switch (eventType) {
    case NotificationEventType.OFFER_APPROVED:
    case NotificationEventType.OFFER_EXTENDED:
      return 'success';
    case NotificationEventType.SLA_WARNING:
      return 'warning';
    case NotificationEventType.PATH_OVERRIDE_REQUESTED:
      return 'info';
    case NotificationEventType.DECISION_MADE:
      return 'info';
    case NotificationEventType.INTERVIEW_SCHEDULED:
      return 'success';
    default:
      return 'info';
  }
}
