---
id: task_003
us_id: us_003
epic: EP-DATA
title: "Implement auditEvent() Service Function with Typed Input and Unit Tests"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-22
---

# TASK-003 — Implement auditEvent() Service Function with Typed Input and Unit Tests

## Context

**User Story**: US-003 — Immutable Audit Events Table with PostgreSQL Trigger Guard  
**Epic**: EP-DATA — Data Foundation  
**Addresses Acceptance Criteria**: Scenario 3 (INSERT succeeds with correct schema; all required fields accepted; `created_at` auto-set by the database)

Every feature epic (EP-001 through EP-011) will call `auditEvent()` to record domain events. The function must have a stable, typed interface so feature teams can call it without knowing the database schema details. It must also be non-blocking in the request lifecycle — audit writes should not slow down API responses.

---

## Objective

Create `backend/src/services/auditService.ts` with a typed `auditEvent()` function and a companion `AuditEventInput` interface. The function uses the Prisma client to INSERT a row. Write unit tests covering required field validation, optional field defaults, and graceful handling of a database error (audit failures must not crash the calling request).

---

## Technical Specifications

| Field | Required | Source | Notes |
|-------|----------|--------|-------|
| `actorId` | No | JWT `sub` claim | `null` for system/background events |
| `eventType` | Yes | Caller | Dot-notation string, e.g. `application.submitted` |
| `entityType` | Yes | Caller | Singular noun, e.g. `application`, `candidate` |
| `entityId` | Yes | Caller | UUID of the affected entity |
| `payload` | Yes | Caller | Structured event data (no PII beyond IDs) |
| `ipAddress` | No | `req.ip` or `X-Forwarded-For` | `null` for background jobs |
| `userAgent` | No | `req.headers['user-agent']` | `null` for background jobs |

### Standard event type catalogue (documented, not validated at runtime)

| eventType | entityType | Description |
|-----------|-----------|-------------|
| `candidate.registered` | `candidate` | New candidate account created |
| `candidate.login` | `candidate` | Successful login |
| `candidate.login_failed` | `candidate` | Failed authentication attempt |
| `candidate.locked` | `candidate` | Account locked after failed attempts |
| `application.submitted` | `application` | Application submitted by candidate |
| `application.withdrawn` | `application` | Application withdrawn |
| `application.status_changed` | `application` | Status transition |
| `screening.completed` | `screening` | AI screening result stored |
| `review.decided` | `review` | HR review decision recorded |
| `decision.created` | `decision` | Final hiring decision created |
| `decision.approved` | `approval` | Approval chain step completed |

---

## Implementation Steps

### Step 1 — Create the audit service

Create `backend/src/services/auditService.ts`:

```typescript
import { Prisma } from '@prisma/client';
import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface AuditEventInput {
  /** UUID of the acting user. Pass null for system/background events. */
  actorId: string | null;
  /** Dot-notation event identifier, e.g. 'application.submitted'. */
  eventType: string;
  /** Singular entity noun, e.g. 'application', 'candidate'. */
  entityType: string;
  /** UUID of the entity that was acted upon. */
  entityId: string;
  /** Structured event payload — must not contain raw passwords or tokens. */
  payload: Record<string, unknown>;
  /** Originating IP address from req.ip or X-Forwarded-For. */
  ipAddress?: string | null;
  /** HTTP User-Agent header value. Truncated to 512 chars if longer. */
  userAgent?: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;

/**
 * Writes a single audit event to the append-only audit_events table.
 *
 * Non-blocking contract: this function is designed to be fire-and-forget
 * in request handlers. It catches and logs database errors without re-throwing,
 * ensuring an audit write failure never crashes the calling request.
 *
 * For critical security events (login failures, lockouts) where the audit
 * write MUST succeed, use `auditEventOrThrow()` instead.
 */
export async function auditEvent(input: AuditEventInput): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: input.actorId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        payloadJson: input.payload as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent
          ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH)
          : null,
      },
    });
  } catch (err) {
    // Log the failure but do not propagate — a failed audit write must not
    // interrupt the business operation that triggered it.
    logger.error(
      { err, eventType: input.eventType, entityType: input.entityType, entityId: input.entityId },
      'auditEvent: failed to write audit record',
    );
  }
}

/**
 * Writes a single audit event and re-throws on database error.
 *
 * Use for security-critical events where the audit record is mandatory
 * (e.g. authentication failures, account lockouts — per FR-010).
 */
export async function auditEventOrThrow(input: AuditEventInput): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: input.actorId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      payloadJson: input.payload as Prisma.InputJsonValue,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent
        ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH)
        : null,
    },
  });
}
```

### Step 2 — Create an Express middleware helper for request context

Create `backend/src/utils/requestContext.ts`:

```typescript
import { Request } from 'express';

/**
 * Extracts the client IP address from an Express request.
 * Prefers X-Forwarded-For (Railway proxy) over req.ip.
 * Returns the first IP in the chain (the real client IP).
 */
export function extractIpAddress(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    return first ?? null;
  }
  return req.ip ?? null;
}

/**
 * Returns the User-Agent header value from the request.
 * Returns null if not present or if the value is not a string.
 */
export function extractUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : null;
}
```

### Step 3 — Write unit tests

Create `backend/src/services/__tests__/auditService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/prisma', () => ({
  default: {
    auditEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import prisma from '../../db/prisma';
import logger from '../../utils/logger';
import { auditEvent, auditEventOrThrow } from '../auditService';

const mockCreate = vi.mocked(
  (prisma as unknown as { auditEvent: { create: ReturnType<typeof vi.fn> } })
    .auditEvent.create,
);
const mockLogError = vi.mocked(logger.error);

const baseInput = {
  actorId: 'user-uuid-123',
  eventType: 'application.submitted',
  entityType: 'application',
  entityId: 'app-uuid-456',
  payload: { applicationId: 'app-uuid-456', requisitionId: 'req-uuid-789' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'audit-uuid' });
});

describe('auditEvent', () => {
  it('calls prisma.auditEvent.create with all required fields', async () => {
    await auditEvent(baseInput);

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'user-uuid-123',
          eventType: 'application.submitted',
          entityType: 'application',
          entityId: 'app-uuid-456',
          payloadJson: baseInput.payload,
        }),
      }),
    );
  });

  it('sets ipAddress and userAgent when provided', async () => {
    await auditEvent({
      ...baseInput,
      ipAddress: '203.0.113.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: '203.0.113.1',
          userAgent: 'Mozilla/5.0',
        }),
      }),
    );
  });

  it('sets ipAddress and userAgent to null when omitted', async () => {
    await auditEvent(baseInput);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: null,
          userAgent: null,
        }),
      }),
    );
  });

  it('truncates userAgent longer than 512 characters', async () => {
    const longAgent = 'A'.repeat(600);
    await auditEvent({ ...baseInput, userAgent: longAgent });

    const call = mockCreate.mock.calls[0];
    const userAgent = (call as [{ data: { userAgent: string } }])[0].data.userAgent;
    expect(userAgent).toHaveLength(512);
  });

  it('accepts null actorId for system events', async () => {
    await auditEvent({ ...baseInput, actorId: null });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: null }),
      }),
    );
  });

  it('swallows database error and logs it without re-throwing', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'));

    // Must not throw
    await expect(auditEvent(baseInput)).resolves.toBeUndefined();

    expect(mockLogError).toHaveBeenCalledOnce();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'application.submitted' }),
      'auditEvent: failed to write audit record',
    );
  });
});

describe('auditEventOrThrow', () => {
  it('re-throws database error', async () => {
    mockCreate.mockRejectedValue(new Error('DB connection lost'));

    await expect(auditEventOrThrow(baseInput)).rejects.toThrow('DB connection lost');
  });

  it('resolves when insert succeeds', async () => {
    await expect(auditEventOrThrow(baseInput)).resolves.toBeUndefined();
  });
});
```

### Step 4 — Export from services index

Create (or update) `backend/src/services/index.ts`:

```typescript
export { auditEvent, auditEventOrThrow } from './auditService';
export type { AuditEventInput } from './auditService';
```

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| `auditEvent()` inserts all fields | Unit test | `create` called with correct data |
| `userAgent` truncated at 512 chars | Unit test | Length = 512 |
| DB error swallowed in `auditEvent` | Unit test | Resolves, logger.error called |
| DB error thrown in `auditEventOrThrow` | Unit test | Rejects with error |
| `null` actorId accepted | Unit test | Data has `actorId: null` |
| `npm test` | CLI | All 8 unit tests green |
| `npm run type-check` | CLI | Exit 0 |

---

## Dependencies

- **TASK-001** must be complete (`userAgent` field in Prisma generated types)
- **EP-TECH / US-005 / TASK-002** — Pino logger must exist (`logger.error`)

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: The `payload` parameter is typed as `Record<string, unknown>`. Callers must ensure the payload does not contain raw passwords, session tokens, or full PII fields. The audit service does not redact payload content — that responsibility lies with the caller at the use-case layer.
- **OWASP A04 (Insecure Design)**: `auditEvent()` (fire-and-forget) is used for non-critical events. `auditEventOrThrow()` is used for security-critical events (FR-010: authentication failures, lockouts) where a silent audit failure would be a compliance gap. Feature teams must choose the correct variant.
- `userAgent` is truncated at 512 characters before storage to prevent log injection through overlong user-agent strings. The truncation happens silently — it is not an error condition.

---

## Definition of Done

- [ ] `backend/src/services/auditService.ts` committed with `auditEvent` and `auditEventOrThrow`
- [ ] `backend/src/utils/requestContext.ts` committed with `extractIpAddress` and `extractUserAgent`
- [ ] `backend/src/services/index.ts` exports both functions and the type
- [ ] Unit tests committed (8 tests, all passing)
- [ ] `npm test` exits 0
- [ ] `npm run type-check` exits 0

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-003 |
| Epic | EP-DATA |
| Scenario | 3 (INSERT with all required fields; created_at auto-set) |
| Spec ref | FR-010 (audit logging), FR-066 (audit log viewer — payload shape) |
