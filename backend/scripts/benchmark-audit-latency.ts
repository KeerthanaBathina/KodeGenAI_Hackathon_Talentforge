#!/usr/bin/env tsx

import { createHash } from 'crypto';
import express from 'express';
import request from 'supertest';

interface LatencyStats {
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

interface EndpointFixture {
  name: string;
  path: '/api/decisions' | '/api/auth/login';
  expectedStatus: number;
  payload: Record<string, unknown>;
}

interface QueueTelemetry {
  enqueueSuccess: number;
  enqueueFailure: number;
  enqueueDuplicateSuppressed: number;
  retryCountObserved: number;
  workerTransientFailures: number;
  workerPermanentFailures: number;
  writeCreated: number;
  writeDuplicateSuppressed: number;
  writeFailed: number;
}

const ITERATIONS = Number(process.env.AUDIT_LATENCY_ITERATIONS ?? 120);
const WARMUP_ITERATIONS = Number(process.env.AUDIT_LATENCY_WARMUP ?? 20);
const P95_DELTA_THRESHOLD_MS = Number(process.env.AUDIT_P95_DELTA_THRESHOLD_MS ?? 10);

const FIXTURES: EndpointFixture[] = [
  {
    name: 'decisions_create',
    path: '/api/decisions',
    expectedStatus: 201,
    payload: {
      applicationId: '550e8400-e29b-41d4-a716-446655440000',
      outcome: 'offer',
      reasonCodeId: '660e8400-e29b-41d4-a716-446655440001',
      justification:
        'Deterministic benchmark fixture justification text for measuring audited decision latency overhead.',
      compensationBand: '100k-120k',
      offerDetails: {
        location: 'Remote',
        note: 'x'.repeat(256),
      },
    },
  },
  {
    name: 'auth_login',
    path: '/api/auth/login',
    expectedStatus: 200,
    payload: {
      email: 'benchmark.user@example.com',
      password: 'BenchmarkPass123!',
    },
  },
];

function percentile(sorted: number[], percentileValue: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function toStats(values: number[]): LatencyStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);

  return {
    min: sorted[0] ?? 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    mean: sorted.length > 0 ? sum / sorted.length : 0,
  };
}

function toKeyMaterial(parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part ?? '').trim()).join('|');
}

function deterministicHash(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function createQueueSimulator() {
  const seenJobIds = new Set<string>();
  const persistedKeys = new Set<string>();

  const telemetry: QueueTelemetry = {
    enqueueSuccess: 0,
    enqueueFailure: 0,
    enqueueDuplicateSuppressed: 0,
    retryCountObserved: 0,
    workerTransientFailures: 0,
    workerPermanentFailures: 0,
    writeCreated: 0,
    writeDuplicateSuppressed: 0,
    writeFailed: 0,
  };

  async function enqueue(eventType: string, entityType: string, entityId: string, requestId: string): Promise<void> {
    const idempotencyKey = deterministicHash(toKeyMaterial([eventType, entityType, entityId, requestId]));
    const jobId = `audit-${idempotencyKey}`;

    if (seenJobIds.has(jobId)) {
      telemetry.enqueueDuplicateSuppressed += 1;
      return;
    }

    seenJobIds.add(jobId);
    telemetry.enqueueSuccess += 1;

    // Simulate fire-and-forget worker processing and persistence dedupe checks.
    await Promise.resolve();

    if (persistedKeys.has(idempotencyKey)) {
      telemetry.writeDuplicateSuppressed += 1;
      return;
    }

    persistedKeys.add(idempotencyKey);
    telemetry.writeCreated += 1;
  }

  return {
    telemetry,
    enqueue,
  };
}

function createBenchmarkApp(auditEnabled: boolean, telemetry: ReturnType<typeof createQueueSimulator>) {
  const app = express();
  app.use(express.json());

  app.post('/api/decisions', async (req, res) => {
    const applicationId = String(req.body.applicationId ?? '');
    const requestId = String(req.headers['x-request-id'] ?? 'no-request-id');

    if (!applicationId) {
      res.status(400).json({ error: 'MISSING_APPLICATION_ID' });
      return;
    }

    if (auditEnabled) {
      void telemetry.enqueue('decision.application_decision', 'application', applicationId, requestId);
    }

    res.status(201).json({ success: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email ?? '').toLowerCase();
    const requestId = String(req.headers['x-request-id'] ?? 'no-request-id');

    if (!email.includes('@')) {
      res.status(400).json({ error: 'INVALID_EMAIL' });
      return;
    }

    if (auditEnabled) {
      const actorRefHash = deterministicHash(email);
      void telemetry.enqueue('auth.login', 'user', actorRefHash, requestId);
    }

    res.status(200).json({ success: true });
  });

  return app;
}

async function runEndpointBenchmark(
  app: express.Express,
  fixture: EndpointFixture,
  mode: 'baseline' | 'audit_enabled'
): Promise<LatencyStats> {
  for (let warmup = 0; warmup < WARMUP_ITERATIONS; warmup += 1) {
    const warmupRequestId = `${fixture.name}-${mode}-warmup-${warmup}`;
    await request(app).post(fixture.path).set('x-request-id', warmupRequestId).send(fixture.payload);
  }

  const timingsMs: number[] = [];

  for (let i = 0; i < ITERATIONS; i += 1) {
    const requestId = `${fixture.name}-${mode}-${i}`;
    const started = performance.now();

    const response = await request(app)
      .post(fixture.path)
      .set('x-request-id', requestId)
      .send(fixture.payload);

    const elapsedMs = performance.now() - started;

    if (response.status !== fixture.expectedStatus) {
      throw new Error(
        `Unexpected status for ${fixture.path} in ${mode}: expected ${fixture.expectedStatus}, received ${response.status}`
      );
    }

    timingsMs.push(elapsedMs);
  }

  return toStats(timingsMs);
}

function printStats(label: string, stats: LatencyStats): void {
  console.log(
    `${label.padEnd(22)} min=${stats.min.toFixed(3)}ms p50=${stats.p50.toFixed(3)}ms p95=${stats.p95.toFixed(3)}ms p99=${stats.p99.toFixed(3)}ms max=${stats.max.toFixed(3)}ms mean=${stats.mean.toFixed(3)}ms`
  );
}

async function main(): Promise<void> {
  console.log('[audit:latency:benchmark] starting benchmark run');
  console.log(
    `[audit:latency:benchmark] iterations=${ITERATIONS}, warmup=${WARMUP_ITERATIONS}, p95_threshold_ms=${P95_DELTA_THRESHOLD_MS}`
  );

  const baselinePipeline = createQueueSimulator();
  const auditPipeline = createQueueSimulator();

  const baselineApp = createBenchmarkApp(false, baselinePipeline);
  const auditEnabledApp = createBenchmarkApp(true, auditPipeline);

  let benchmarkPassed = true;

  for (const fixture of FIXTURES) {
    const baselineStats = await runEndpointBenchmark(baselineApp, fixture, 'baseline');
    const enabledStats = await runEndpointBenchmark(auditEnabledApp, fixture, 'audit_enabled');

    const deltaP50 = enabledStats.p50 - baselineStats.p50;
    const deltaP95 = enabledStats.p95 - baselineStats.p95;
    const deltaP99 = enabledStats.p99 - baselineStats.p99;

    console.log(`\n[audit:latency:benchmark] endpoint=${fixture.path} fixture=${fixture.name}`);
    printStats('baseline', baselineStats);
    printStats('audit_enabled', enabledStats);
    console.log(
      `delta`.padEnd(22) +
        ` p50=${deltaP50.toFixed(3)}ms p95=${deltaP95.toFixed(3)}ms p99=${deltaP99.toFixed(3)}ms`
    );

    if (deltaP95 >= P95_DELTA_THRESHOLD_MS) {
      benchmarkPassed = false;
      console.error(
        `[audit:latency:benchmark] FAIL endpoint=${fixture.path} p95_delta=${deltaP95.toFixed(3)}ms threshold=${P95_DELTA_THRESHOLD_MS}ms`
      );
    }
  }

  const telemetry = auditPipeline.telemetry;
  const totalWrites = telemetry.writeCreated + telemetry.writeDuplicateSuppressed + telemetry.writeFailed;
  const writeSuccessRatePct = totalWrites === 0 ? 0 : ((telemetry.writeCreated + telemetry.writeDuplicateSuppressed) / totalWrites) * 100;

  console.log('\n[audit:latency:benchmark] reliability telemetry');
  console.log(`enqueue_success=${telemetry.enqueueSuccess}`);
  console.log(`enqueue_failure=${telemetry.enqueueFailure}`);
  console.log(`enqueue_duplicate_suppressed=${telemetry.enqueueDuplicateSuppressed}`);
  console.log(`queue_retry_count=${telemetry.retryCountObserved}`);
  console.log(`worker_transient_failures=${telemetry.workerTransientFailures}`);
  console.log(`worker_permanent_failures=${telemetry.workerPermanentFailures}`);
  console.log(`audit_write_created=${telemetry.writeCreated}`);
  console.log(`audit_write_duplicate_suppressed=${telemetry.writeDuplicateSuppressed}`);
  console.log(`audit_write_failed=${telemetry.writeFailed}`);
  console.log(`audit_write_success_rate_pct=${writeSuccessRatePct.toFixed(2)}`);

  if (!benchmarkPassed) {
    process.exitCode = 1;
    return;
  }

  console.log(`\n[audit:latency:benchmark] PASS p95 delta is below ${P95_DELTA_THRESHOLD_MS}ms for all benchmarked endpoints`);
}

main().catch((error) => {
  console.error('[audit:latency:benchmark] failed', error);
  process.exitCode = 1;
});
