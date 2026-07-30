import prisma from '../db/prisma';
import { env } from '../config/env';
import { auditService } from './auditService';
import logger from '../utils/logger';

export type GdprErasureRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface GdprErasureRequestRecord {
  id: string;
  candidateId: string;
  requestedAt: Date;
  dueAt: Date;
  status: GdprErasureRequestStatus;
  processedAt: Date | null;
  failureReason: string | null;
  requestReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmitGdprErasureRequestInput {
  candidateId: string;
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestReason?: string | null;
}

export interface SubmitGdprErasureRequestResult {
  request: GdprErasureRequestRecord;
  idempotent: boolean;
}

export interface UpdateGdprErasureRequestStatusInput {
  requestId: string;
  status: GdprErasureRequestStatus;
  actorId?: string | null;
  actorRole?: string | null;
  failureReason?: string | null;
}

export class GdprErasureRequestError extends Error {
  constructor(
    message: string,
    public code: 'CANDIDATE_NOT_FOUND' | 'ERASURE_REQUEST_NOT_FOUND' | 'INVALID_STATUS_TRANSITION' | 'FAILURE_REASON_REQUIRED'
  ) {
    super(message);
    this.name = 'GdprErasureRequestError';
  }
}

const STATUS_TRANSITIONS: Record<GdprErasureRequestStatus, GdprErasureRequestStatus[]> = {
  pending: ['processing', 'completed', 'failed'],
  processing: ['completed', 'failed'],
  completed: [],
  failed: ['processing']
};

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

function getGdprErasureRequestModel() {
  return (prisma as unknown as {
    gdprErasureRequest: {
      findFirst: (args: unknown) => Promise<GdprErasureRequestRecord | null>;
      findUnique: (args: unknown) => Promise<GdprErasureRequestRecord | null>;
      create: (args: unknown) => Promise<GdprErasureRequestRecord>;
      update: (args: unknown) => Promise<GdprErasureRequestRecord>;
    };
  }).gdprErasureRequest;
}

export function calculateErasureDueAt(requestedAt: Date): Date {
  const dueAt = new Date(requestedAt);
  dueAt.setUTCDate(dueAt.getUTCDate() + env.GDPR_ANONYMIZATION_SLA_DAYS);
  return dueAt;
}

async function logRequestEvent(input: {
  eventType: string;
  request: Pick<GdprErasureRequestRecord, 'id' | 'candidateId' | 'status' | 'dueAt' | 'requestedAt' | 'processedAt'>;
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await auditService.logEvent({
    eventType: input.eventType,
    actorId: input.actorId ?? input.request.candidateId,
    actorRole: input.actorRole ?? 'candidate',
    entityType: 'gdpr_erasure_request',
    entityId: input.request.id,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    payload: {
      candidateId: input.request.candidateId,
      status: input.request.status,
      requestedAt: input.request.requestedAt.toISOString(),
      dueAt: input.request.dueAt.toISOString(),
      processedAt: input.request.processedAt?.toISOString() ?? null,
      ...(input.metadata || {})
    }
  });
}

export async function submitGdprErasureRequest(
  input: SubmitGdprErasureRequestInput
): Promise<SubmitGdprErasureRequestResult> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: input.candidateId },
    select: { id: true }
  });

  if (!candidate) {
    throw new GdprErasureRequestError('Candidate not found', 'CANDIDATE_NOT_FOUND');
  }

  const gdprErasureRequestModel = getGdprErasureRequestModel();
  const existingPending = await gdprErasureRequestModel.findFirst({
    where: {
      candidateId: input.candidateId,
      status: 'pending'
    },
    orderBy: {
      requestedAt: 'desc'
    }
  });

  if (existingPending) {
    await logRequestEvent({
      eventType: 'gdpr.erasure_request.idempotent_submission',
      request: existingPending,
      actorId: input.actorId,
      actorRole: input.actorRole,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        idempotent: true
      }
    });

    return {
      request: existingPending,
      idempotent: true
    };
  }

  const requestedAt = new Date();
  const dueAt = calculateErasureDueAt(requestedAt);
  const requestReason = normalizeOptionalText(input.requestReason);

  try {
    const created = await gdprErasureRequestModel.create({
      data: {
        candidateId: input.candidateId,
        requestedAt,
        dueAt,
        status: 'pending',
        requestReason
      }
    });

    await logRequestEvent({
      eventType: 'gdpr.erasure_request.created',
      request: created,
      actorId: input.actorId,
      actorRole: input.actorRole,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        idempotent: false,
        requestReason
      }
    });

    return {
      request: created,
      idempotent: false
    };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) {
      throw error;
    }

    logger.warn(
      {
        candidateId: input.candidateId,
        error
      },
      'Concurrent erasure request submission detected, returning existing pending request'
    );

    const pendingAfterConflict = await gdprErasureRequestModel.findFirst({
      where: {
        candidateId: input.candidateId,
        status: 'pending'
      },
      orderBy: {
        requestedAt: 'desc'
      }
    });

    if (!pendingAfterConflict) {
      throw error;
    }

    await logRequestEvent({
      eventType: 'gdpr.erasure_request.idempotent_submission',
      request: pendingAfterConflict,
      actorId: input.actorId,
      actorRole: input.actorRole,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: {
        idempotent: true,
        conflictResolved: true
      }
    });

    return {
      request: pendingAfterConflict,
      idempotent: true
    };
  }
}

export async function updateGdprErasureRequestStatus(
  input: UpdateGdprErasureRequestStatusInput
): Promise<GdprErasureRequestRecord> {
  const gdprErasureRequestModel = getGdprErasureRequestModel();
  const existing = await gdprErasureRequestModel.findUnique({
    where: { id: input.requestId }
  });

  if (!existing) {
    throw new GdprErasureRequestError('Erasure request not found', 'ERASURE_REQUEST_NOT_FOUND');
  }

  if (existing.status !== input.status) {
    const allowedNextStatuses = STATUS_TRANSITIONS[existing.status];
    if (!allowedNextStatuses.includes(input.status)) {
      throw new GdprErasureRequestError(
        `Invalid erasure request status transition: ${existing.status} -> ${input.status}`,
        'INVALID_STATUS_TRANSITION'
      );
    }
  }

  const failureReason = normalizeOptionalText(input.failureReason);
  if (input.status === 'failed' && !failureReason) {
    throw new GdprErasureRequestError('Failure reason is required when marking request as failed', 'FAILURE_REASON_REQUIRED');
  }

  const isTerminalStatus = input.status === 'completed' || input.status === 'failed';
  const processedAt = isTerminalStatus ? new Date() : null;

  const updated = await gdprErasureRequestModel.update({
    where: { id: input.requestId },
    data: {
      status: input.status,
      processedAt,
      failureReason: input.status === 'failed' ? failureReason : null
    }
  });

  await logRequestEvent({
    eventType: 'gdpr.erasure_request.status_updated',
    request: updated,
    actorId: input.actorId,
    actorRole: input.actorRole,
    metadata: {
      previousStatus: existing.status,
      nextStatus: input.status,
      failureReason: updated.failureReason
    }
  });

  return updated;
}
