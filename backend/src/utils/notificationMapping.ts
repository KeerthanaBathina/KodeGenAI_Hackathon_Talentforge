import { NotificationEventType } from '../types/notification';
import { NotificationTypeEnum } from '@prisma/client';

/**
 * Map NotificationEventType string to Prisma NotificationTypeEnum
 * 
 * Converts lowercase snake_case event types (used in notification storage)
 * to uppercase SCREAMING_SNAKE_CASE enum values (used in preference system).
 */
export function mapEventTypeToEnum(eventType: NotificationEventType): NotificationTypeEnum {
  const mapping: Record<NotificationEventType, NotificationTypeEnum> = {
    [NotificationEventType.APPLICATION_SUBMITTED]: NotificationTypeEnum.APPLICATION_SUBMITTED,
    [NotificationEventType.REVIEW_ASSIGNED]: NotificationTypeEnum.REVIEW_ASSIGNED,
    [NotificationEventType.DECISION_MADE]: NotificationTypeEnum.DECISION_MADE,
    [NotificationEventType.INTERVIEW_SCHEDULED]: NotificationTypeEnum.INTERVIEW_SCHEDULED,
    [NotificationEventType.SCORECARD_SUBMITTED]: NotificationTypeEnum.SCORECARD_SUBMITTED,
    [NotificationEventType.OFFER_APPROVED]: NotificationTypeEnum.OFFER_APPROVED,
    [NotificationEventType.OFFER_EXTENDED]: NotificationTypeEnum.OFFER_EXTENDED,
    [NotificationEventType.SLA_WARNING]: NotificationTypeEnum.SLA_WARNING,
    [NotificationEventType.PATH_OVERRIDE_REQUESTED]: NotificationTypeEnum.PATH_OVERRIDE_REQUESTED
  };

  return mapping[eventType];
}
