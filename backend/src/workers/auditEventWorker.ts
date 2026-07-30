import { Job, Worker } from 'bullmq';
import {
  AUDIT_EVENT_QUEUE_NAME,
  AuditEventQueueJobData,
  connection,
  moveAuditEventToDeadLetter
} from '../queues/auditEventQueue';
import { updateWorkerHeartbeat } from '../services/healthMetricsService';
import { persistAuditEventOrThrow } from '../services/auditService';
import logger from '../utils/logger';

const AUDIT_WORKER_HEARTBEAT_KEY = 'worker:audit:heartbeat';
const DEFAULT_MAX_ATTEMPTS = 5;

interface AuditWorkerTelemetryState {
  processed: number;
  persisted: number;
  duplicateSuppressed: number;
  transientFailures: number;
  permanentFailures: number;
  retryAttemptsObserved: number;
  deadLetterMoves: number;
  deadLetterMoveFailures: number;
}

const auditWorkerTelemetry: AuditWorkerTelemetryState = {
  processed: 0,
  persisted: 0,
  duplicateSuppressed: 0,
  transientFailures: 0,
  permanentFailures: 0,
  retryAttemptsObserved: 0,
  deadLetterMoves: 0,
  deadLetterMoveFailures: 0
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isPermanentAuditFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AuditContractError' || error.name === 'PrismaClientValidationError';
}

export async function processAuditEventJob(job: Job<AuditEventQueueJobData>): Promise<void> {
  auditWorkerTelemetry.processed += 1;

  await updateWorkerHeartbeat(AUDIT_WORKER_HEARTBEAT_KEY);

  logger.debug(
    {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      eventType: job.data.event.eventType,
      entityType: job.data.event.entityType,
      entityId: job.data.event.entityId
    },
    'Processing audit event job'
  );

  try {
    const persistResult = await persistAuditEventOrThrow(job.data.event, {
      idempotencyKey: job.data.idempotencyKey,
      source: job.data.source
    });

    if (persistResult === 'duplicate_suppressed') {
      auditWorkerTelemetry.duplicateSuppressed += 1;

      logger.info(
        {
          metric: 'audit_worker_persist',
          outcome: 'duplicate_suppressed',
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          eventType: job.data.event.eventType,
          entityType: job.data.event.entityType,
          entityId: job.data.event.entityId,
          duplicateSuppressed: auditWorkerTelemetry.duplicateSuppressed
        },
        'Audit worker duplicate persistence suppressed'
      );

      return;
    }

    auditWorkerTelemetry.persisted += 1;

    logger.debug(
      {
        metric: 'audit_worker_persist',
        outcome: 'success',
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        eventType: job.data.event.eventType,
        entityType: job.data.event.entityType,
        entityId: job.data.event.entityId,
        persisted: auditWorkerTelemetry.persisted
      },
      'Audit worker persistence succeeded'
    );
  } catch (error) {
    const failedReason = toErrorMessage(error);

    if (isPermanentAuditFailure(error)) {
      auditWorkerTelemetry.permanentFailures += 1;

      await moveAuditEventToDeadLetter({
        originalJobId: String(job.id ?? `unknown-${Date.now()}`),
        attemptsMade: job.attemptsMade,
        failedReason,
        data: job.data
      });

      auditWorkerTelemetry.deadLetterMoves += 1;

      logger.error(
        {
          metric: 'audit_worker_failure',
          jobId: job.id,
          attemptsMade: job.attemptsMade,
          eventType: job.data.event.eventType,
          entityType: job.data.event.entityType,
          entityId: job.data.event.entityId,
          failedReason,
          failureType: 'permanent',
          permanentFailures: auditWorkerTelemetry.permanentFailures,
          deadLetterMoves: auditWorkerTelemetry.deadLetterMoves
        },
        'Audit event worker encountered permanent failure'
      );

      return;
    }

    auditWorkerTelemetry.transientFailures += 1;
    auditWorkerTelemetry.retryAttemptsObserved += 1;

    logger.warn(
      {
        metric: 'audit_worker_failure',
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        maxAttempts: job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS,
        eventType: job.data.event.eventType,
        entityType: job.data.event.entityType,
        entityId: job.data.event.entityId,
        failedReason,
        failureType: 'transient',
        transientFailures: auditWorkerTelemetry.transientFailures,
        retryAttemptsObserved: auditWorkerTelemetry.retryAttemptsObserved
      },
      'Audit event worker encountered transient failure, will retry'
    );

    throw error;
  }
}

export const auditEventWorker = new Worker<AuditEventQueueJobData>(
  AUDIT_EVENT_QUEUE_NAME,
  processAuditEventJob,
  {
    connection,
    concurrency: 10,
    lockDuration: 30000
  }
);

auditEventWorker.on('completed', (job) => {
  logger.debug(
    {
      jobId: job.id,
      eventType: job.data.event.eventType,
      entityType: job.data.event.entityType,
      entityId: job.data.event.entityId
    },
    'Audit event job completed'
  );
});

auditEventWorker.on('failed', async (job, error) => {
  if (!job) {
    return;
  }

  const attempts = job.opts.attempts ?? DEFAULT_MAX_ATTEMPTS;
  const isFinalAttempt = job.attemptsMade >= attempts;

  logger.error(
    {
      jobId: job.id,
      attemptsMade: job.attemptsMade,
      attempts,
      isFinalAttempt,
      eventType: job.data.event.eventType,
      entityType: job.data.event.entityType,
      entityId: job.data.event.entityId,
      failedReason: error.message
    },
    'Audit event job failed'
  );

  if (!isFinalAttempt) {
    return;
  }

  try {
    await moveAuditEventToDeadLetter({
      originalJobId: String(job.id ?? `unknown-${Date.now()}`),
      attemptsMade: job.attemptsMade,
      failedReason: error.message,
      data: job.data
    });

    auditWorkerTelemetry.deadLetterMoves += 1;

    logger.error(
      {
        metric: 'audit_worker_failure',
        failureType: 'retry_exhausted',
        jobId: job.id,
        eventType: job.data.event.eventType,
        entityId: job.data.event.entityId,
        deadLetterMoves: auditWorkerTelemetry.deadLetterMoves
      },
      'Audit event moved to dead-letter queue after retry exhaustion'
    );
  } catch (deadLetterError) {
    auditWorkerTelemetry.deadLetterMoveFailures += 1;

    logger.error(
      {
        jobId: job.id,
        error: toErrorMessage(deadLetterError),
        metric: 'audit_worker_dead_letter',
        deadLetterMoveFailures: auditWorkerTelemetry.deadLetterMoveFailures
      },
      'Audit event job failed and dead-letter move also failed'
    );
  }
});

auditEventWorker.on('error', (error) => {
  logger.error(
    {
      error: error.message
    },
    'Audit event worker error'
  );
});

export async function shutdownAuditEventWorker(): Promise<void> {
  logger.info('Shutting down audit event worker');
  await auditEventWorker.close();
}

export function getAuditWorkerTelemetrySnapshot(): AuditWorkerTelemetryState {
  return {
    processed: auditWorkerTelemetry.processed,
    persisted: auditWorkerTelemetry.persisted,
    duplicateSuppressed: auditWorkerTelemetry.duplicateSuppressed,
    transientFailures: auditWorkerTelemetry.transientFailures,
    permanentFailures: auditWorkerTelemetry.permanentFailures,
    retryAttemptsObserved: auditWorkerTelemetry.retryAttemptsObserved,
    deadLetterMoves: auditWorkerTelemetry.deadLetterMoves,
    deadLetterMoveFailures: auditWorkerTelemetry.deadLetterMoveFailures
  };
}

export default auditEventWorker;