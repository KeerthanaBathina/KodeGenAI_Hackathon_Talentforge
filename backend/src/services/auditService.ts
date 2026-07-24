import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface AuditEventInput {
  actorId?: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;

function toCreateData(input: AuditEventInput): Prisma.AuditEventCreateInput {
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

export async function auditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditEvent.create({ data: toCreateData(input) });
  } catch (err) {
    logger.error(
      {
        err,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId
      },
      'auditEvent: failed to write audit record'
    );
  }
}

export async function auditEventOrThrow(input: AuditEventInput): Promise<void> {
  await prisma.auditEvent.create({ data: toCreateData(input) });
}
