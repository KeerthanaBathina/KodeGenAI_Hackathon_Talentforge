import { CommunicationStatus } from '@prisma/client';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

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
