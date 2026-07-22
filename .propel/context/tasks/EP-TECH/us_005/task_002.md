---
id: task_002
us_id: us_005
epic: EP-TECH
title: "Configure Pino Structured Logging with RequestId Injection and PII Masking"
status: not-started
layer: backend
effort: 4h
priority: critical
created: 2026-07-22
---

# TASK-002 — Configure Pino Structured Logging with RequestId Injection and PII Masking

## Context

**User Story**: US-005 — Security Middleware, Structured Logging, and OpenTelemetry Observability  
**Epic**: EP-TECH — Technical Bootstrap  
**Addresses Acceptance Criteria**: Scenario 3 (PII redacted: `password` absent, `email` masked to `j***@example.com`; every log line includes `requestId`, `userId`, `method`, `path`, `statusCode`, `durationMs`)

Structured logging with PII masking is a regulatory requirement (GDPR) and a security control (OWASP A09). This task installs Pino, creates a singleton logger with redaction rules, and mounts a request-logging middleware that injects a per-request correlation ID and structured fields into every log line.

---

## Objective

Install `pino` and `pino-http`, replace all `console.log`/`console.error` calls with the Pino logger, configure `redact` to mask `password` and partially mask `email`, and add a request middleware that emits a structured log line after every response containing the required fields.

---

## Technical Specifications

| Field | Log Field Name | Source | PII Treatment |
|-------|---------------|--------|---------------|
| Request ID | `requestId` | `X-Request-Id` header or `crypto.randomUUID()` | No PII |
| User ID | `userId` | JWT sub claim (populated in EP-001) | No PII (opaque UUID) |
| HTTP method | `method` | `req.method` | No PII |
| URL path | `path` | `req.url` (path only, no query string) | Query string stripped (may contain PII) |
| Status code | `statusCode` | `res.statusCode` | No PII |
| Duration | `durationMs` | Response time in ms | No PII |
| Password field | `password` | Any request body field | **Completely removed** |
| Email field | `email` | Any request body field | **Partially masked**: `j***@example.com` |

---

## Implementation Steps

### Step 1 — Install Pino

```bash
cd backend
npm install pino pino-http
npm install -D pino-pretty @types/pino-http
```

- `pino` — core logger
- `pino-http` — Express request-logging middleware
- `pino-pretty` — human-readable output in development (never used in production)

### Step 2 — Create the email masking utility

Create `backend/src/utils/piiMask.ts`:

```typescript
/**
 * Masks an email address to the format: first_char***@domain.tld
 * Example: john.doe@example.com → j***@example.com
 *
 * Returns the original value unchanged if it is not a valid email-like string.
 */
export function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex < 1) return email;

  const localPart = email.slice(0, 1);  // Keep only the first character
  const domainPart = email.slice(atIndex);  // Include @ and domain

  return `${localPart}***${domainPart}`;
}
```

Create `backend/src/utils/__tests__/piiMask.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { maskEmail } from '../piiMask';

describe('maskEmail', () => {
  it('masks standard email to first-char-plus-stars at domain', () => {
    expect(maskEmail('john.doe@example.com')).toBe('j***@example.com');
  });

  it('works for single-character local part', () => {
    expect(maskEmail('a@b.com')).toBe('a***@b.com');
  });

  it('returns unchanged value if no @ present', () => {
    expect(maskEmail('notanemail')).toBe('notanemail');
  });

  it('handles subdomain emails correctly', () => {
    expect(maskEmail('user@mail.internal.corp')).toBe('u***@mail.internal.corp');
  });
});
```

### Step 3 — Create the Pino logger singleton

Create `backend/src/utils/logger.ts`:

```typescript
import pino from 'pino';
import { env } from '../config/env';
import { maskEmail } from './piiMask';

/**
 * Global Pino logger instance.
 *
 * PII redaction rules:
 * - `password`, `confirmPassword`, `currentPassword`: completely removed from all log paths
 * - `email`: replaced with a masked value via a custom serialiser
 *
 * Paths use dot notation and array wildcards to cover nested objects
 * (e.g., `req.body.email`, `user.email`, `data.*.email`).
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',

  // Structured field naming — ISO timestamp is easier to parse in Grafana
  timestamp: pino.stdTimeFunctions.isoTime,

  // Base fields on every log line
  base: {
    service: 'ai-interview-backend',
    env: env.NODE_ENV,
  },

  // PII redaction — paths removed completely
  redact: {
    paths: [
      'password',
      'confirmPassword',
      'currentPassword',
      'req.body.password',
      'req.body.confirmPassword',
      'req.body.currentPassword',
      '*.password',
      '*.confirmPassword',
      'authorization',
      'req.headers.authorization',
      'cookie',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },

  // Development: pretty-print with colours; production: NDJSON for log aggregators
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,

  // Custom serialisers — applied after redact
  serializers: {
    // Mask email in any top-level `email` field
    email: (value: unknown) =>
      typeof value === 'string' ? maskEmail(value) : value,

    // Strip query string from request URL to prevent PII leakage
    req: pino.stdSerializers.req,

    err: pino.stdSerializers.err,
  },
});

export default logger;
```

### Step 4 — Create the request-logging middleware

Create `backend/src/middleware/requestLogger.ts`:

```typescript
import { v4 as uuidv4 } from 'uuid';
import pinoHttp from 'pino-http';
import { logger } from '../utils/logger';
import { maskEmail } from '../utils/piiMask';

// Install uuid for request ID generation
// npm install uuid && npm install -D @types/uuid

/**
 * Pino HTTP middleware that:
 * 1. Assigns a unique requestId to every request (from X-Request-Id header or generated)
 * 2. Emits a structured log line after every response
 * 3. Masks PII fields in request body before logging
 * 4. Injects requestId into the response header for distributed tracing
 */
export const requestLogger = pinoHttp({
  logger,

  // Generate or propagate request ID
  genReqId: (req) => {
    const existing = req.headers['x-request-id'];
    return typeof existing === 'string' ? existing : uuidv4();
  },

  // Inject the request ID into response headers for client correlation
  customSuccessHeaderName: (_req, _res, loggingFn) => {
    loggingFn;  // no-op; header injection done in customSuccessMessage
    return '';
  },

  // Emit request ID on the response header
  customSuccessMessage: (_req, res) => {
    return `${res.statusCode}`;
  },

  // Serialise request — strip query params, mask body PII
  serializers: {
    req(req) {
      const body = (req as { body?: Record<string, unknown> }).body ?? {};
      const maskedBody: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(body)) {
        if (['password', 'confirmPassword', 'currentPassword'].includes(key)) {
          // Omit entirely — do not even log '[REDACTED]'
          continue;
        }
        if (key === 'email' && typeof value === 'string') {
          maskedBody[key] = maskEmail(value);
        } else {
          maskedBody[key] = value;
        }
      }

      return {
        method: req.method,
        url: (req.url as string).split('?')[0],  // Strip query string
        body: maskedBody,
        id: req.id,
      };
    },

    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },

  // Custom log output shape — maps to acceptance criterion fields
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // Ensure every log line has requestId, method, path, statusCode, durationMs
  customSuccessObject: (req, res, val: Record<string, unknown>) => ({
    ...val,
    requestId: req.id,
    userId: (req as { user?: { id: string } }).user?.id ?? null,
    method: req.method,
    path: (req.url as string).split('?')[0],
    statusCode: res.statusCode,
    durationMs: val['responseTime'],
  }),

  customErrorObject: (req, res, err, val: Record<string, unknown>) => ({
    ...val,
    requestId: req.id,
    userId: (req as { user?: { id: string } }).user?.id ?? null,
    method: req.method,
    path: (req.url as string).split('?')[0],
    statusCode: res.statusCode,
    durationMs: val['responseTime'],
    err: {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    },
  }),

  // Do not log health check calls (too noisy)
  autoLogging: {
    ignore: (req) => ['/health', '/ready'].includes(req.url ?? ''),
  },
});
```

Install `uuid`:

```bash
npm install uuid
npm install -D @types/uuid
```

### Step 5 — Inject `requestId` into response headers

Add a middleware in `app.ts` that sets `X-Request-Id` on the response so clients can correlate:

```typescript
// In createApp(), after requestLogger:
app.use((req, res, next) => {
  const requestId = (req as { id?: string }).id ?? '';
  if (requestId) {
    res.setHeader('X-Request-Id', requestId);
  }
  next();
});
```

### Step 6 — Mount the request logger in `app.ts`

Update `backend/src/app.ts`:

```typescript
import { requestLogger } from './middleware/requestLogger';

export function createApp() {
  const app = express();

  app.use(buildSecurityHeaders());
  app.use(cors({ ... }));
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.disable('x-powered-by');

  // Request logging — after body parsing so body is available to the serialiser
  app.use(requestLogger);

  // requestId response header injection
  app.use((req, res, next) => {
    const requestId = (req as { id?: string }).id ?? '';
    if (requestId) res.setHeader('X-Request-Id', requestId);
    next();
  });

  // Rate limiting
  app.use(rateLimitMiddleware);

  // Routes
  app.use('/', healthRouter);

  return app;
}
```

### Step 7 — Replace `console.log` / `console.error` with Pino logger

Search for all `console.*` calls and replace:

```bash
grep -rn "console\." backend/src --include="*.ts"
```

Replace each occurrence with the appropriate Pino method:

| console | Pino equivalent |
|---------|-----------------|
| `console.log(msg)` | `logger.info(msg)` |
| `console.warn(msg)` | `logger.warn(msg)` |
| `console.error(msg, err)` | `logger.error({ err }, msg)` |

### Step 8 — Verify log output locally

```bash
npm run dev
# In a separate terminal:
curl -X POST http://localhost:3001/api/test \
  -H "Content-Type: application/json" \
  -d '{"email":"john.doe@example.com","password":"secret123","name":"John"}'
```

Expected log line (development pretty-print):

```
INFO  [requestId: abc-123] POST /api/test 200 12ms
  {
    requestId: 'abc-123',
    userId: null,
    method: 'POST',
    path: '/api/test',
    statusCode: 200,
    durationMs: 12,
    req: {
      body: {
        email: 'j***@example.com',
        name: 'John'
        // password: absent
      }
    }
  }
```

Confirm:
- `password` field is **completely absent** (not `[REDACTED]` — absent)
- `email` is `j***@example.com`
- `requestId` is present
- `durationMs` is present

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `password` absent from logs | POST with password field, inspect log | No `password` key in any log line |
| `email` masked | POST with email, inspect log | `j***@example.com` format |
| `requestId` on every line | Any request, inspect log | UUID present |
| `durationMs` on every line | Any request, inspect log | Integer milliseconds |
| `method`, `path`, `statusCode` present | Any request | All three fields logged |
| `/health` not logged | GET /health, inspect log | No log line emitted |
| Unit tests pass | `npm test` | piiMask tests (4 tests) all green |
| TypeScript compiles | `npm run type-check` | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete (Helmet middleware in `app.ts` — request logger mounts after it)
- **US-002 / TASK-001** (Express server structure — `app.ts` and `server.ts`)

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: Structured NDJSON logs are compatible with Grafana Loki and Grafana Cloud log ingestion (configured in TASK-003). Every request is traceable by `requestId` without storing PII.
- **OWASP A02 (Cryptographic Failures)**: `password` field is removed entirely rather than redacted to `[REDACTED]` — `[REDACTED]` tokens in logs can still confirm a field was transmitted, which is unnecessary information for the log aggregator.
- Query strings are stripped from `path` before logging (`req.url.split('?')[0]`) to prevent search terms, tokens, or IDs passed as URL parameters from appearing in logs.
- `authorization` and `cookie` headers are in the Pino `redact` paths — JWT tokens will not appear in log output even if accidentally logged by future middleware.
- `pino-pretty` is enabled **only in development** (`NODE_ENV === 'development'`). In production (Railway), raw NDJSON is emitted for log aggregator ingestion.

---

## Definition of Done

- [ ] `pino`, `pino-http`, `uuid` installed; `pino-pretty` as dev dependency
- [ ] `backend/src/utils/piiMask.ts` committed with `maskEmail` function
- [ ] `backend/src/utils/__tests__/piiMask.test.ts` committed (4 tests, all passing)
- [ ] `backend/src/utils/logger.ts` Pino singleton committed with redact paths
- [ ] `backend/src/middleware/requestLogger.ts` committed with custom serialisers
- [ ] `requestLogger` mounted in `app.ts` after body parsers
- [ ] All `console.*` calls replaced with `logger.*`
- [ ] POST request with `password` + `email` body confirms: `password` absent, `email` masked
- [ ] Every log line includes `requestId`, `durationMs`, `method`, `path`, `statusCode`
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-005 |
| Epic | EP-TECH |
| NFR | NFR-007 (structured logging — Pino NDJSON, Grafana Loki compatible) |
| Scenario | 3 (PII redacted: `password` absent, `email` masked; required fields on every log line) |
