import { once } from 'node:events';
import type { Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import {
    AUDIT_EVENT_ORDER_BY,
    buildAuditLogWhere,
    serializeAuditPayloadForCsv,
    type AuditLogQueryFilters
} from './auditLogQuerySchema';
import { projectAuditPayloadsForPrivacy } from './auditPayloadPrivacyService';

const DEFAULT_EXPORT_CHUNK_SIZE = 1000;

interface AuditLogExportRow {
    id: string;
    actorId: string | null;
    eventType: string;
    entityType: string;
    entityId: string;
    payloadJson: unknown;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    actor: {
        email: string;
    } | null;
}

interface ExportCursor {
    createdAt: Date;
    id: string;
}

export interface AuditLogExportOptions {
    chunkSize?: number;
    filename?: string;
}

function escapeCsvCell(value: string): string {
    if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replace(/"/g, '""')}"`;
    }

    return value;
}

function toCsvCell(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    if (value instanceof Date) {
        return escapeCsvCell(value.toISOString());
    }

    return escapeCsvCell(String(value));
}

function buildCsvHeader(): string {
    return [
        'event_id',
        'event_type',
        'entity_type',
        'entity_id',
        'created_at',
        'actor_id',
        'actor_email',
        'ip_address',
        'user_agent',
        'payload_json'
    ].join(',');
}

function buildCsvLine(row: AuditLogExportRow, payloadJson: unknown): string {
    const payload = serializeAuditPayloadForCsv(payloadJson);

    return [
        toCsvCell(row.id),
        toCsvCell(row.eventType),
        toCsvCell(row.entityType),
        toCsvCell(row.entityId),
        toCsvCell(row.createdAt),
        toCsvCell(row.actorId),
        toCsvCell(row.actor?.email ?? ''),
        toCsvCell(row.ipAddress),
        toCsvCell(row.userAgent),
        toCsvCell(payload)
    ].join(',');
}

async function writeOrDrain(res: Response, value: string): Promise<void> {
    if (res.write(value)) {
        return;
    }

    await once(res, 'drain');
}

function buildCursorWhere(baseWhere: Prisma.AuditEventWhereInput, cursor?: ExportCursor): Prisma.AuditEventWhereInput {
    if (!cursor) {
        return baseWhere;
    }

    return {
        AND: [
            baseWhere,
            {
                OR: [
                    {
                        createdAt: {
                            lt: cursor.createdAt
                        }
                    },
                    {
                        createdAt: cursor.createdAt,
                        id: {
                            lt: cursor.id
                        }
                    }
                ]
            }
        ]
    };
}

async function fetchAuditChunk(
    where: Prisma.AuditEventWhereInput,
    chunkSize: number
): Promise<AuditLogExportRow[]> {
    return prisma.auditEvent.findMany({
        where,
        orderBy: AUDIT_EVENT_ORDER_BY,
        take: chunkSize,
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
    }) as Promise<AuditLogExportRow[]>;
}

export async function streamAuditLogCsv(
    filters: AuditLogQueryFilters,
    res: Response,
    options: AuditLogExportOptions = {}
): Promise<void> {
    const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_EXPORT_CHUNK_SIZE);
    const filename = options.filename ?? `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;

    res.status(200);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    let connectionClosed = false;
    res.on('close', () => {
        connectionClosed = true;
    });

    await writeOrDrain(res, `${buildCsvHeader()}\n`);

    const baseWhere = buildAuditLogWhere(filters);
    let cursor: ExportCursor | undefined;

    while (!connectionClosed) {
        const chunk = await fetchAuditChunk(buildCursorWhere(baseWhere, cursor), chunkSize);
        if (chunk.length === 0) {
            break;
        }

        const privacyProjectedPayloads = await projectAuditPayloadsForPrivacy(
            chunk.map((row) => ({
                entityType: row.entityType,
                entityId: row.entityId,
                payloadJson: row.payloadJson
            }))
        );

        for (const [index, row] of chunk.entries()) {
            if (connectionClosed) {
                break;
            }

            await writeOrDrain(res, `${buildCsvLine(row, privacyProjectedPayloads[index])}\n`);
        }

        const lastRow = chunk[chunk.length - 1];
        cursor = {
            createdAt: lastRow.createdAt,
            id: lastRow.id
        };
    }

    if (!res.writableEnded) {
        res.end();
    }
}
