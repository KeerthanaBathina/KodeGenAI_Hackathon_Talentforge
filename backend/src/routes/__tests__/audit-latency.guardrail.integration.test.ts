import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueAuditEvent: vi.fn(),
  createAuditEventQueueJobData: vi.fn((event: any, options: any) => ({
    event,
    idempotencyKey: options?.idempotencyKey,
    source: options?.source ?? 'auditService',
    requestedAt: options?.requestedAt ?? new Date().toISOString(),
  })),
  prismaAuditFindFirst: vi.fn(),
  prismaAuditCreate: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('../../queues/auditEventQueue', () => ({
  createAuditEventQueueJobData: mocks.createAuditEventQueueJobData,
  enqueueAuditEvent: mocks.enqueueAuditEvent,
}));

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      findFirst: mocks.prismaAuditFindFirst,
      create: mocks.prismaAuditCreate,
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}));

import {
  auditEvent,
  persistAuditEventOrThrow,
} from '../../services/auditService';

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }

  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function createLatencyHarnessApp(auditEnabled: boolean): express.Express {
  const app = express();
  app.use(express.json());

  app.post('/api/decisions', async (req, res) => {
    const applicationId = String(req.body.applicationId ?? '550e8400-e29b-41d4-a716-446655440000');

    if (auditEnabled) {
      await auditEvent({
        actorId: '11111111-1111-1111-1111-111111111111',
        eventType: 'decision.application_decision',
        entityType: 'application',
        entityId: applicationId,
        payload: {
          requestId: String(req.headers['x-request-id'] ?? 'no-request-id'),
          outcome: 'offer',
        },
        ipAddress: '203.0.113.10',
        userAgent: 'latency-test',
      });
    }

    res.status(201).json({ success: true });
  });

  app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body.email ?? 'benchmark@example.com').toLowerCase();

    if (auditEnabled) {
      await auditEvent({
        actorId: null,
        eventType: 'auth.login',
        entityType: 'user',
        entityId: '00000000-0000-0000-0000-000000000000',
        payload: {
          requestId: String(req.headers['x-request-id'] ?? 'no-request-id'),
          email,
        },
        ipAddress: '203.0.113.11',
        userAgent: 'latency-test',
      });
    }

    res.status(200).json({ success: true });
  });

  return app;
}

async function sampleLatency(
  app: express.Express,
  path: '/api/decisions' | '/api/auth/login',
  payload: Record<string, unknown>,
  expectedStatus: number,
  iterations: number
): Promise<number[]> {
  const samples: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const started = performance.now();
    const response = await request(app)
      .post(path)
      .set('x-request-id', `${path}-${i}`)
      .send(payload);
    samples.push(performance.now() - started);

    expect(response.status).toBe(expectedStatus);
  }

  return samples;
}

describe('Audit latency and reliability guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueAuditEvent.mockResolvedValue('audit-job-1');
    mocks.prismaAuditFindFirst.mockResolvedValue(null);
    mocks.prismaAuditCreate.mockResolvedValue({ id: 'audit-row-1' });
  });

  it('keeps P95 latency delta below 10ms for decisions and auth endpoints', async () => {
    const baselineApp = createLatencyHarnessApp(false);
    const auditedApp = createLatencyHarnessApp(true);

    const iterations = 80;

    const [baselineDecision, auditedDecision, baselineAuth, auditedAuth] = await Promise.all([
      sampleLatency(
        baselineApp,
        '/api/decisions',
        {
          applicationId: '550e8400-e29b-41d4-a716-446655440000',
          outcome: 'offer',
          reasonCodeId: '660e8400-e29b-41d4-a716-446655440001',
          justification: 'Deterministic benchmark payload for decision endpoint latency guardrail.',
        },
        201,
        iterations
      ),
      sampleLatency(
        auditedApp,
        '/api/decisions',
        {
          applicationId: '550e8400-e29b-41d4-a716-446655440000',
          outcome: 'offer',
          reasonCodeId: '660e8400-e29b-41d4-a716-446655440001',
          justification: 'Deterministic benchmark payload for decision endpoint latency guardrail.',
        },
        201,
        iterations
      ),
      sampleLatency(
        baselineApp,
        '/api/auth/login',
        {
          email: 'benchmark.user@example.com',
          password: 'BenchmarkPass123!',
        },
        200,
        iterations
      ),
      sampleLatency(
        auditedApp,
        '/api/auth/login',
        {
          email: 'benchmark.user@example.com',
          password: 'BenchmarkPass123!',
        },
        200,
        iterations
      ),
    ]);

    const p95DecisionDelta = percentile(auditedDecision, 95) - percentile(baselineDecision, 95);
    const p95AuthDelta = percentile(auditedAuth, 95) - percentile(baselineAuth, 95);

    expect(p95DecisionDelta).toBeLessThan(10);
    expect(p95AuthDelta).toBeLessThan(10);
  });

  it('suppresses duplicate audit persistence on replayed idempotency key', async () => {
    const event = {
      actorId: '11111111-1111-1111-1111-111111111111',
      eventType: 'decision.application_decision',
      entityType: 'application',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
      payload: {
        reasonCodeId: '660e8400-e29b-41d4-a716-446655440001',
      },
      ipAddress: '203.0.113.20',
      userAgent: 'integration-test',
    };

    mocks.prismaAuditFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-audit-id' });

    const first = await persistAuditEventOrThrow(event, {
      idempotencyKey: 'request-dup-1',
      source: 'integration-test',
    });

    const second = await persistAuditEventOrThrow(event, {
      idempotencyKey: 'request-dup-1',
      source: 'integration-test',
    });

    expect(first).toBe('created');
    expect(second).toBe('duplicate_suppressed');
    expect(mocks.prismaAuditCreate).toHaveBeenCalledTimes(1);
  });

  it('keeps request successful when enqueue fails and fallback direct-write succeeds', async () => {
    mocks.enqueueAuditEvent.mockRejectedValueOnce(new Error('redis unavailable'));
    mocks.prismaAuditFindFirst.mockResolvedValue(null);
    mocks.prismaAuditCreate.mockResolvedValue({ id: 'fallback-audit-id' });

    const app = createLatencyHarnessApp(true);

    const response = await request(app).post('/api/decisions').send({
      applicationId: '550e8400-e29b-41d4-a716-446655440000',
      outcome: 'offer',
      reasonCodeId: '660e8400-e29b-41d4-a716-446655440001',
      justification: 'Fallback path verification payload.',
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);

    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.prismaAuditCreate).toHaveBeenCalledTimes(1);
  });
});
