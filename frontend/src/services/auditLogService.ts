import { getAuthToken } from '@/lib/auth';
import {
  AUDIT_LOG_DEFAULT_PAGE_SIZE,
  type AuditLogExportResult,
  type AuditLogListResponse,
  type AuditLogQueryFilters
} from '@/types/auditLog';
import { buildApiUrl } from '@/lib/api/url';

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
}

export class AuditLogServiceError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'AuditLogServiceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getApiUrl(pathname: string, params?: URLSearchParams): string {
  const query = params && params.toString().length > 0 ? `?${params.toString()}` : '';

  return buildApiUrl(`${pathname}${query}`);
}

function authHeaders(): HeadersInit | undefined {
  const token = getAuthToken();
  if (!token) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function normalizeEventTypes(eventTypes: string[] | undefined): string[] {
  if (!eventTypes || eventTypes.length === 0) {
    return [];
  }

  const values = eventTypes
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(values));
}

function normalizeFilters(filters: AuditLogQueryFilters): Required<Pick<AuditLogQueryFilters, 'page' | 'pageSize'>> & Omit<AuditLogQueryFilters, 'page' | 'pageSize'> {
  const actorEmail = filters.actorEmail?.trim().toLowerCase() || undefined;
  const entityType = filters.entityType?.trim() || undefined;
  const entityId = filters.entityId?.trim() || undefined;
  const from = filters.from?.trim() || undefined;
  const to = filters.to?.trim() || undefined;

  return {
    actorEmail,
    eventTypes: normalizeEventTypes(filters.eventTypes),
    entityType,
    entityId,
    from,
    to,
    page: toPositiveInt(filters.page, 1),
    pageSize: toPositiveInt(filters.pageSize, AUDIT_LOG_DEFAULT_PAGE_SIZE)
  };
}

function parseContentDispositionFilename(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(headerValue);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const bareMatch = /filename=([^;]+)/i.exec(headerValue);
  if (bareMatch?.[1]) {
    return bareMatch[1].trim();
  }

  return null;
}

async function throwAuditLogError(response: Response): Promise<never> {
  let message = `Request failed with status ${response.status}`;
  let code: string | undefined;
  let details: unknown;

  try {
    const body = (await response.json()) as ApiErrorBody;
    message = body.error?.message || body.message || message;
    code = body.error?.code;
    details = body.error?.details;
  } catch {
    // Ignore non-JSON error bodies.
  }

  throw new AuditLogServiceError(message, response.status, code, details);
}

export function buildAuditLogQueryParams(filters: AuditLogQueryFilters): URLSearchParams {
  const normalized = normalizeFilters(filters);
  const params = new URLSearchParams();

  params.set('page', String(normalized.page));
  params.set('pageSize', String(normalized.pageSize));

  if (normalized.actorEmail) {
    params.set('actorEmail', normalized.actorEmail);
  }

  if (normalized.eventTypes.length > 0) {
    params.set('eventTypes', normalized.eventTypes.join(','));
  }

  if (normalized.entityType) {
    params.set('entityType', normalized.entityType);
  }

  if (normalized.entityId) {
    params.set('entityId', normalized.entityId);
  }

  if (normalized.from) {
    params.set('from', normalized.from);
  }

  if (normalized.to) {
    params.set('to', normalized.to);
  }

  return params;
}

export async function fetchAuditLog(filters: AuditLogQueryFilters): Promise<AuditLogListResponse> {
  const response = await fetch(getApiUrl('/api/admin/audit-log', buildAuditLogQueryParams(filters)), {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    }
  });

  if (!response.ok) {
    await throwAuditLogError(response);
  }

  return response.json() as Promise<AuditLogListResponse>;
}

export function buildAuditLogExportUrl(filters: AuditLogQueryFilters): string {
  return getApiUrl('/api/admin/audit-log/export.csv', buildAuditLogQueryParams(filters));
}

export async function exportAuditLogCsv(filters: AuditLogQueryFilters): Promise<AuditLogExportResult> {
  const response = await fetch(buildAuditLogExportUrl(filters), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/csv',
      ...authHeaders()
    }
  });

  if (!response.ok) {
    await throwAuditLogError(response);
  }

  const blob = await response.blob();
  const suggestedName = parseContentDispositionFilename(response.headers.get('content-disposition'));

  return {
    blob,
    fileName: suggestedName || `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
  };
}
