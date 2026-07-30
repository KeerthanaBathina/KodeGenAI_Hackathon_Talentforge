export enum NotificationChannel {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP'
}

export enum NotificationTypeEnum {
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  REVIEW_ASSIGNED = 'REVIEW_ASSIGNED',
  DECISION_MADE = 'DECISION_MADE',
  INTERVIEW_SCHEDULED = 'INTERVIEW_SCHEDULED',
  SCORECARD_SUBMITTED = 'SCORECARD_SUBMITTED',
  OFFER_APPROVED = 'OFFER_APPROVED',
  OFFER_EXTENDED = 'OFFER_EXTENDED',
  SLA_WARNING = 'SLA_WARNING',
  PATH_OVERRIDE_REQUESTED = 'PATH_OVERRIDE_REQUESTED'
}

export interface NotificationPreference {
  id: string;
  userId: string;
  notificationType: NotificationTypeEnum;
  channel: NotificationChannel;
  enabled: boolean;
  isSystemCritical: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PreferenceUpdate {
  notificationType: NotificationTypeEnum;
  channel: NotificationChannel;
  enabled: boolean;
}

// Human-readable labels for notification types
export const NOTIFICATION_TYPE_LABELS: Record<NotificationTypeEnum, string> = {
  [NotificationTypeEnum.APPLICATION_SUBMITTED]: 'Application Submitted',
  [NotificationTypeEnum.REVIEW_ASSIGNED]: 'Review Assigned to You',
  [NotificationTypeEnum.DECISION_MADE]: 'Decision Made on Application',
  [NotificationTypeEnum.INTERVIEW_SCHEDULED]: 'Interview Scheduled',
  [NotificationTypeEnum.SCORECARD_SUBMITTED]: 'Scorecard Submitted',
  [NotificationTypeEnum.OFFER_APPROVED]: 'Offer Approved',
  [NotificationTypeEnum.OFFER_EXTENDED]: 'Offer Extended to Candidate',
  [NotificationTypeEnum.SLA_WARNING]: 'SLA Warning',
  [NotificationTypeEnum.PATH_OVERRIDE_REQUESTED]: 'Path Override Requested'
};
