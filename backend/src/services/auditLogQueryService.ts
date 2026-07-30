import type { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import {
    buildAuditLogFindManyArgs,
    buildAuditLogWhere,
    sanitizeAuditPayloadForViewer,
    type AuditLogQueryFilters
} from './auditLogQuerySchema';
import { projectAuditPayloadsForPrivacy } from './auditPayloadPrivacyService';

export interface AuditLogListItem {
    id: string;
    actorId: string | null;
    actorEmail: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
}

export interface AuditLogListResponse {
    items: AuditLogListItem[];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

function normalizeViewerPayload(payload: unknown): Record<string, unknown> {
    const sanitized = sanitizeAuditPayloadForViewer(payload);

    if (sanitized === null || sanitized === undefined) {
        return {};
    }

    if (Array.isArray(sanitized)) {
        return { items: sanitized };
    }

    if (typeof sanitized === 'object') {
        return sanitized as Record<string, unknown>;
    }

    return { value: sanitized };
}

function toPaginationMeta(page: number, pageSize: number, totalItems: number) {
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: totalPages > 0 && page < totalPages,
        hasPrevPage: totalPages > 0 && page > 1
    };
}

export async function getAuditLogPage(filters: AuditLogQueryFilters): Promise<AuditLogListResponse> {
    const where = buildAuditLogWhere(filters);
    const findManyArgs = buildAuditLogFindManyArgs(filters);

    const [rows, totalItems] = await Promise.all([
        prisma.auditEvent.findMany({
            ...findManyArgs,
            select: {
                id: true,
                actorId: true,
                eventType: true,
                entityType: true,
                entityId: true,
                payloadJson: true,
                ipAddress: true,
                userAgent: true,
                createdAt: true,
                actor: {
                    select: {
                        email: true
                    }
                }
            }
        }),
        prisma.auditEvent.count({ where })
    ]);

    const privacyProjectedPayloads = await projectAuditPayloadsForPrivacy(
        rows.map((row) => ({
            entityType: row.entityType,
            entityId: row.entityId,
            payloadJson: row.payloadJson
        }))
    );

    const items = rows.map((row, index) => ({
        id: row.id,
        actorId: row.actorId,
        actorEmail: row.actor?.email ?? null,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        payload: normalizeViewerPayload(privacyProjectedPayloads[index]),
        ipAddress: row.ipAddress,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString()
    }));

    const pagination = toPaginationMeta(filters.page, filters.pageSize, totalItems);

    return {
        items,
        ...pagination
    };
}

export type AuditLogFindManyArgs = Pick<
    Prisma.AuditEventFindManyArgs,
    'where' | 'orderBy' | 'skip' | 'take'
>;
