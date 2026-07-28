import { NotificationChannel, NotificationTypeEnum } from '@prisma/client';

export interface NotificationPreferenceDTO {
  id: string;
  userId: string;
  notificationType: NotificationTypeEnum;
  channel: NotificationChannel;
  enabled: boolean;
  isSystemCritical: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePreferenceRequest {
  notificationType: NotificationTypeEnum;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface BulkUpdatePreferencesRequest {
  preferences: UpdatePreferenceRequest[];
}
