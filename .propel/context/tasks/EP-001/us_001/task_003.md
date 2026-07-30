---
id: task_003
us_id: us_001
epic: EP-001
title: "Implement OTP Verification and Resend APIs with 15-Minute Expiry"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
---

# TASK-003 - Implement OTP Verification and Resend APIs with 15-Minute Expiry

## Context

**User Story**: US-001 - Candidate Self-Registration with OTP Email Verification  
**Epic**: EP-001 - Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 2, Scenario 3

Candidates must be able to verify OTP within a strict expiry window and request a new OTP when expired. Successful verification transitions account to active and assigns unique candidate identifier.

---

## Objective

Implement OTP verification and resend backend flows:

- `POST /api/auth/verify-otp`
- `POST /api/auth/resend-otp`

with one-time, 15-minute OTP validity and proper account activation behavior.

---

## Technical Specifications

| Attribute | Requirement |
|-----------|-------------|
| OTP length | 6 digits |
| OTP validity | 15 minutes from issuance |
| Verify endpoint | `POST /api/auth/verify-otp` |
| Resend endpoint | `POST /api/auth/resend-otp` |
| Expired OTP UX message contract | `Code expired - please request a new one` |

`verify-otp` request contract:

```json
{
  "email": "candidate@example.com",
  "otp": "123456"
}
```

Success behavior:
- candidate status becomes `active`
- candidate public ID assigned if not already present
- OTP challenge marked consumed

Failure behavior:
- expired OTP -> domain error mapped to user-safe response with resend affordance
- invalid OTP -> generic invalid code response

---

## Implementation Steps

### Step 1 - OTP generation and hashing helpers

Implement utility functions:

- generate 6-digit OTP
- hash OTP with server-side salt
- compare OTP hash in constant-time safe manner

### Step 2 - Verify OTP service logic

1. Resolve candidate by normalized email.
2. Retrieve latest unconsumed OTP challenge.
3. Reject if expired (`now > expires_at`) with explicit expired-code domain error.
4. Verify hash match; reject on mismatch.
5. Mark challenge consumed.
6. Activate candidate and set unique public ID.

### Step 3 - Resend OTP service logic

1. Resolve candidate by email.
2. Create new OTP challenge with fresh expiry.
3. Dispatch OTP email.
4. Return generic response.

### Step 4 - Route/controller wiring and error mapping

- map expired OTP to response text required by acceptance criteria
- include resend instructions in payload so UI can render link/button

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Correct OTP in window | integration test | account becomes `active`, public ID assigned |
| Expired OTP | integration test with simulated clock/expiry | response contains `Code expired - please request a new one` |
| Resend flow | integration test | new OTP challenge row issued with new expiry |
| One-time OTP use | verify same OTP twice | second attempt fails |

---

## Dependencies

- TASK-001 schema includes OTP challenge table.
- TASK-002 registration flow issuing initial OTP.

## Security Constraints

- **OWASP A07 (Identification and Authentication Failures)**: OTP must be short-lived and one-time.
- **OWASP A02 (Cryptographic Failures)**: OTP comparison should avoid plaintext storage.
- **OWASP A04 (Insecure Design)**: activation only after successful OTP validation.

---

## Definition of Done

- [ ] `verify-otp` endpoint implemented
- [ ] `resend-otp` endpoint implemented
- [ ] OTP expires strictly after 15 minutes
- [ ] Expired OTP response message matches AC text
- [ ] Successful verification activates account and sets candidate public ID
- [ ] Tests cover valid, invalid, expired, and replayed OTP paths

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-001 |
| Scenario | 2, 3 |
| FR | FR-006, FR-003 |
