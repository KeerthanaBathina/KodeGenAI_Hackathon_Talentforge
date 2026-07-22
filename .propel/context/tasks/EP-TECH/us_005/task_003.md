---
id: task_003
us_id: us_005
epic: EP-TECH
title: "Initialise OpenTelemetry SDK with Grafana Cloud OTLP Exporter"
status: not-started
layer: backend
effort: 5h
priority: critical
created: 2026-07-22
---

# TASK-003 — Initialise OpenTelemetry SDK with Grafana Cloud OTLP Exporter

## Context

**User Story**: US-005 — Security Middleware, Structured Logging, and OpenTelemetry Observability  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 2 (`POST /api/applications` call produces a trace with HTTP, Prisma query, and BullMQ enqueue spans visible in Grafana Cloud within 30 seconds)

OpenTelemetry is the vendor-neutral standard for distributed tracing. This task initialises the Node.js SDK before any application code runs, auto-instruments Express HTTP spans and Prisma query spans, manually instruments a BullMQ enqueue span, and exports traces to Grafana Cloud via OTLP/HTTP.

---

## Objective

Create `backend/src/telemetry/otel.ts` as the SDK initialisation module, require it as the first import in `server.ts` (before `express`, `prisma`, or any application code), configure an OTLP HTTP exporter targeting Grafana Cloud's OTLP endpoint, and verify a trace appears in Grafana Tempo within 30 seconds of a request.

---

## Technical Specifications

| Attribute | Value |
|-----------|-------|
| SDK | `@opentelemetry/sdk-node` |
| Auto-instrumentation | `@opentelemetry/auto-instrumentations-node` |
| Exporter | `@opentelemetry/exporter-trace-otlp-http` |
| Target | Grafana Cloud — OTLP endpoint (`https://otlp-gateway-<stack>.grafana.net/otlp`) |
| Authentication | Basic auth — `instanceId:apiToken` base64-encoded in `Authorization` header |
| Service name | `ai-interview-backend` |
| Span kinds captured | HTTP (Express), DB (Prisma), Messaging (BullMQ — manual) |
| Export interval | 5 seconds (batch span processor default) |

---

## Implementation Steps

### Step 1 — Install OpenTelemetry packages

```bash
cd backend
npm install \
  @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions \
  @opentelemetry/api
```

### Step 2 — Add Grafana Cloud credentials to environment

Update `backend/src/config/env.ts` to include OTel variables:

```typescript
const envSchema = z.object({
  // ... existing fields ...
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),  // "Authorization=Basic <base64>"
  OTEL_SERVICE_NAME: z.string().default('ai-interview-backend'),
});
```

Update `backend/.env.example`:

```env
# OpenTelemetry — Grafana Cloud OTLP
# Endpoint: copy from Grafana Cloud → Stack → OpenTelemetry → OTLP endpoint URL
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-<stack>.grafana.net/otlp
# Headers: base64(<grafana-instance-id>:<grafana-api-token>)
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64-credentials>
OTEL_SERVICE_NAME=ai-interview-backend
```

Add to Railway production and staging environment variables.

### Step 3 — Create the OTel initialisation module

Create `backend/src/telemetry/otel.ts`:

```typescript
/**
 * OpenTelemetry SDK initialisation.
 *
 * CRITICAL: This module MUST be imported before any other application module.
 * Auto-instrumentation patches Node.js built-ins and third-party libraries at import time.
 * Importing Express, Prisma, or http BEFORE this module results in missing spans.
 *
 * Usage in server.ts:
 *   import './telemetry/otel';   // Must be the FIRST import
 *   import express from 'express';
 *   ...
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Only initialise when OTel endpoint is configured (allows disabling in local dev without a Grafana account)
const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

if (!endpoint) {
  console.info('[otel] OTEL_EXPORTER_OTLP_ENDPOINT not set — tracing disabled');
} else {
  const headersRaw = process.env['OTEL_EXPORTER_OTLP_HEADERS'] ?? '';

  // Parse "Key=Value,Key2=Value2" header string into a Record
  const headers: Record<string, string> = {};
  for (const pair of headersRaw.split(',')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const key = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (key && value) headers[key] = value;
    }
  }

  const exporter = new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
    // 10 second export timeout — do not let export failures slow down request handling
    timeoutMillis: 10_000,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: process.env['OTEL_SERVICE_NAME'] ?? 'ai-interview-backend',
      [ATTR_SERVICE_VERSION]: process.env['npm_package_version'] ?? '0.0.0',
      'deployment.environment': process.env['NODE_ENV'] ?? 'development',
    }),

    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 1000,
        scheduledDelayMillis: 5_000,  // Flush every 5 s
        exportTimeoutMillis: 10_000,
      }),
    ],

    instrumentations: [
      getNodeAutoInstrumentations({
        // HTTP spans — captures all Express routes automatically
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // Exclude health probe paths to reduce span noise
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return ['/health', '/ready'].some(p => url.startsWith(p));
          },
        },
        // Express spans — route-level breakdown
        '@opentelemetry/instrumentation-express': { enabled: true },
        // Prisma spans — query-level tracing
        '@opentelemetry/instrumentation-prisma': { enabled: true },
        // Redis / Upstash REST client — not auto-instrumented (HTTP-based)
        // BullMQ spans are added manually (Step 4)
        '@opentelemetry/instrumentation-ioredis': { enabled: false },
        // Reduce noise — disable unused instrumentations
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  // Graceful shutdown — flush pending spans before process exits
  process.on('SIGTERM', async () => {
    try {
      await sdk.shutdown();
      console.info('[otel] SDK shut down successfully');
    } catch (err) {
      console.error('[otel] Error shutting down SDK:', err);
    }
  });

  console.info(`[otel] Tracing initialised → ${endpoint}`);
}
```

### Step 4 — Add OTel import as first line of `server.ts`

Update `backend/src/server.ts`:

```typescript
// OpenTelemetry MUST be the first import — patches require() hooks at load time
import './telemetry/otel';

import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initSocketServer } from './socket';
import prisma from './db/prisma';
// ... rest unchanged
```

### Step 5 — Create a BullMQ span helper for manual instrumentation

Feature epics will use BullMQ to enqueue background jobs. This helper wraps enqueue operations in an OTel span so the "BullMQ enqueue" span appears in Grafana traces per the acceptance criterion.

Create `backend/src/telemetry/spans.ts`:

```typescript
import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('ai-interview-backend');

/**
 * Wraps a BullMQ job enqueue operation in an OpenTelemetry messaging span.
 *
 * Usage:
 *   import { withEnqueueSpan } from '../telemetry/spans';
 *   await withEnqueueSpan('ai-screening-queue', 'screening.start', async () => {
 *     await screeningQueue.add('screening.start', payload);
 *   });
 */
export async function withEnqueueSpan<T>(
  queueName: string,
  jobName: string,
  operation: () => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(`${queueName} enqueue`, {
    kind: SpanKind.PRODUCER,
    attributes: {
      'messaging.system': 'bullmq',
      'messaging.destination': queueName,
      'messaging.operation': 'send',
      'messaging.bullmq.job_name': jobName,
    },
  });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Creates an ad-hoc span for any operation.
 * Use when auto-instrumentation does not cover a specific library.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  operation: () => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, { attributes, kind: SpanKind.INTERNAL });

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}
```

### Step 6 — Add Pino–OTel correlation (inject traceId into log lines)

Update `backend/src/utils/logger.ts` to include the active span's trace ID in every log line:

```typescript
import { trace } from '@opentelemetry/api';

export const logger = pino({
  // ... existing config ...
  mixin() {
    const span = trace.getActiveSpan();
    if (!span) return {};
    const { traceId, spanId } = span.spanContext();
    return { traceId, spanId };
  },
});
```

This injects `traceId` into every Pino log line, enabling log-to-trace correlation in Grafana.

### Step 7 — Verify traces in Grafana Cloud

1. Set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` in `backend/.env`
2. Start the server: `npm run dev`
3. Make a request: `curl http://localhost:3001/health` (excluded from tracing to reduce noise)
4. Make a non-excluded request: `curl http://localhost:3001/ping` (the test route from US-003)
5. Wait up to 30 s for the batch exporter to flush
6. In **Grafana Cloud → Explore → Tempo**, query by service name `ai-interview-backend`
7. Confirm a trace appears with spans:
   - `HTTP GET /ping` (from Express auto-instrumentation)
   - `middleware - rateLimitMiddleware` (Express route-level span)

The `POST /api/applications` span with Prisma + BullMQ spans referenced in the acceptance criterion will appear once EP-001/EP-002 implement the applications endpoint. The OTel infrastructure established in this task will automatically capture those spans.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| OTel module loads | `npm run dev` | `[otel] Tracing initialised → https://...` logged |
| No OTel startup crash | Server starts without errors | `/health` returns 200 |
| Trace exported | `curl http://localhost:3001/ping` + wait 30 s | Trace visible in Grafana Tempo |
| HTTP span present | Grafana Tempo query | `HTTP GET /ping` span with duration |
| `/health` excluded | Make GET /health, check Grafana | No span for health probe |
| `traceId` in Pino logs | Check log output after request | `traceId` UUID present in log line |
| Graceful shutdown flushes spans | `kill -SIGTERM <pid>` | `[otel] SDK shut down successfully` logged |
| Disabled when env not set | Remove `OTEL_EXPORTER_OTLP_ENDPOINT`, restart | `[otel] tracing disabled` logged; no crash |
| TypeScript compiles | `npm run type-check` | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete (Helmet in `app.ts`)
- **TASK-002** must be complete (Pino logger — OTel trace correlation added in Step 6)
- Grafana Cloud account provisioned (free tier Grafana Cloud supports OTLP ingestion)
- `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` credentials obtained from Grafana Cloud

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: Grafana Cloud OTLP credentials stored in Railway Variables and `backend/.env` (git-ignored). Never committed.
- **OWASP A09 (Security Logging and Monitoring Failures)**: `traceId` injected into Pino logs enables log-to-trace correlation in Grafana, satisfying the observability requirement without transmitting PII to the trace backend.
- OTel spans do NOT include request bodies — they capture only HTTP metadata (method, route, status code). PII in request bodies is handled exclusively by Pino's redact configuration (TASK-002).
- Export timeout is capped at 10 s and runs asynchronously — a Grafana Cloud outage cannot slow down API responses.
- Health probe paths (`/health`, `/ready`) are excluded from tracing to prevent high-cardinality Railway health check spans from polluting the trace backend.

---

## Definition of Done

- [ ] OTel packages installed and version-pinned
- [ ] `backend/src/telemetry/otel.ts` committed
- [ ] `backend/src/telemetry/spans.ts` committed with `withEnqueueSpan` and `withSpan` helpers
- [ ] `import './telemetry/otel'` is the first import in `server.ts`
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` added to `env.ts` (optional) and `.env.example`
- [ ] Grafana Cloud credentials configured in Railway staging and production Variables
- [ ] Trace visible in Grafana Cloud Tempo within 30 s of a non-excluded request
- [ ] `traceId` present in Pino log lines when a span is active
- [ ] OTel disabled gracefully when endpoint not configured (no crash)
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-005 |
| Epic | EP-TECH |
| NFR | NFR-007 (OpenTelemetry, distributed tracing, Grafana Cloud) |
| Scenario | 2 (HTTP + Prisma + BullMQ spans visible in Grafana within 30 s) |
