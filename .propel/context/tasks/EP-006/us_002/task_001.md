---
id: task_001
us_id: us_002
epic: EP-006
title: "Implement HMAC-SHA256 Signature Validation Service"
status: completed
layer: backend
effort: 3h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-001 — Implement HMAC-SHA256 Signature Validation Service

## Context

**User Story**: US-002 — HMAC Webhook Ingestion with Idempotent Score Processing  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 1, Scenario 2

Webhook payloads from external assessment providers must be cryptographically verified to prevent forged score submissions. HMAC-SHA256 provides message authentication using provider-specific secrets stored securely in the database.

---

## Objective

Implement a reusable HMAC signature validation service that:
- Computes HMAC-SHA256 digest from raw webhook payload
- Compares computed signature against `X-Signature-HMAC-SHA256` header
- Uses provider-specific secret from `assessment_providers` table
- Implements constant-time comparison to prevent timing attacks

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Algorithm | HMAC-SHA256 (RFC 2104) |
| Header name | `X-Signature-HMAC-SHA256` (case-insensitive) |
| Signature format | Hex-encoded string (64 characters) |
| Secret source | `assessment_providers.hmacSecret` field |
| Comparison | Constant-time equality check using `crypto.timingSafeEqual()` |
| Error response | HTTP 401 Unauthorized with `INVALID_SIGNATURE` error code |
| Audit logging | Security event written to `audit_events` on validation failure |

---

## Implementation Steps

### Step 1 — Create HMAC validation utility

1. Create `backend/src/utils/hmac.ts` with `validateHmacSignature()` function
2. Accept raw request body (Buffer), signature header (string), and secret (string)
3. Compute HMAC-SHA256 digest using Node.js `crypto.createHmac()`
4. Convert computed hash to hex string for comparison
5. Use `crypto.timingSafeEqual()` for constant-time comparison

### Step 2 — Add signature validation middleware

1. Create `backend/src/middleware/validateWebhookSignature.ts`
2. Extract `X-Signature-HMAC-SHA256` header from request
3. Retrieve provider secret from database based on webhook context
4. Call HMAC validation utility with raw body buffer
5. Return HTTP 401 on validation failure with structured error
6. Attach validated payload to request object for downstream processing

### Step 3 — Implement raw body preservation

1. Add `express.raw()` middleware for webhook routes to preserve raw body buffer
2. Ensure body is available as Buffer for HMAC computation
3. Parse JSON after successful signature validation

### Step 4 — Add typed error classes

1. Create `SignatureValidationError` class with error codes:
   - `MISSING_SIGNATURE` - No signature header present
   - `INVALID_SIGNATURE` - Signature mismatch
   - `INVALID_FORMAT` - Signature not hex-encoded 64-char string
2. Include provider ID and correlation ID in error context

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Valid signature accepted | Unit test with known secret/payload | Validation passes, returns true |
| Invalid signature rejected | Unit test with mismatched signature | Validation fails, returns false |
| Missing signature header | Integration test | HTTP 401 with `MISSING_SIGNATURE` |
| Tampered payload | Integration test | HTTP 401 with `INVALID_SIGNATURE` |
| Timing attack resistance | Security test | Constant-time comparison confirmed |
| Audit event creation | Integration test | Security event logged on failure |

---

## Dependencies

- `assessment_providers` table with `hmacSecret` field (from US-001)
- Raw body buffer available in Express middleware chain

## Security Constraints

- **CRITICAL**: Never log provider HMAC secrets
- **CRITICAL**: Use constant-time comparison to prevent timing attacks
- **CRITICAL**: Validate signature before parsing untrusted JSON payload
- Store secrets encrypted at rest in database
- Rotate secrets periodically via admin interface

---

## Definition of Done

- [x] HMAC-SHA256 validation utility implemented with constant-time comparison
- [x] Signature validation middleware created and tested
- [x] Raw body preservation configured for webhook routes
- [x] Typed error classes with specific error codes
- [x] Unit tests cover valid, invalid, and missing signature scenarios
- [x] Integration tests verify HTTP 401 response on validation failure
- [x] Security audit event logged on signature mismatch
- [x] No secrets logged in error messages or logs

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-006 |
| Scenario | 1, 2 |
| FR | FR-040 |
| TR | TR-005.5 |
