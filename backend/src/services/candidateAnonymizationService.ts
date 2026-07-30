import { CandidateStatus } from '@prisma/client';
import prisma from '../db/prisma';
import { auditService } from './auditService';
import logger from '../utils/logger';

const ANONYMIZED_NAME = 'ANONYMISED';
const ANONYMIZATION_VERSION = 'gdpr-v1';
const DEFAULT_PROCESS_LIMIT = 100;

type GdprRequestStatus = 'pending' | 'processing' | 'completed' | 'failed';

type GdprErasureRequestRecord = {
  id: string;
  candidateId: string;
  requestedAt: Date;
  dueAt: Date;
  status: GdprRequestStatus;
  processedAt: Date | null;
  failureReason: string | null;
  requestReason: string | null;
};

type GdprErasureRequestModel = {
  findUnique: (args: unknown) => Promise<GdprErasureRequestRecord | null>;
  findMany: (args: unknown) => Promise<GdprErasureRequestRecord[]>;
  update: (args: unknown) => Promise<GdprErasureRequestRecord>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

export type GdprAnonymizationProcessOutcome =
  | 'completed'
  | 'failed'
  | 'skipped_not_found'
  | 'skipped_already_completed'
  | 'skipped_in_progress'
  | 'skipped_claim_conflict';

export interface GdprAnonymizationProcessResult {
  requestId: string;
  candidateId: string | null;
  outcome: GdprAnonymizationProcessOutcome;
  wasOverdue: boolean;
  failureReason?: string;
}

export interface ProcessPendingGdprErasureRequestsOptions {
  limit?: number;
}

export interface ProcessPendingGdprErasureRequestsResult {
  selectedCount: number;
  completedCount: number;
  failedCount: number;
  skippedCount: number;
  overdueCount: number;
  results: GdprAnonymizationProcessResult[];
}

const NULLIFIED_JSON_KEYS = new Set([
  'phone',
  'phonenumber',
  'mobile',
  'mobilenumber',
  'telephone',
  'contactnumber',
  'address',
  'address1',
  'address2',
  'street',
  'street1',
  'street2',
  'city',
  'state',
  'province',
  'postalcode',
  'postcode',
  'zipcode',
  'zip',
  'country',
  'dateofbirth',
  'birthdate',
  'dob'
]);

const ANONYMIZED_NAME_JSON_KEYS = new Set([
  'fullname',
  'candidatename'
]);

const ANONYMIZED_EMAIL_JSON_KEYS = new Set([
  'email',
  'contactemail',
  'personalemail'
]);

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function redactStructuredPii(value: unknown, anonymizedEmail: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactStructuredPii(entry, anonymizedEmail));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, entryValue] of Object.entries(input)) {
    const normalizedKey = normalizeKey(key);

    if (NULLIFIED_JSON_KEYS.has(normalizedKey)) {
      output[key] = null;
      continue;
    }

    if (ANONYMIZED_NAME_JSON_KEYS.has(normalizedKey)) {
      output[key] = ANONYMIZED_NAME;
      continue;
    }

    if (ANONYMIZED_EMAIL_JSON_KEYS.has(normalizedKey)) {
      output[key] = anonymizedEmail;
      continue;
    }

    output[key] = redactStructuredPii(entryValue, anonymizedEmail);
  }

  return output;
}

function toFailureReason(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Unknown anonymization error';
}

function isProcessableStatus(status: GdprRequestStatus): boolean {
  return status === 'pending' || status === 'failed';
}

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || Number.isNaN(limit)) {
    return DEFAULT_PROCESS_LIMIT;
  }

  return Math.max(1, Math.min(500, Math.floor(limit)));
}

function buildAnonymizedEmail(candidateId: string): string {
  return `anon-${candidateId.toLowerCase()}@redacted`;
}

function getGdprErasureRequestModel(target: unknown): GdprErasureRequestModel {
  const model = (target as { gdprErasureRequest?: GdprErasureRequestModel }).gdprErasureRequest;

  if (
    !model ||
    typeof model.findUnique !== 'function' ||
    typeof model.findMany !== 'function' ||
    typeof model.update !== 'function' ||
    typeof model.updateMany !== 'function'
  ) {
    throw new Error('Prisma client missing gdprErasureRequest model. Run prisma generate after migrations.');
  }

  return model;
}

async function logAnonymizationLifecycleEvent(params: {
  eventType: string;
  request: GdprErasureRequestRecord;
  metadata?: Record<string, unknown>;
  error?: string;
}): Promise<void> {
  const { eventType, request, metadata, error } = params;

  await auditService.logEvent({
    eventType,
    actorId: null,
    actorRole: null,
    resourceType: 'gdpr_erasure_request',
    resourceId: request.id,
    metadata: {
      candidateId: request.candidateId,
      requestedAt: request.requestedAt.toISOString(),
      dueAt: request.dueAt.toISOString(),
      status: request.status,
      ...(metadata ?? {}),
      ...(error ? { error } : {})
    }
  });
}

export async function processGdprErasureRequestById(requestId: string): Promise<GdprAnonymizationProcessResult> {
  const requestModel = getGdprErasureRequestModel(prisma);
  const request = await requestModel.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      candidateId: true,
      requestedAt: true,
      dueAt: true,
      status: true,
      processedAt: true,
      failureReason: true,
      requestReason: true
    }
  });

  if (!request) {
    return {
      requestId,
      candidateId: null,
      outcome: 'skipped_not_found',
      wasOverdue: false
    };
  }

  const now = new Date();
  const wasOverdue = request.dueAt.getTime() < now.getTime();

  if (request.status === 'completed') {
    return {
      requestId: request.id,
      candidateId: request.candidateId,
      outcome: 'skipped_already_completed',
      wasOverdue
    };
  }

  if (request.status === 'processing') {
    return {
      requestId: request.id,
      candidateId: request.candidateId,
      outcome: 'skipped_in_progress',
      wasOverdue
    };
  }

  if (!isProcessableStatus(request.status)) {
    return {
      requestId: request.id,
      candidateId: request.candidateId,
      outcome: 'skipped_claim_conflict',
      wasOverdue
    };
  }

  const claim = await requestModel.updateMany({
    where: {
      id: request.id,
      status: {
        in: ['pending', 'failed']
      }
    },
    data: {
      status: 'processing',
      failureReason: null,
      processedAt: null
    }
  });

  if (claim.count === 0) {
    return {
      requestId: request.id,
      candidateId: request.candidateId,
      outcome: 'skipped_claim_conflict',
      wasOverdue
    };
  }

  const processingRequest: GdprErasureRequestRecord = {
    ...request,
    status: 'processing'
  };

  await logAnonymizationLifecycleEvent({
    eventType: 'gdpr_erasure_processing_started',
    request: processingRequest,
    metadata: {
      wasOverdue
    }
  });

  try {
    const transactionNow = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: request.candidateId },
        include: {
          profile: {
            select: {
              education: true,
              workHistory: true,
              rawParseJson: true
            }
          }
        }
      });

      if (!candidate) {
        throw new Error('Candidate linked to erasure request was not found');
      }

      const anonymizedEmail = buildAnonymizedEmail(candidate.id);
      const anonymisedAt = candidate.anonymisedAt ?? transactionNow;

      await tx.candidate.update({
        where: { id: candidate.id },
        data: {
          status: CandidateStatus.anonymized,
          email: anonymizedEmail,
          phone: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          anonymisedAt,
          anonymisationVersion: ANONYMIZATION_VERSION
        }
      });

      await tx.candidateCredential.deleteMany({
        where: { candidateId: candidate.id }
      });

      await tx.passwordResetToken.updateMany({
        where: {
          candidateId: candidate.id,
          usedAt: null
        },
        data: {
          usedAt: transactionNow
        }
      });

      if (candidate.profile) {
        await tx.profile.update({
          where: { candidateId: candidate.id },
          data: {
            fullName: ANONYMIZED_NAME,
            education: redactStructuredPii(candidate.profile.education, anonymizedEmail) as any,
            workHistory: redactStructuredPii(candidate.profile.workHistory, anonymizedEmail) as any,
            rawParseJson: redactStructuredPii(candidate.profile.rawParseJson, anonymizedEmail) as any,
            editedAt: transactionNow
          }
        });
      }

      await getGdprErasureRequestModel(tx).update({
        where: { id: request.id },
        data: {
          status: 'completed',
          processedAt: transactionNow,
          failureReason: null
        }
      });

      return {
        candidateId: candidate.id,
        anonymizedEmail,
        anonymisedAt,
        processedAt: transactionNow,
        profileUpdated: Boolean(candidate.profile)
      };
    });

    await logAnonymizationLifecycleEvent({
      eventType: 'gdpr_erasure_processing_completed',
      request: {
        ...processingRequest,
        status: 'completed',
        processedAt: result.processedAt,
        failureReason: null
      },
      metadata: {
        wasOverdue,
        profileUpdated: result.profileUpdated,
        anonymizedEmail: result.anonymizedEmail,
        anonymisationVersion: ANONYMIZATION_VERSION
      }
    });

    await auditService.logEvent({
      eventType: 'candidate_anonymized',
      actorId: null,
      actorRole: null,
      resourceType: 'candidate',
      resourceId: result.candidateId,
      metadata: {
        requestId: request.id,
        anonymizedEmail: result.anonymizedEmail,
        anonymisedAt: result.anonymisedAt.toISOString(),
        anonymisationVersion: ANONYMIZATION_VERSION,
        wasOverdue
      }
    });

    logger.info(
      {
        requestId: request.id,
        candidateId: result.candidateId,
        wasOverdue
      },
      'GDPR erasure request processed successfully'
    );

    return {
      requestId: request.id,
      candidateId: result.candidateId,
      outcome: 'completed',
      wasOverdue
    };
  } catch (error) {
    const failureReason = toFailureReason(error);

    await requestModel.update({
      where: { id: request.id },
      data: {
        status: 'failed',
        failureReason,
        processedAt: new Date()
      }
    }).catch((updateError) => {
      logger.error({ updateError, requestId: request.id }, 'Failed to update erasure request to failed');
    });

    await logAnonymizationLifecycleEvent({
      eventType: 'gdpr_erasure_processing_failed',
      request: {
        ...processingRequest,
        status: 'failed',
        failureReason
      },
      metadata: {
        wasOverdue
      },
      error: failureReason
    }).catch((auditError) => {
      logger.error({ auditError, requestId: request.id }, 'Failed to audit erasure request failure');
    });

    logger.error(
      {
        error,
        requestId: request.id,
        candidateId: request.candidateId
      },
      'GDPR erasure request processing failed'
    );

    return {
      requestId: request.id,
      candidateId: request.candidateId,
      outcome: 'failed',
      failureReason,
      wasOverdue
    };
  }
}

export async function processPendingGdprErasureRequests(
  options: ProcessPendingGdprErasureRequestsOptions = {}
): Promise<ProcessPendingGdprErasureRequestsResult> {
  const requestModel = getGdprErasureRequestModel(prisma);
  const limit = clampLimit(options.limit);

  const pendingRequests = await requestModel.findMany({
    where: {
      status: {
        in: ['pending', 'failed']
      }
    },
    orderBy: [
      { dueAt: 'asc' },
      { requestedAt: 'asc' }
    ],
    take: limit,
    select: {
      id: true,
      candidateId: true,
      requestedAt: true,
      dueAt: true,
      status: true,
      processedAt: true,
      failureReason: true,
      requestReason: true
    }
  });

  const results: GdprAnonymizationProcessResult[] = [];

  for (const request of pendingRequests) {
    const result = await processGdprErasureRequestById(request.id);
    results.push(result);
  }

  const completedCount = results.filter((result) => result.outcome === 'completed').length;
  const failedCount = results.filter((result) => result.outcome === 'failed').length;
  const skippedCount = results.length - completedCount - failedCount;
  const overdueCount = results.filter((result) => result.wasOverdue).length;

  return {
    selectedCount: pendingRequests.length,
    completedCount,
    failedCount,
    skippedCount,
    overdueCount,
    results
  };
}
