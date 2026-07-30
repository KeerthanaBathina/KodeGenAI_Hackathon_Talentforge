import { CandidateStatus } from '@prisma/client';
import prisma from '../db/prisma';

export const AUDIT_PRIVACY_REDACTED_VALUE = '[REDACTED]';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANDIDATE_ID_REFERENCE_KEYS = new Set([
  'candidateid',
  'candidateuuid'
]);

const REDACTED_PII_KEYS = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'middlename',
  'candidatename',
  'email',
  'contactemail',
  'personalemail'
]);

const NULLIFIED_PII_KEYS = new Set([
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

export interface AuditPayloadProjectionRow {
  entityType: string;
  entityId: string;
  payloadJson: unknown;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normalizeUuid(value: string): string {
  return value.toLowerCase();
}

function isCandidateEntityType(entityType: string): boolean {
  const normalized = entityType.trim().toLowerCase();
  return normalized === 'candidate' || normalized === 'candidates';
}

function extractCandidateIdsFromPayload(value: unknown, collector: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      extractCandidateIdsFromPayload(entry, collector);
    });
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);

    if (CANDIDATE_ID_REFERENCE_KEYS.has(normalizedKey) && typeof nestedValue === 'string') {
      const trimmedId = nestedValue.trim();
      if (isUuid(trimmedId)) {
        collector.add(normalizeUuid(trimmedId));
      }
    }

    extractCandidateIdsFromPayload(nestedValue, collector);
  }
}

function collectCandidateIdsForRow(row: AuditPayloadProjectionRow): Set<string> {
  const candidateIds = new Set<string>();

  if (isCandidateEntityType(row.entityType) && isUuid(row.entityId)) {
    candidateIds.add(normalizeUuid(row.entityId));
  }

  extractCandidateIdsFromPayload(row.payloadJson, candidateIds);
  return candidateIds;
}

async function lookupAnonymizedCandidateIds(candidateIds: Set<string>): Promise<Set<string>> {
  if (candidateIds.size === 0) {
    return new Set<string>();
  }

  const rows = await prisma.candidate.findMany({
    where: {
      id: {
        in: Array.from(candidateIds)
      },
      status: CandidateStatus.anonymized
    },
    select: {
      id: true
    }
  });

  return new Set(rows.map((row) => row.id.toLowerCase()));
}

function redactCandidatePii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactCandidatePii(entry));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const projected: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);

    if (REDACTED_PII_KEYS.has(normalizedKey)) {
      projected[key] = AUDIT_PRIVACY_REDACTED_VALUE;
      continue;
    }

    if (NULLIFIED_PII_KEYS.has(normalizedKey)) {
      projected[key] = null;
      continue;
    }

    projected[key] = redactCandidatePii(nestedValue);
  }

  return projected;
}

export async function projectAuditPayloadsForPrivacy(rows: AuditPayloadProjectionRow[]): Promise<unknown[]> {
  if (rows.length === 0) {
    return [];
  }

  const candidateIdsByRow = rows.map((row) => collectCandidateIdsForRow(row));
  const allCandidateIds = new Set<string>();

  candidateIdsByRow.forEach((ids) => {
    ids.forEach((id) => {
      allCandidateIds.add(id);
    });
  });

  const anonymizedCandidateIds = await lookupAnonymizedCandidateIds(allCandidateIds);

  return rows.map((row, index) => {
    const candidateIds = candidateIdsByRow[index];
    const shouldProject = candidateIds
      ? Array.from(candidateIds).some((candidateId) => anonymizedCandidateIds.has(candidateId))
      : false;

    return shouldProject ? redactCandidatePii(row.payloadJson) : row.payloadJson;
  });
}