#!/usr/bin/env tsx

import crypto from 'node:crypto';
import { AddressInfo } from 'node:net';
import dotenv from 'dotenv';
import express from 'express';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { parseAuditLogQueryFilters } from '../src/services/auditLogQuerySchema';
import { streamAuditLogCsv } from '../src/services/auditLogExportService';

dotenv.config();

const prisma = new PrismaClient({
  log: ['error']
});

const TARGET_ROWS = Number(process.env.AUDIT_EXPORT_TARGET_ROWS ?? 50000);
const SEED_BATCH_SIZE = Number(process.env.AUDIT_EXPORT_SEED_BATCH_SIZE ?? 5000);
const TTFB_THRESHOLD_MS = Number(process.env.AUDIT_EXPORT_TTFB_THRESHOLD_MS ?? 30000);
const EVENT_TYPE = process.env.AUDIT_EXPORT_EVENT_TYPE ?? 'perf.audit_export';

function ensureSafeEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ABORT: load-test-audit-export must not run against production');
  }

  if (!Number.isFinite(TARGET_ROWS) || TARGET_ROWS < 1) {
    throw new Error(`Invalid AUDIT_EXPORT_TARGET_ROWS value: ${TARGET_ROWS}`);
  }

  if (!Number.isFinite(SEED_BATCH_SIZE) || SEED_BATCH_SIZE < 1) {
    throw new Error(`Invalid AUDIT_EXPORT_SEED_BATCH_SIZE value: ${SEED_BATCH_SIZE}`);
  }

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    throw new Error('DATABASE_URL is required to seed and stream the 50,000-row audit export fixture');
  }
}

async function ensureFixtureRows(): Promise<void> {
  const existing = await prisma.auditEvent.count({
    where: {
      eventType: EVENT_TYPE,
      entityType: 'audit_export_fixture'
    }
  });

  if (existing >= TARGET_ROWS) {
    console.log(`[fixture] Existing rows for ${EVENT_TYPE}: ${existing}. No seeding needed.`);
    return;
  }

  const missing = TARGET_ROWS - existing;
  console.log(`[fixture] Existing rows: ${existing}. Seeding ${missing} rows in batches of ${SEED_BATCH_SIZE}...`);

  let inserted = 0;
  while (inserted < missing) {
    const batchSize = Math.min(SEED_BATCH_SIZE, missing - inserted);
    const fixtureTag = crypto.randomUUID();

    await prisma.$executeRaw`
      INSERT INTO "audit_events" (
        "id",
        "actorId",
        "eventType",
        "entityType",
        "entityId",
        "payloadJson",
        "ipAddress",
        "userAgent",
        "createdAt"
      )
      SELECT
        gen_random_uuid(),
        NULL,
        ${EVENT_TYPE},
        'audit_export_fixture',
        gen_random_uuid(),
        jsonb_build_object(
          'fixtureTag', ${fixtureTag},
          'index', gs,
          'token', concat('token-', ${fixtureTag})
        ),
        '127.0.0.1'::inet,
        'AuditExportLoadTest/1.0',
        clock_timestamp() - make_interval(secs => gs::double precision / 1000)
      FROM generate_series(1, ${batchSize}) AS gs
    `;

    inserted += batchSize;
    console.log(`[fixture] Inserted ${inserted}/${missing} rows...`);
  }

  const finalCount = await prisma.auditEvent.count({
    where: {
      eventType: EVENT_TYPE,
      entityType: 'audit_export_fixture'
    }
  });

  console.log(`[fixture] Final fixture row count: ${finalCount}`);
}

async function runExportBenchmark() {
  const app = express();

  app.get('/api/admin/audit-log/export.csv', async (req, res) => {
    try {
      const filters = parseAuditLogQueryFilters(req.query);
      await streamAuditLogCsv(filters, res);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid audit log query parameters',
            details: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
              code: issue.code
            }))
          }
        });
        return;
      }

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to stream audit export'
        }
      });
    }
  });

  const server = await new Promise<import('node:http').Server>((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer));
  });

  const address = server.address() as AddressInfo;
  const exportUrl = new URL('/api/admin/audit-log/export.csv', `http://127.0.0.1:${address.port}`);
  exportUrl.searchParams.set('eventTypes', EVENT_TYPE);
  exportUrl.searchParams.set('entityType', 'audit_export_fixture');

  try {
    const startedAt = performance.now();
    const response = await fetch(exportUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/csv'
      }
    });
    const headersReceivedMs = performance.now() - startedAt;

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Export request failed with status ${response.status}: ${body.slice(0, 400)}`
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/csv')) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response stream reader unavailable');
    }

    const decoder = new TextDecoder();
    let firstByteMs: number | null = null;
    let totalBytes = 0;
    let totalLines = 0;
    let carry = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (firstByteMs === null) {
        firstByteMs = performance.now() - startedAt;
      }

      totalBytes += value.byteLength;

      carry += decoder.decode(value, { stream: true });
      let newlineIndex = carry.indexOf('\n');
      while (newlineIndex !== -1) {
        totalLines += 1;
        carry = carry.slice(newlineIndex + 1);
        newlineIndex = carry.indexOf('\n');
      }
    }

    carry += decoder.decode();
    if (carry.length > 0) {
      totalLines += 1;
    }

    const completedMs = performance.now() - startedAt;
    const effectiveFirstByteMs = firstByteMs ?? headersReceivedMs;

    return {
      headersReceivedMs,
      firstByteMs: effectiveFirstByteMs,
      completedMs,
      totalBytes,
      totalLines,
      contentType
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

async function main(): Promise<void> {
  ensureSafeEnvironment();

  console.log('=== Audit Export Streaming Load Test ===');
  console.log(`targetRows=${TARGET_ROWS}`);
  console.log(`eventType=${EVENT_TYPE}`);
  console.log('baseUrl=http://127.0.0.1:<ephemeral-port> (self-hosted)');
  console.log(`ttfbThresholdMs=${TTFB_THRESHOLD_MS}`);

  await ensureFixtureRows();
  const metrics = await runExportBenchmark();

  const expectedMinimumLines = TARGET_ROWS + 1;

  console.log('\n=== Metrics ===');
  console.log(`headersReceivedMs=${metrics.headersReceivedMs.toFixed(2)}`);
  console.log(`firstByteMs=${metrics.firstByteMs.toFixed(2)}`);
  console.log(`completedMs=${metrics.completedMs.toFixed(2)}`);
  console.log(`totalBytes=${metrics.totalBytes}`);
  console.log(`totalLines=${metrics.totalLines}`);
  console.log(`contentType=${metrics.contentType}`);

  if (metrics.firstByteMs > TTFB_THRESHOLD_MS) {
    throw new Error(
      `FAIL: CSV download start ${metrics.firstByteMs.toFixed(2)}ms exceeds threshold ${TTFB_THRESHOLD_MS}ms`
    );
  }

  if (metrics.totalLines < expectedMinimumLines) {
    throw new Error(
      `FAIL: Export returned ${metrics.totalLines} lines, expected at least ${expectedMinimumLines}`
    );
  }

  console.log(
    `PASS: CSV download started in ${metrics.firstByteMs.toFixed(2)}ms with ${metrics.totalLines} lines streamed`
  );
}

main()
  .catch((error) => {
    console.error('[load-test-audit-export] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
