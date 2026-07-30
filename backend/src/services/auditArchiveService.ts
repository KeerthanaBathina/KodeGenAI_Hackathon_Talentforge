import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import { env } from '../config/env';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

const HASH_ALGORITHM = 'sha256';
const ARCHIVE_CONTENT_TYPE = 'application/x-ndjson';
const ARCHIVE_FILE_EXTENSION = 'jsonl';

type JsonScalar = string | number | boolean | null;

type ArchiveUploadOptions = {
  upsert: boolean;
  contentType: string;
  cacheControl: string;
};

type AuditArchiveStorageAdapter = {
  upload: (bucket: string, path: string, payload: Buffer, options: ArchiveUploadOptions) => Promise<void>;
  download: (bucket: string, path: string) => Promise<Buffer>;
};

type AuditEventArchiveRow = {
  id: string;
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string;
  payloadJson: Prisma.JsonValue;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
};

export type AuditArchiveChunkOutcome = 'archived' | 'reused_archive_index';

export interface ArchiveExpiredAuditEventsOptions {
  now?: Date;
  batchSize?: number;
  chunkSize?: number;
  retentionYears?: number;
}

export interface AuditArchiveChunkResult {
  outcome: AuditArchiveChunkOutcome;
  storagePath: string;
  checksum: string;
  hashAlgorithm: string;
  rowCount: number;
  deletedRowCount: number;
  sourceWindowStart: Date;
  sourceWindowEnd: Date;
  durationMs: number;
}

export interface ArchiveExpiredAuditEventsResult {
  fileFormat: 'jsonl';
  hashAlgorithm: string;
  cutoff: Date;
  batchSize: number;
  chunkSize: number;
  chunkCount: number;
  archivedRowCount: number;
  deletedRowCount: number;
  durationMs: number;
  chunks: AuditArchiveChunkResult[];
}

export class AuditArchiveError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_CONFIGURATION'
      | 'STORAGE_UPLOAD_FAILED'
      | 'STORAGE_DOWNLOAD_FAILED'
      | 'CHECKSUM_MISMATCH'
      | 'DELETE_COUNT_MISMATCH'
      | 'DELETE_BYPASS_REQUIRED',
    message: string
  ) {
    super(message);
    this.name = 'AuditArchiveError';
  }
}

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }

  return supabaseClient;
}

async function toBuffer(payload: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(payload)) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return Buffer.from(payload);
  }

  if (ArrayBuffer.isView(payload)) {
    return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'arrayBuffer' in payload &&
    typeof (payload as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  ) {
    const arrayBuffer = await (payload as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new AuditArchiveError('STORAGE_DOWNLOAD_FAILED', 'Downloaded archive payload could not be converted to Buffer');
}

const defaultAuditArchiveStorageAdapter: AuditArchiveStorageAdapter = {
  async upload(bucket, path, payload, options) {
    const client = getSupabaseClient();

    const { error } = await client.storage.from(bucket).upload(path, payload, options);
    if (error) {
      throw new AuditArchiveError('STORAGE_UPLOAD_FAILED', `Failed to upload audit archive: ${error.message}`);
    }
  },
  async download(bucket, path) {
    const client = getSupabaseClient();

    const { data, error } = await client.storage.from(bucket).download(path);
    if (error || !data) {
      throw new AuditArchiveError(
        'STORAGE_DOWNLOAD_FAILED',
        `Failed to download uploaded audit archive for verification: ${error?.message ?? 'unknown error'}`
      );
    }

    return toBuffer(data);
  }
};

let auditArchiveStorageAdapter: AuditArchiveStorageAdapter = defaultAuditArchiveStorageAdapter;

export function __setAuditArchiveStorageAdapterForTests(adapter: AuditArchiveStorageAdapter | null): void {
  auditArchiveStorageAdapter = adapter ?? defaultAuditArchiveStorageAdapter;
}

function normalizePositiveInt(value: number, fieldName: 'batchSize' | 'chunkSize' | 'retentionYears'): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new AuditArchiveError('INVALID_CONFIGURATION', `${fieldName} must be a positive number`);
  }

  return Math.floor(value);
}

function normalizePathPrefix(prefix: string): string {
  const normalized = prefix.trim().replace(/^\/+|\/+$/g, '');
  return normalized || 'audit-events';
}

function formatDateSegment(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTimestampSegment(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value as JsonScalar);
  }

  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();

  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(input[key])}`).join(',')}}`;
}

function toArchiveLine(row: AuditEventArchiveRow): string {
  return stableSerialize({
    id: row.id,
    actorId: row.actorId,
    eventType: row.eventType,
    entityType: row.entityType,
    entityId: row.entityId,
    payloadJson: row.payloadJson,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString()
  });
}

function buildArchivePayload(rows: AuditEventArchiveRow[]): Buffer {
  const lines = rows.map((row) => toArchiveLine(row));
  return Buffer.from(lines.join('\n'), 'utf8');
}

function computeChecksum(payload: Buffer): string {
  return createHash(HASH_ALGORITHM).update(payload).digest('hex');
}

function buildChunkFingerprint(rows: AuditEventArchiveRow[]): string {
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];

  if (!firstRow || !lastRow) {
    throw new AuditArchiveError('INVALID_CONFIGURATION', 'Cannot build storage fingerprint for empty archive chunk');
  }

  return createHash('sha1')
    .update(`${firstRow.id}|${lastRow.id}|${rows.length}|${firstRow.createdAt.toISOString()}|${lastRow.createdAt.toISOString()}`)
    .digest('hex')
    .slice(0, 20);
}

function buildStoragePath(rows: AuditEventArchiveRow[], cutoff: Date): string {
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];

  if (!firstRow || !lastRow) {
    throw new AuditArchiveError('INVALID_CONFIGURATION', 'Cannot build storage path for empty archive chunk');
  }

  const prefix = normalizePathPrefix(env.AUDIT_ARCHIVE_PATH_PREFIX);
  const year = firstRow.createdAt.getUTCFullYear();
  const month = String(firstRow.createdAt.getUTCMonth() + 1).padStart(2, '0');
  const cutoffDate = formatDateSegment(cutoff);
  const rangeStart = formatTimestampSegment(firstRow.createdAt);
  const rangeEnd = formatTimestampSegment(lastRow.createdAt);
  const fingerprint = buildChunkFingerprint(rows);

  return `${prefix}/year=${year}/month=${month}/cutoff=${cutoffDate}/chunk-${rangeStart}-${rangeEnd}-${rows.length}-${fingerprint}.${ARCHIVE_FILE_EXTENSION}`;
}

function toCutoffDate(now: Date, retentionYears: number): Date {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - retentionYears);
  return cutoff;
}

export function calculateAuditArchiveCutoff(
  now: Date = new Date(),
  retentionYears: number = env.AUDIT_RETENTION_YEARS
): Date {
  const normalizedRetentionYears = normalizePositiveInt(retentionYears, 'retentionYears');
  return toCutoffDate(now, normalizedRetentionYears);
}

async function fetchArchiveChunk(cutoff: Date, take: number): Promise<AuditEventArchiveRow[]> {
  return prisma.auditEvent.findMany({
    where: {
      createdAt: {
        lt: cutoff
      }
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' }
    ],
    take,
    select: {
      id: true,
      actorId: true,
      eventType: true,
      entityType: true,
      entityId: true,
      payloadJson: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true
    }
  }) as Promise<AuditEventArchiveRow[]>;
}

async function deleteArchivedRowsWithBypass(
  tx: Prisma.TransactionClient,
  rowIds: string[],
  cutoff: Date
): Promise<number> {
  await tx.$executeRawUnsafe("SELECT set_config('app.audit_archive_purge', 'true', true)");

  const deletion = await tx.auditEvent.deleteMany({
    where: {
      id: { in: rowIds },
      createdAt: {
        lt: cutoff
      }
    }
  });

  return deletion.count;
}

async function verifyUploadIntegrity(storagePath: string, payloadChecksum: string): Promise<void> {
  const downloaded = await auditArchiveStorageAdapter.download(env.AUDIT_ARCHIVE_BUCKET, storagePath);
  const downloadedChecksum = computeChecksum(downloaded);

  if (downloadedChecksum !== payloadChecksum) {
    throw new AuditArchiveError(
      'CHECKSUM_MISMATCH',
      `Archive checksum mismatch for ${storagePath}: expected ${payloadChecksum} but got ${downloadedChecksum}`
    );
  }
}

async function archiveChunk(rows: AuditEventArchiveRow[], cutoff: Date): Promise<AuditArchiveChunkResult> {
  const startedAt = Date.now();
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];

  if (!firstRow || !lastRow) {
    throw new AuditArchiveError('INVALID_CONFIGURATION', 'Cannot archive an empty chunk');
  }

  const storagePath = buildStoragePath(rows, cutoff);
  const payload = buildArchivePayload(rows);
  const checksum = computeChecksum(payload);
  const rowIds = rows.map((row) => row.id);

  const existingIndex = await prisma.auditArchiveIndex.findUnique({
    where: { storagePath },
    select: { id: true }
  });

  if (existingIndex) {
    const deletedRowCount = await prisma.$transaction(async (tx) => {
      return deleteArchivedRowsWithBypass(tx, rowIds, cutoff);
    });

    if (deletedRowCount !== rowIds.length) {
      throw new AuditArchiveError(
        'DELETE_COUNT_MISMATCH',
        `Expected to delete ${rowIds.length} archived rows for existing storage path ${storagePath}, deleted ${deletedRowCount}`
      );
    }

    return {
      outcome: 'reused_archive_index',
      storagePath,
      checksum,
      hashAlgorithm: HASH_ALGORITHM,
      rowCount: rows.length,
      deletedRowCount,
      sourceWindowStart: firstRow.createdAt,
      sourceWindowEnd: lastRow.createdAt,
      durationMs: Date.now() - startedAt
    };
  }

  await auditArchiveStorageAdapter.upload(env.AUDIT_ARCHIVE_BUCKET, storagePath, payload, {
    upsert: true,
    contentType: ARCHIVE_CONTENT_TYPE,
    cacheControl: '31536000'
  });

  await verifyUploadIntegrity(storagePath, checksum);

  const deletedRowCount = await prisma.$transaction(async (tx) => {
    const deletedCount = await deleteArchivedRowsWithBypass(tx, rowIds, cutoff);

    if (deletedCount !== rowIds.length) {
      throw new AuditArchiveError(
        'DELETE_COUNT_MISMATCH',
        `Expected to delete ${rowIds.length} archived rows for ${storagePath}, deleted ${deletedCount}`
      );
    }

    await tx.auditArchiveIndex.create({
      data: {
        sourceWindowStart: firstRow.createdAt,
        sourceWindowEnd: lastRow.createdAt,
        rowCount: rows.length,
        storagePath,
        checksum,
        hashAlgorithm: HASH_ALGORITHM
      }
    });

    return deletedCount;
  });

  return {
    outcome: 'archived',
    storagePath,
    checksum,
    hashAlgorithm: HASH_ALGORITHM,
    rowCount: rows.length,
    deletedRowCount,
    sourceWindowStart: firstRow.createdAt,
    sourceWindowEnd: lastRow.createdAt,
    durationMs: Date.now() - startedAt
  };
}

export async function archiveExpiredAuditEvents(
  options: ArchiveExpiredAuditEventsOptions = {}
): Promise<ArchiveExpiredAuditEventsResult> {
  const startedAt = Date.now();
  const now = options.now ?? new Date();
  const retentionYears = normalizePositiveInt(options.retentionYears ?? env.AUDIT_RETENTION_YEARS, 'retentionYears');
  const cutoff = calculateAuditArchiveCutoff(now, retentionYears);

  const batchSize = normalizePositiveInt(options.batchSize ?? env.AUDIT_ARCHIVE_BATCH_SIZE, 'batchSize');
  const requestedChunkSize = normalizePositiveInt(options.chunkSize ?? env.AUDIT_ARCHIVE_CHUNK_SIZE, 'chunkSize');
  const chunkSize = Math.min(batchSize, requestedChunkSize);

  const chunks: AuditArchiveChunkResult[] = [];
  let archivedRowCount = 0;
  let deletedRowCount = 0;
  let remainingBatchCapacity = batchSize;

  try {
    while (remainingBatchCapacity > 0) {
      const take = Math.min(chunkSize, remainingBatchCapacity);
      const rows = await fetchArchiveChunk(cutoff, take);

      if (rows.length === 0) {
        break;
      }

      const chunk = await archiveChunk(rows, cutoff);
      chunks.push(chunk);

      archivedRowCount += chunk.rowCount;
      deletedRowCount += chunk.deletedRowCount;
      remainingBatchCapacity -= rows.length;

      await auditEvent({
        eventType: 'compliance.audit_archive_chunk_completed',
        entityType: 'audit_archive',
        entityId: chunk.storagePath,
        payload: {
          outcome: chunk.outcome,
          rowCount: chunk.rowCount,
          deletedRowCount: chunk.deletedRowCount,
          checksum: chunk.checksum,
          hashAlgorithm: chunk.hashAlgorithm,
          sourceWindowStart: chunk.sourceWindowStart.toISOString(),
          sourceWindowEnd: chunk.sourceWindowEnd.toISOString(),
          durationMs: chunk.durationMs,
          cutoff: cutoff.toISOString()
        }
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await auditEvent({
      eventType: 'compliance.audit_archive_run_failed',
      entityType: 'audit_archive',
      entityId: cutoff.toISOString(),
      payload: {
        archivedRowCount,
        deletedRowCount,
        chunkCount: chunks.length,
        cutoff: cutoff.toISOString(),
        batchSize,
        chunkSize,
        durationMs: Date.now() - startedAt,
        error: errorMessage
      }
    });

    logger.error(
      {
        error,
        cutoff: cutoff.toISOString(),
        archivedRowCount,
        deletedRowCount,
        chunkCount: chunks.length
      },
      '[AuditArchiveService] Archive run failed'
    );

    throw error;
  }

  const result: ArchiveExpiredAuditEventsResult = {
    fileFormat: 'jsonl',
    hashAlgorithm: HASH_ALGORITHM,
    cutoff,
    batchSize,
    chunkSize,
    chunkCount: chunks.length,
    archivedRowCount,
    deletedRowCount,
    durationMs: Date.now() - startedAt,
    chunks
  };

  await auditEvent({
    eventType: 'compliance.audit_archive_run_completed',
    entityType: 'audit_archive',
    entityId: cutoff.toISOString(),
    payload: {
      cutoff: cutoff.toISOString(),
      batchSize,
      chunkSize,
      chunkCount: result.chunkCount,
      archivedRowCount,
      deletedRowCount,
      durationMs: result.durationMs,
      fileFormat: result.fileFormat,
      hashAlgorithm: result.hashAlgorithm
    }
  });

  logger.info(
    {
      cutoff: cutoff.toISOString(),
      batchSize,
      chunkSize,
      chunkCount: result.chunkCount,
      archivedRowCount,
      deletedRowCount,
      durationMs: result.durationMs
    },
    '[AuditArchiveService] Archive run completed'
  );

  return result;
}
