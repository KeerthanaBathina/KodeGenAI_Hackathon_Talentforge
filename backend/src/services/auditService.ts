import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import prisma from '../db/prisma';
import { resolveCanonicalAuditEventType } from '../constants/auditEventTypes';
import { createAuditEventQueueJobData, enqueueAuditEvent } from '../queues/auditEventQueue';
import logger from '../utils/logger';

export interface CanonicalAuditEventInput {
  actorId?: string | null;
  actorRole?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface LegacyAuditEventInput {
  actorId?: string | null;
  actorRole?: string | null;
  eventType?: string;
  action?: string;
  entityType?: string;
  entityId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export type AuditEventInput = CanonicalAuditEventInput | LegacyAuditEventInput;

const MAX_USER_AGENT_LENGTH = 512;
const MAX_EVENT_TYPE_LENGTH = 100;
const MAX_ENTITY_TYPE_LENGTH = 50;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENABLE_DIRECT_WRITE_FALLBACK_ON_ENQUEUE_FAILURE = true;
const AUDIT_IDEMPOTENCY_PAYLOAD_KEY = 'auditIdempotencyKey';
const AUDIT_BYPASS_ENV_FLAG = 'AUDIT_LOGGING_BYPASS';

export interface PersistableAuditEventInput {
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface PersistAuditEventOptions {
  idempotencyKey?: string;
  source?: string;
}

export type AuditPersistResult = 'created' | 'duplicate_suppressed';

interface AuditTelemetryState {
  enqueueRequested: number;
  enqueueSucceeded: number;
  enqueueFailed: number;
  fallbackWriteSucceeded: number;
  fallbackWriteFailed: number;
  persistAttempted: number;
  persistCreated: number;
  persistDuplicateSuppressed: number;
  persistFailed: number;
}

const auditTelemetryState: AuditTelemetryState = {
  enqueueRequested: 0,
  enqueueSucceeded: 0,
  enqueueFailed: 0,
  fallbackWriteSucceeded: 0,
  fallbackWriteFailed: 0,
  persistAttempted: 0,
  persistCreated: 0,
  persistDuplicateSuppressed: 0,
  persistFailed: 0
};

export class AuditContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditContractError';
  }
}

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

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDeterministicUuid(seed: string): string {
  const hash = createHash('sha1').update(seed).digest('hex').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

function normalizePayload(input: AuditEventInput): Record<string, unknown> {
  const metadataPayload = isObject(input.metadata) ? input.metadata : {};
  const directPayload = isObject(input.payload) ? input.payload : {};

  return {
    ...metadataPayload,
    ...directPayload
  };
}

function applyTruncation(
  value: string,
  maxLength: number,
  payload: Record<string, unknown>,
  payloadKey: string
): string {
  if (value.length <= maxLength) {
    return value;
  }

  payload[payloadKey] = value;
  return value.slice(0, maxLength);
}

function normalizeEntityId(
  rawEntityId: string | null,
  payload: Record<string, unknown>
): string {
  if (!rawEntityId) {
    payload.entityIdMissing = true;
    return NIL_UUID;
  }

  if (UUID_PATTERN.test(rawEntityId)) {
    return rawEntityId;
  }

  payload.entityRef = rawEntityId;
  return toDeterministicUuid(rawEntityId);
}

function normalizeActorId(rawActorId: string | null, payload: Record<string, unknown>): string | null {
  if (!rawActorId) {
    return null;
  }

  if (UUID_PATTERN.test(rawActorId)) {
    return rawActorId;
  }

  payload.actorRef = rawActorId;
  return null;
}

function normalizeAuditInput(input: AuditEventInput): PersistableAuditEventInput {
  const payload = normalizePayload(input);

  const rawEventType = normalizeNullableString(input.eventType ?? input.action ?? null);
  if (!rawEventType) {
    throw new AuditContractError('Audit event type is required (eventType or action).');
  }

  const resolvedEventType = resolveCanonicalAuditEventType(rawEventType);
  const eventType = applyTruncation(
    resolvedEventType.eventType,
    MAX_EVENT_TYPE_LENGTH,
    payload,
    'eventTypeOriginal'
  );

  const rawEntityType = normalizeNullableString(input.entityType ?? input.resourceType ?? null);
  if (!rawEntityType) {
    throw new AuditContractError('Audit entity type is required (entityType or resourceType).');
  }

  const entityType = applyTruncation(rawEntityType, MAX_ENTITY_TYPE_LENGTH, payload, 'entityTypeOriginal');
  const entityId = normalizeEntityId(normalizeNullableString(input.entityId ?? input.resourceId ?? null), payload);

  const rawActorRole = normalizeNullableString(input.actorRole ?? null);
  if (rawActorRole && payload.actorRole === undefined) {
    payload.actorRole = rawActorRole;
  }

  if (resolvedEventType.legacyEventType && payload.legacyEventType === undefined) {
    payload.legacyEventType = resolvedEventType.legacyEventType;
  }

  if (!resolvedEventType.isRegistered && payload.unregisteredEventType === undefined) {
    payload.unregisteredEventType = true;
  }

  const actorId = normalizeActorId(normalizeNullableString(input.actorId ?? null), payload);

  return {
    actorId,
    eventType,
    entityType,
    entityId,
    payload,
    ipAddress: normalizeNullableString(input.ipAddress ?? null),
    userAgent: normalizeNullableString(input.userAgent ?? null)
  };
}

function toCreateData(input: PersistableAuditEventInput): Prisma.AuditEventCreateInput {
  return {
    actor: input.actorId ? { connect: { id: input.actorId } } : undefined,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    payloadJson: input.payload as Prisma.InputJsonValue,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null
  };
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalized = normalizeNullableString(value);
  return normalized ?? undefined;
}

function deriveDeterministicIdempotencyKey(input: PersistableAuditEventInput): string {
  const keyMaterial = [
    input.eventType,
    input.entityType,
    input.entityId,
    input.actorId ?? 'system',
    stableSerialize(input.payload)
  ].join('|');

  return createHash('sha1').update(keyMaterial).digest('hex');
}

function applyIdempotencyKeyToPayload(
  payload: Record<string, unknown>,
  idempotencyKey: string
): Record<string, unknown> {
  if (payload[AUDIT_IDEMPOTENCY_PAYLOAD_KEY] === idempotencyKey) {
    return payload;
  }

  return {
    ...payload,
    [AUDIT_IDEMPOTENCY_PAYLOAD_KEY]: idempotencyKey
  };
}

function emitAuditWriteTelemetry(outcome: 'created' | 'duplicate_suppressed' | 'failed'): void {
  const successLike = auditTelemetryState.persistCreated + auditTelemetryState.persistDuplicateSuppressed;
  const attempts = auditTelemetryState.persistAttempted;
  const successRatePct = attempts === 0 ? 0 : Number(((successLike / attempts) * 100).toFixed(2));

  logger.debug(
    {
      metric: 'audit_write',
      outcome,
      attempts,
      created: auditTelemetryState.persistCreated,
      duplicateSuppressed: auditTelemetryState.persistDuplicateSuppressed,
      failed: auditTelemetryState.persistFailed,
      successRatePct
    },
    'Audit persistence telemetry'
  );
}

function emitAuditEnqueueTelemetry(outcome: 'success' | 'failure'): void {
  logger.debug(
    {
      metric: 'audit_enqueue',
      outcome,
      requested: auditTelemetryState.enqueueRequested,
      succeeded: auditTelemetryState.enqueueSucceeded,
      failed: auditTelemetryState.enqueueFailed,
      fallbackWriteSucceeded: auditTelemetryState.fallbackWriteSucceeded,
      fallbackWriteFailed: auditTelemetryState.fallbackWriteFailed
    },
    'Audit enqueue telemetry'
  );
}

function isAuditBypassed(): boolean {
  return process.env[AUDIT_BYPASS_ENV_FLAG]?.toLowerCase() === 'true';
}

function resolveIdempotencyKey(input: PersistableAuditEventInput): string {
  const potentialKeys = [
    input.payload[AUDIT_IDEMPOTENCY_PAYLOAD_KEY],
    input.payload.idempotencyKey,
    input.payload.requestId,
    input.payload.correlationId
  ];

  for (const value of potentialKeys) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return `${input.eventType}:${trimmed}`;
    }
  }

  return deriveDeterministicIdempotencyKey(input);
}

export async function persistAuditEventOrThrow(
  input: PersistableAuditEventInput,
  options: PersistAuditEventOptions = {}
): Promise<AuditPersistResult> {
  auditTelemetryState.persistAttempted += 1;

  const resolvedIdempotencyKey =
    normalizeOptionalString(options.idempotencyKey) ?? resolveIdempotencyKey(input);
  const payloadWithIdempotency = applyIdempotencyKeyToPayload(input.payload, resolvedIdempotencyKey);

  const duplicate = await prisma.auditEvent.findFirst({
    where: {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadJson: {
        path: [AUDIT_IDEMPOTENCY_PAYLOAD_KEY],
        equals: resolvedIdempotencyKey
      } as Prisma.JsonFilter
    },
    select: {
      id: true
    }
  });

  if (duplicate) {
    auditTelemetryState.persistDuplicateSuppressed += 1;
    emitAuditWriteTelemetry('duplicate_suppressed');

    logger.info(
      {
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        idempotencyKey: resolvedIdempotencyKey,
        duplicateEventId: duplicate.id,
        source: options.source ?? 'unknown'
      },
      'Audit event duplicate persistence suppressed'
    );

    return 'duplicate_suppressed';
  }

  try {
    await prisma.auditEvent.create({
      data: toCreateData({
        ...input,
        payload: payloadWithIdempotency
      })
    });

    auditTelemetryState.persistCreated += 1;
    emitAuditWriteTelemetry('created');
    return 'created';
  } catch (error) {
    auditTelemetryState.persistFailed += 1;
    emitAuditWriteTelemetry('failed');
    throw error;
  }
}

export async function auditEvent(input: AuditEventInput): Promise<void> {
  let normalizedInput: PersistableAuditEventInput;

  if (isAuditBypassed()) {
    logger.debug(
      {
        eventType: input.eventType ?? input.action,
        entityType: input.entityType ?? input.resourceType,
        bypassFlag: AUDIT_BYPASS_ENV_FLAG
      },
      'auditEvent: bypassed by environment flag'
    );
    return;
  }

  try {
    normalizedInput = normalizeAuditInput(input);
  } catch (err) {
    logger.error(
      {
        err,
        eventType: input.eventType ?? input.action,
        entityType: input.entityType ?? input.resourceType,
        entityId: input.entityId ?? input.resourceId
      },
      'auditEvent: failed to write audit record'
    );
    return;
  }

  const idempotencyKey = resolveIdempotencyKey(normalizedInput);
  const queueJobData = createAuditEventQueueJobData(normalizedInput, {
    idempotencyKey,
    source: 'auditService'
  });

  auditTelemetryState.enqueueRequested += 1;

  // Fire-and-forget enqueue to keep request paths non-blocking.
  void enqueueAuditEvent(queueJobData)
    .then((jobId) => {
      auditTelemetryState.enqueueSucceeded += 1;
      emitAuditEnqueueTelemetry('success');

      logger.debug(
        {
          jobId,
          eventType: normalizedInput.eventType,
          entityType: normalizedInput.entityType,
          entityId: normalizedInput.entityId,
          idempotencyKey
        },
        'auditEvent: enqueue succeeded'
      );
    })
    .catch(async (enqueueError) => {
      auditTelemetryState.enqueueFailed += 1;
      emitAuditEnqueueTelemetry('failure');

      logger.error(
        {
          err: enqueueError,
          eventType: normalizedInput.eventType,
          entityType: normalizedInput.entityType,
          entityId: normalizedInput.entityId,
          idempotencyKey,
          fallbackDirectWriteEnabled: ENABLE_DIRECT_WRITE_FALLBACK_ON_ENQUEUE_FAILURE
        },
        'auditEvent: failed to enqueue audit record'
      );

      if (!ENABLE_DIRECT_WRITE_FALLBACK_ON_ENQUEUE_FAILURE) {
        return;
      }

      try {
        await persistAuditEventOrThrow(normalizedInput, {
          idempotencyKey,
          source: 'auditService:fallback'
        });

        auditTelemetryState.fallbackWriteSucceeded += 1;

        logger.warn(
          {
            eventType: normalizedInput.eventType,
            entityType: normalizedInput.entityType,
            entityId: normalizedInput.entityId,
            idempotencyKey
          },
          'auditEvent: enqueue failed, direct-write fallback succeeded'
        );
      } catch (fallbackError) {
        auditTelemetryState.fallbackWriteFailed += 1;

        logger.error(
          {
            err: fallbackError,
            eventType: normalizedInput.eventType,
            entityType: normalizedInput.entityType,
            entityId: normalizedInput.entityId,
            idempotencyKey
          },
          'auditEvent: enqueue failed and direct-write fallback failed'
        );
      }
    });
}

export async function auditEventOrThrow(input: AuditEventInput): Promise<void> {
  const normalizedInput = normalizeAuditInput(input);
  await persistAuditEventOrThrow(normalizedInput, {
    idempotencyKey: resolveIdempotencyKey(normalizedInput),
    source: 'auditService:strict'
  });
}

export function getAuditTelemetrySnapshot(): AuditTelemetryState & { persistSuccessRatePct: number } {
  const successfulWrites = auditTelemetryState.persistCreated + auditTelemetryState.persistDuplicateSuppressed;
  const persistSuccessRatePct =
    auditTelemetryState.persistAttempted === 0
      ? 0
      : Number(((successfulWrites / auditTelemetryState.persistAttempted) * 100).toFixed(2));

  return {
    ...auditTelemetryState,
    persistSuccessRatePct
  };
}

export const auditService = {
  async logEvent(input: AuditEventInput): Promise<void> {
    await auditEvent(input);
  },
  async logEventOrThrow(input: AuditEventInput): Promise<void> {
    await auditEventOrThrow(input);
  }
};
