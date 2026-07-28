---
id: task_002
us_id: us_002
epic: EP-008
title: "Integrate Resend SDK and Implement Idempotency"
status: completed
layer: backend
effort: 4h
priority: high
created: 2026-07-29
completed: 2026-07-29
---

# TASK-002 — Integrate Resend SDK and Implement Idempotency

## Context

**User Story**: US-002 — Email Delivery via Resend API with Exponential Backoff Retry  
**Epic**: EP-008 — Communication Service  
**Addresses**: Scenario 1, 4

Integrate Resend SDK for email delivery with idempotency key generation to prevent duplicate email sends. The service must handle Resend API responses and errors appropriately for retry logic.

---

## Objective

Implement:
1. Resend SDK installation and configuration
2. Email sending service with Resend API integration
3. Idempotency key generation (`<event_type>:<entity_id>:<recipient_email>` hash)
4. API error handling (distinguish transient vs permanent failures)
5. Response parsing and message ID extraction

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| SDK package | `resend` (npm package) |
| API key source | `RESEND_API_KEY` environment variable |
| Idempotency pattern | SHA-256 hash of `<event_type>:<entity_id>:<recipient_email>` |
| From address | `RESEND_FROM_EMAIL` environment variable (e.g., `noreply@talentforge.com`) |
| Retry on HTTP | 500, 502, 503, 504 (server errors) |
| Fail on HTTP | 400, 401, 403, 404, 422 (client errors) |
| Timeout | 10 seconds per API call |

---

## Implementation Steps

### Step 1 — Install and configure Resend SDK

1. Add dependency: `npm install resend --save`
2. Add environment variables to `.env.example` and `backend/src/config/env.ts`:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxx
   RESEND_FROM_EMAIL=noreply@talentforge.com
   ```
3. Validate environment variables in `env.ts` schema:
   ```typescript
   RESEND_API_KEY: z.string().min(10),
   RESEND_FROM_EMAIL: z.string().email(),
   ```

### Step 2 — Create idempotency key generator

1. Create `backend/src/utils/idempotencyKey.ts`
2. Implement hash function:
   ```typescript
   import crypto from 'crypto';

   export function generateEmailIdempotencyKey(
     eventType: string,
     entityId: string,
     recipientEmail: string
   ): string {
     const input = `${eventType}:${entityId}:${recipientEmail.toLowerCase()}`;
     return crypto.createHash('sha256').update(input).digest('hex');
   }
   ```
3. Export function for queue and worker use

**Idempotency examples**:
- `application_received:app-123:candidate@example.com` → hash
- `offer_extended:offer-456:candidate@example.com` → hash
- Same inputs always produce same hash (deduplication)

### Step 3 — Create Resend email service

1. Create `backend/src/services/resendEmailService.ts`
2. Initialize Resend client:
   ```typescript
   import { Resend } from 'resend';
   import { env } from '../config/env';

   const resend = new Resend(env.RESEND_API_KEY);
   ```

3. Implement send function:
   ```typescript
   export interface SendEmailViaResendInput {
     to: string;
     subject: string;
     html: string;
     text: string;
     idempotencyKey: string;
   }

   export interface SendEmailViaResendResult {
     messageId: string;
     success: boolean;
   }

   export async function sendEmailViaResend(
     input: SendEmailViaResendInput
   ): Promise<SendEmailViaResendResult> {
     // Call Resend API with idempotency headers
     // Return messageId on success
     // Throw error on failure (for retry logic)
   }
   ```

### Step 4 — Implement error handling

1. Classify Resend errors by HTTP status:
   - **Transient (retry)**: 500, 502, 503, 504, timeout
   - **Permanent (fail)**: 400, 401, 403, 404, 422

2. Error handling strategy:
   ```typescript
   try {
     const result = await resend.emails.send({
       from: env.RESEND_FROM_EMAIL,
       to: input.to,
       subject: input.subject,
       html: input.html,
       text: input.text,
       headers: {
         'X-Idempotency-Key': input.idempotencyKey,
       },
     });

     if (result.error) {
       throw new ResendApiError(result.error);
     }

     return { messageId: result.data.id, success: true };
   } catch (error) {
     if (isTransientError(error)) {
       throw error; // Will trigger BullMQ retry
     } else {
       logger.error({ error }, 'Permanent Resend API failure');
       throw new PermanentEmailError(error);
     }
   }
   ```

3. Create custom error classes:
   - `ResendApiError` (base)
   - `PermanentEmailError` (do not retry)
   - `TransientEmailError` (will retry)

### Step 5 — Add response validation

1. Validate Resend API response structure
2. Extract and return message ID
3. Log successful sends with message ID
4. Log failures with error details (without email content)

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| SDK installed | `npm list resend` | Resend package present in dependencies |
| Env vars configured | unit test | RESEND_API_KEY and RESEND_FROM_EMAIL validated |
| Idempotency key generation | unit test | Same inputs produce same hash, different inputs produce different hashes |
| Successful email send | integration test | Resend API returns message ID |
| Idempotency header sent | integration test | X-Idempotency-Key header present in API call |
| Transient error retry | unit test | HTTP 500 throws error for retry |
| Permanent error fail | unit test | HTTP 400 throws PermanentEmailError (no retry) |
| Message ID extraction | unit test | Valid response returns message ID |
| Timeout handling | integration test | 10s timeout triggers TransientEmailError |

---

## Dependencies

- TASK-001 (Queue infrastructure for job data interface)
- EP-008 / US-001 (Template rendering service)
- Resend API account and API key

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: Use SHA-256 for idempotency keys
- **OWASP A07 (Identification and Authentication Failures)**: API key must be stored in environment variable, never in code
- **OWASP A09 (Security Logging)**: Do not log email content, only metadata (to, subject line, message ID)
- Idempotency key must normalize email addresses (lowercase)
- Use TLS for all Resend API calls (enforced by SDK)

---

## Definition of Done

- [x] Resend SDK installed via npm
- [x] Environment variables added and validated (RESEND_API_KEY, RESEND_FROM_EMAIL)
- [x] `generateEmailIdempotencyKey` function implemented with SHA-256
- [x] `sendEmailViaResend` service function implemented
- [x] Resend client initialized with API key from environment
- [x] Idempotency key sent in `X-Idempotency-Key` header
- [x] Error handling distinguishes transient (retry) vs permanent (fail)
- [x] Custom error classes created (ResendApiError, PermanentEmailError, TransientEmailError)
- [x] Response validation extracts message ID
- [x] Unit tests cover idempotency key generation and error classification
- [x] Unit tests validate Resend service behavior with mocked API
- [x] Logging does not include email content

## Implementation Summary

**Completed**: 2026-07-29

### Components Created

1. **idempotencyKey.ts** (43 lines)
   - SHA-256 hash generation from `<event_type>:<entity_id>:<recipient_email>`
   - Email normalization (lowercase, trim)
   - Returns 64-character hexadecimal hash

2. **emailErrors.ts** (91 lines)
   - `ResendApiError` - Base error class
   - `PermanentEmailError` - Client errors (4xx), do not retry
   - `TransientEmailError` - Server errors (5xx), should retry
   - `isTransientError` - Classify HTTP status codes
   - `shouldRetryError` - Determine retry eligibility

3. **resendEmailService.ts** (204 lines)
   - Lazy Resend client initialization
   - `sendEmailViaResend` function with idempotency headers
   - Error classification: 500/502/503/504 → transient, 400/401/403/404/422 → permanent
   - Timeout handling (ETIMEDOUT, ECONNABORTED)
   - Response validation (message ID extraction)
   - Comprehensive logging (metadata only, no content)

4. **Environment Configuration** (env.ts updated)
   - Added `RESEND_API_KEY` (optional, min 10 chars)
   - Added `RESEND_FROM_EMAIL` (optional, email format)

### Test Coverage

**Idempotency Key Tests**: 18/18 passing
- Deterministic hash generation (4 tests)
- Email normalization (3 tests)
- Hash format validation (2 tests)
- Collision resistance (1 test)
- Real-world scenarios (4 tests)
- Edge cases (4 tests)

**Resend Email Service Tests**: 24/24 passing (1 skipped)
- Successful sends (3 tests)
- Transient errors (6 tests)
- Permanent errors (5 tests)
- Response validation (2 tests)
- Error handling edge cases (5 tests)
- Error message preservation (3 tests)

### Error Classification

**Transient (Retry)**:
- HTTP 500 Internal Server Error
- HTTP 502 Bad Gateway
- HTTP 503 Service Unavailable
- HTTP 504 Gateway Timeout
- ETIMEDOUT, ECONNABORTED
- Unknown errors (default to retry for safety)

**Permanent (Fail)**:
- HTTP 400 Bad Request
- HTTP 401 Unauthorized
- HTTP 403 Forbidden
- HTTP 404 Not Found
- HTTP 422 Unprocessable Entity

### Security Compliance

✓ **OWASP A02**: SHA-256 for idempotency keys
✓ **OWASP A07**: API key from environment variable only
✓ **OWASP A09**: Logs metadata only (to, subject, messageId), never email content

### Integration Notes

- Ready for BullMQ worker integration (TASK-003)
- Idempotency key generator available for queue jobs
- Error classes support BullMQ retry logic
- Resend client lazy-initialized to support optional config

---

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-008 |
| Scenario | 1, 4 |
| FR | FR-058 |
