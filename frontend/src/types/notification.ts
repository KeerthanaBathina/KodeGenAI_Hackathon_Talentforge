/**
 * Notification Event Types
 * 
 * Enum defining all possible notification event types.
 * Must match backend NotificationEventType enum.
 */
export enum NotificationEventType {
  APPLICATION_SUBMITTED = 'application_submitted',
  REVIEW_ASSIGNED = 'review_assigned',
  DECISION_MADE = 'decision_made',
  INTERVIEW_SCHEDULED = 'interview_scheduled',
  SCORECARD_SUBMITTED = 'scorecard_submitted',
  OFFER_APPROVED = 'offer_approved',
  OFFER_EXTENDED = 'offer_extended',
  SLA_WARNING = 'sla_warning',
  PATH_OVERRIDE_REQUESTED = 'path_override_requested'
}

/**
 * Notification Payload
 * 
 * Structure of the payload stored in notification object.
 * Contains display information and optional navigation link.
 */
export interface NotificationPayload {
  /** Display title for the notification */
  title: string;

  /** Detailed message content */
  message: string;

  /** Type of entity this notification relates to */
  entityType: 'application' | 'interview' | 'offer' | 'review';

  /** UUID of the entity */
  entityId: string;

  /** Optional URL to navigate to when notification clicked */
  actionUrl?: string;
}

/**
 * Notification
 * 
 * Complete notification object received from backend.
 */
export interface Notification {
  id: string;
  userId: string;
  eventType: NotificationEventType;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}
