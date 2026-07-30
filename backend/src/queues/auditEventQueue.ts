import { createHash } from 'crypto';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';
import type { PersistableAuditEventInput } from '../services/auditService';
import logger from '../utils/logger';

export const AUDIT_EVENT_QUEUE_NAME = 'audit-events';
export const AUDIT_EVENT_DEAD_LETTER_QUEUE_NAME = 'audit-events-dead-letter';
export const AUDIT_EVENT_JOB_NAME = 'persist-audit-event';
const AUDIT_EVENT_JOB_ATTEMPTS = 5;
const AUDIT_EVENT_JOB_BACKOFF_DELAY_MS = 1000;
const DUPLICATE_JOB_ERROR_PATTERNS = ['jobid', 'already exists', 'already waiting', 'duplicated'];

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null
});

export interface AuditEventQueueJobData {
  event: PersistableAuditEventInput;
  idempotencyKey?: string;
  requestedAt?: string;
  source?: string;
}

export interface AuditEventDeadLetterJobData extends AuditEventQueueJobData {
  originalJobId: string;
  failedReason: string;
  failedAt: string;
  attemptsMade: number;
}

interface AuditQueueTelemetryState {
  enqueueSuccess: number;
  enqueueFailure: number;
  enqueueDuplicateSuppressed: number;
}

const auditQueueTelemetry: AuditQueueTelemetryState = {
  enqueueSuccess: 0,
  enqueueFailure: 0,
  enqueueDuplicateSuppressed: 0
};

export const auditEventQueue = new Queue<AuditEventQueueJobData>(AUDIT_EVENT_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: AUDIT_EVENT_JOB_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: AUDIT_EVENT_JOB_BACKOFF_DELAY_MS
    },
    removeOnComplete: {
      age: 86400,
      count: 10000
    },
    removeOnFail: false
  }
});

export const auditEventDeadLetterQueue = new Queue<AuditEventDeadLetterJobData>(
  AUDIT_EVENT_DEAD_LETTER_QUEUE_NAME,
  {
    connection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false
    }
  }
);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (!isObject(value)) {
    return JSON.stringify(value);
  }

  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isDuplicateJobError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return DUPLICATE_JOB_ERROR_PATTERNS.some((segment) => message.includes(segment))
    || (message.includes('job') && message.includes('exists'));
}

function logQueueTelemetry(eventType: string, outcome: 'success' | 'failure' | 'duplicate_suppressed'): void {
  logger.info(
    {
      metric: 'audit_queue_enqueue',
      outcome,
      eventType,
      enqueueSuccess: auditQueueTelemetry.enqueueSuccess,
      enqueueFailure: auditQueueTelemetry.enqueueFailure,
      enqueueDuplicateSuppressed: auditQueueTelemetry.enqueueDuplicateSuppressed
    },
    'Audit queue enqueue telemetry'
  );
}

function assertValidAuditEventPayload(event: PersistableAuditEventInput): void {
  if (!event.eventType || event.eventType.trim().length === 0) {
    throw new Error('Audit queue payload requires event.eventType');
  }

  if (!event.entityType || event.entityType.trim().length === 0) {
    throw new Error('Audit queue payload requires event.entityType');
  }

  if (!event.entityId || event.entityId.trim().length === 0) {
    throw new Error('Audit queue payload requires event.entityId');
  }

  if (!isObject(event.payload)) {
    throw new Error('Audit queue payload requires event.payload object');
  }
}

function resolveIdempotencyKey(data: AuditEventQueueJobData): string {
  const explicitKey = normalizeOptionalString(data.idempotencyKey);
  if (explicitKey) {
    return explicitKey;
  }

  const keyMaterial = [
    data.event.eventType,
    data.event.entityType,
    data.event.entityId,
    data.event.actorId ?? 'system',
    stableSerialize(data.event.payload)
  ].join('|');

  return createHash('sha1').update(keyMaterial).digest('hex');
}

export function buildAuditEventJobId(data: AuditEventQueueJobData): string {
  const idempotencyKey = resolveIdempotencyKey(data);
  return `audit-${idempotencyKey}`;
}

export function createAuditEventQueueJobData(
  event: PersistableAuditEventInput,
  options: Pick<AuditEventQueueJobData, 'idempotencyKey' | 'source' | 'requestedAt'> = {}
): AuditEventQueueJobData {
  assertValidAuditEventPayload(event);

  const providedIdempotencyKey = normalizeOptionalString(options.idempotencyKey) ?? undefined;
  const baseData: AuditEventQueueJobData = {
    event,
    idempotencyKey: providedIdempotencyKey,
    source: normalizeOptionalString(options.source) ?? 'auditService',
    requestedAt: normalizeOptionalString(options.requestedAt) ?? new Date().toISOString()
  };

  const resolvedIdempotencyKey = resolveIdempotencyKey(baseData);

  return {
    ...baseData,
    idempotencyKey: resolvedIdempotencyKey
  };
}

export async function enqueueAuditEvent(data: AuditEventQueueJobData): Promise<string> {
  assertValidAuditEventPayload(data.event);

  const jobId = buildAuditEventJobId(data);

  try {
    await auditEventQueue.add(AUDIT_EVENT_JOB_NAME, data, {
      jobId,
      attempts: AUDIT_EVENT_JOB_ATTEMPTS
    });

    auditQueueTelemetry.enqueueSuccess += 1;
    logQueueTelemetry(data.event.eventType, 'success');

    logger.debug(
      {
        jobId,
        eventType: data.event.eventType,
        entityType: data.event.entityType,
        entityId: data.event.entityId,
        idempotencyKey: data.idempotencyKey
      },
      'Audit event job enqueued'
    );
  } catch (error) {
    if (isDuplicateJobError(error)) {
      auditQueueTelemetry.enqueueDuplicateSuppressed += 1;
      logQueueTelemetry(data.event.eventType, 'duplicate_suppressed');

      logger.info(
        {
          jobId,
          eventType: data.event.eventType,
          entityType: data.event.entityType,
          entityId: data.event.entityId,
          idempotencyKey: data.idempotencyKey
        },
        'Audit event duplicate enqueue suppressed'
      );

      return jobId;
    }

    auditQueueTelemetry.enqueueFailure += 1;
    logQueueTelemetry(data.event.eventType, 'failure');

    logger.error(
      {
        jobId,
        eventType: data.event.eventType,
        entityType: data.event.entityType,
        entityId: data.event.entityId,
        error: error instanceof Error ? error.message : String(error)
      },
      'Audit event enqueue failed'
    );

    throw error;
  }

  return jobId;
}

export async function moveAuditEventToDeadLetter(params: {
  originalJobId: string;
  attemptsMade: number;
  failedReason: string;
  data: AuditEventQueueJobData;
}): Promise<string> {
  const deadLetterJobId = `dlq-${params.originalJobId}`;
  const deadLetterPayload: AuditEventDeadLetterJobData = {
    ...params.data,
    originalJobId: params.originalJobId,
    failedReason: params.failedReason,
    failedAt: new Date().toISOString(),
    attemptsMade: params.attemptsMade
  };

  await auditEventDeadLetterQueue.add('dead-letter-audit-event', deadLetterPayload, {
    jobId: deadLetterJobId
  });

  logger.error(
    {
      deadLetterJobId,
      originalJobId: params.originalJobId,
      attemptsMade: params.attemptsMade,
      failedReason: params.failedReason,
      eventType: params.data.event.eventType,
      entityId: params.data.event.entityId
    },
    'Audit event moved to dead-letter queue'
  );

  return deadLetterJobId;
}

export async function closeAuditEventQueues(): Promise<void> {
  await Promise.all([auditEventQueue.close(), auditEventDeadLetterQueue.close()]);
}

export function getAuditQueueTelemetrySnapshot(): AuditQueueTelemetryState {
  return {
    enqueueSuccess: auditQueueTelemetry.enqueueSuccess,
    enqueueFailure: auditQueueTelemetry.enqueueFailure,
    enqueueDuplicateSuppressed: auditQueueTelemetry.enqueueDuplicateSuppressed
  };
}

auditEventQueue.on('error', (error) => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error)
    },
    'Audit event queue error'
  );
});

auditEventDeadLetterQueue.on('error', (error) => {
  logger.error(
    {
      error: error instanceof Error ? error.message : String(error)
    },
    'Audit event dead-letter queue error'
  );
});

export { connection };