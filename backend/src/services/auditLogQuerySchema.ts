import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const DEFAULT_AUDIT_PAGE_SIZE = 50;
export const MAX_AUDIT_PAGE_SIZE = 200;
export const AUDIT_PAYLOAD_REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS = [
    /password/i,
    /token/i,
    /secret/i,
    /authorization/i,
    /cookie/i,
    /api[-_]?key/i,
    /refresh[-_]?token/i,
    /access[-_]?token/i,
    /otp/i,
    /pin/i
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Object.prototype.toString.call(value) === '[object Object]';
}

function shouldRedactKey(key: string): boolean {
    return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function preprocessEventTypes(value: unknown): unknown {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    if (typeof value === 'string') {
        const parsedValues = value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);

        return parsedValues.length > 0 ? Array.from(new Set(parsedValues)) : undefined;
    }

    if (Array.isArray(value)) {
        if (!value.every((entry) => typeof entry === 'string')) {
            return value;
        }

        const parsedValues = value
            .flatMap((entry) => entry.split(','))
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0);

        return parsedValues.length > 0 ? Array.from(new Set(parsedValues)) : undefined;
    }

    return value;
}

const OptionalDateFilterSchema = z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }

    return value;
}, z.coerce.date().optional());

export const AuditLogQuerySchema = z
    .object({
        actorEmail: z
            .preprocess(
                (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
                z.string().min(1).max(320).optional()
            ),
        eventTypes: z.preprocess(
            preprocessEventTypes,
            z.array(z.string().min(1).max(100)).optional()
        ),
        entityType: z.preprocess(
            (value) => (typeof value === 'string' ? value.trim() : value),
            z.string().min(1).max(100).optional()
        ),
        entityId: z.preprocess(
            (value) => (typeof value === 'string' ? value.trim() : value),
            z.string().min(1).max(100).optional()
        ),
        from: OptionalDateFilterSchema,
        to: OptionalDateFilterSchema,
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).default(DEFAULT_AUDIT_PAGE_SIZE)
    })
    .refine(
        (filters) => !filters.from || !filters.to || filters.from <= filters.to,
        {
            path: ['from'],
            message: 'from must be less than or equal to to'
        }
    );

export type AuditLogQueryFilters = z.infer<typeof AuditLogQuerySchema>;

export const AUDIT_EVENT_ORDER_BY: Prisma.AuditEventOrderByWithRelationInput[] = [
    { createdAt: 'desc' },
    { id: 'desc' }
];

export function parseAuditLogQueryFilters(input: unknown): AuditLogQueryFilters {
    return AuditLogQuerySchema.parse(input ?? {});
}

export function safeParseAuditLogQueryFilters(input: unknown) {
    return AuditLogQuerySchema.safeParse(input ?? {});
}

export function buildAuditLogWhere(filters: AuditLogQueryFilters): Prisma.AuditEventWhereInput {
    const where: Prisma.AuditEventWhereInput = {};

    if (filters.actorEmail) {
        where.actor = {
            is: {
                email: {
                    contains: filters.actorEmail,
                    mode: 'insensitive'
                }
            }
        };
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
        where.eventType = {
            in: filters.eventTypes
        };
    }

    if (filters.entityType) {
        where.entityType = filters.entityType;
    }

    if (filters.entityId) {
        where.entityId = filters.entityId;
    }

    if (filters.from || filters.to) {
        where.createdAt = {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {})
        };
    }

    return where;
}

export function buildAuditLogFindManyArgs(filters: AuditLogQueryFilters): Pick<Prisma.AuditEventFindManyArgs, 'where' | 'orderBy' | 'skip' | 'take'> {
    return {
        where: buildAuditLogWhere(filters),
        orderBy: AUDIT_EVENT_ORDER_BY,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize
    };
}

function sanitizePayload(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => sanitizePayload(entry));
    }

    if (!isPlainObject(value)) {
        return value;
    }

    const sanitized: Record<string, unknown> = {};

    for (const key of Object.keys(value).sort()) {
        const nestedValue = value[key];
        sanitized[key] = shouldRedactKey(key)
            ? AUDIT_PAYLOAD_REDACTED_VALUE
            : sanitizePayload(nestedValue);
    }

    return sanitized;
}

export function sanitizeAuditPayloadForViewer(payload: unknown): unknown {
    return sanitizePayload(payload);
}

export function serializeAuditPayloadForCsv(payload: unknown): string {
    const sanitizedPayload = sanitizeAuditPayloadForViewer(payload);

    if (sanitizedPayload === undefined || sanitizedPayload === null) {
        return '';
    }

    if (
        typeof sanitizedPayload === 'string'
        || typeof sanitizedPayload === 'number'
        || typeof sanitizedPayload === 'boolean'
    ) {
        return String(sanitizedPayload);
    }

    return JSON.stringify(sanitizedPayload);
}
