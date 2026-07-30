import { CommunicationStatus } from '@prisma/client';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';
import { auditEvent } from './auditService';
import { AUDIT_EVENT_TYPES } from '../constants/auditEventTypes';

const STATUS_AUDIT_EVENT_MAP: Partial<Record<CommunicationStatus, string>> = {
  queued: AUDIT_EVENT_TYPES.COMMUNICATION_QUEUED,
  sent: AUDIT_EVENT_TYPES.COMMUNICATION_SENT,
  failed: AUDIT_EVENT_TYPES.COMMUNICATION_FAILED,
};

/**
 * Data for updating communication status.
 */
export interface UpdateCommunicationStatusData {
  status: CommunicationStatus;
  messageId?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  retryCount?: number;
}

/**
 * Update the status of a Communication record.
 * 
 * Used by email delivery worker to track delivery progress.
 * 
 * @param communicationId - UUID of the communication record
 * @param data - Status update data
 * 
 * @security OWASP A09 - Logs only metadata, not message content
 * 
 * @example
 * ```typescript
 * await updateCommunicationStatus('comm-123', {
 *   status: 'sent',
 *   messageId: 'msg_abc',
 *   sentAt: new Date(),
 *   retryCount: 0
 * });
 * ```
 */
export async function updateCommunicationStatus(
  communicationId: string,
  data: UpdateCommunicationStatusData
): Promise<void> {
  await prisma.communication.update({
    where: { id: communicationId },
    data,
  });

  logger.debug(
    {
      communicationId,
      status: data.status,
      messageId: data.messageId,
      retryCount: data.retryCount,
    },
    'Communication status updated'
  );

  const statusEventType = STATUS_AUDIT_EVENT_MAP[data.status];
  if (!statusEventType) {
    return;
  }

  await auditEvent({
    eventType: statusEventType,
    entityType: 'communication',
    entityId: communicationId,
    payload: {
      status: data.status,
      messageId: data.messageId,
      retryCount: data.retryCount,
      sentAt: data.sentAt?.toISOString(),
      deliveredAt: data.deliveredAt?.toISOString(),
    },
  });
}

/**
 * Update the retry count of a Communication record.
 * 
 * Called by email delivery worker on each retry attempt.
 * 
 * @param communicationId - UUID of the communication record
 * @param retryCount - Current retry attempt count
 * 
 * @example
 * ```typescript
 * await updateCommunicationRetryCount('comm-123', 2);
 * ```
 */
export async function updateCommunicationRetryCount(
  communicationId: string,
  retryCount: number
): Promise<void> {
  await prisma.communication.update({
    where: { id: communicationId },
    data: { retryCount },
  });

  logger.debug(
    { communicationId, retryCount },
    'Communication retry count updated'
  );

  await auditEvent({
    eventType: AUDIT_EVENT_TYPES.COMMUNICATION_RETRY,
    entityType: 'communication',
    entityId: communicationId,
    payload: {
      retryCount,
    },
  });
}

/**
 * Get a Communication record by ID.
 * 
 * @param communicationId - UUID of the communication record
 * @returns Communication record or null if not found
 */
export async function getCommunication(communicationId: string) {
  return prisma.communication.findUnique({
    where: { id: communicationId },
    include: {
      template: true,
      application: true,
    },
  });
}
