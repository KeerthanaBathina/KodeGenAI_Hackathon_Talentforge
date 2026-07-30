import { Request } from 'express';
import { extractIpAddress, extractUserAgent } from '../utils/requestContext';

export interface AuditContext {
  actorId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface BuildAuditContextInput {
  req?: Request | null;
  actorId?: string | null;
  actorRole?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveWithOverride(
  overrideValue: string | null | undefined,
  fallbackValue: string | null
): string | null {
  if (overrideValue !== undefined) {
    return normalizeNullableString(overrideValue);
  }

  return fallbackValue;
}

function normalizeIpAddress(ipAddress: string | null): string | null {
  const normalized = normalizeNullableString(ipAddress);
  if (!normalized) {
    return null;
  }

  return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
}

export function buildAuditContext(input: BuildAuditContextInput = {}): AuditContext {
  const request = input.req ?? null;

  const requestActorId = normalizeNullableString(request?.user?.id);
  const requestActorRole = normalizeNullableString(request?.user?.role);
  const requestActorEmail = normalizeNullableString(request?.user?.email);
  const requestIpAddress = request ? normalizeIpAddress(extractIpAddress(request)) : null;
  const requestUserAgent = request ? normalizeNullableString(extractUserAgent(request)) : null;

  return {
    actorId: resolveWithOverride(input.actorId, requestActorId),
    actorRole: resolveWithOverride(input.actorRole, requestActorRole),
    actorEmail: resolveWithOverride(input.actorEmail, requestActorEmail),
    ipAddress: resolveWithOverride(input.ipAddress, requestIpAddress),
    userAgent: resolveWithOverride(input.userAgent, requestUserAgent)
  };
}

export function buildAuditContextFromRequest(req: Request): AuditContext {
  return buildAuditContext({ req });
}

export function buildServiceAuditContext(
  overrides: Omit<BuildAuditContextInput, 'req'> = {}
): AuditContext {
  return buildAuditContext(overrides);
}