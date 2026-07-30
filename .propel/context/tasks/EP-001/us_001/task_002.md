---
id: task_002
us_id: us_001
epic: EP-001
title: "Implement Registration API with Password Policy and Non-Enumerating Responses"
status: done
layer: backend
effort: 4h
priority: critical
created: 2026-07-24
---

# TASK-002 - Implement Registration API with Password Policy and Non-Enumerating Responses

## Context

**User Story**: US-001 - Candidate Self-Registration with OTP Email Verification  
**Epic**: EP-001 - Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1, Scenario 4

Registration must be secure, deterministic, and non-enumerating. The endpoint must enforce input validation rules and always return a generic success-style message when duplicate email is submitted.

---

## Objective

Build backend registration endpoint(s) that:

- validates email and password policy (`>=8`, one uppercase, one number),
- creates pending candidate account for new emails,
- triggers OTP challenge issuance,
- returns generic response for both new and duplicate emails.

---

## Technical Specifications

| Attribute | Requirement |
|-----------|-------------|
| Endpoint | `POST /api/auth/register` |
| Request | `{ email: string, password: string }` |
| Success response | generic non-enumerating message |
| Duplicate email behavior | same response body and similar timing profile |
| Candidate status after new registration | `pending_verification` |

Example response contract:

```json
{
  "message": "If this email is new to us, you will receive a verification code"
}
```

---

## Implementation Steps

### Step 1 - Add request validation schema

Create validation for:

- RFC-compliant email format
- password length >= 8
- at least one uppercase character
- at least one numeric character

### Step 2 - Implement registration service function

Service responsibilities:

1. Normalize email (`trim`, lowercase).
2. Lookup existing candidate by email.
3. If missing: create candidate and secure password hash.
4. If duplicate: do not reveal existence in response.
5. For newly created pending account: issue OTP challenge + email dispatch.

### Step 3 - Create controller and route wiring

- add auth router module
- register route in application server
- map validation errors to 400
- map internal errors to standard 5xx error envelope

### Step 4 - Logging and observability

Emit structured logs:

- registration request accepted
- duplicate registration attempted
- OTP dispatch initiated
- OTP dispatch failed (without exposing secrets)

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Password policy enforced | invalid password test inputs | HTTP 400 with validation details |
| Valid registration | POST with new email | generic success message + pending candidate created |
| Duplicate registration | POST same email twice | same generic response, no enumeration leakage |
| API route availability | integration test | route mounted and reachable |

---

## Dependencies

- TASK-001 schema and migration completed.
- Existing DB client and error middleware available.

## Security Constraints

- **OWASP A07 (Identification and Authentication Failures)**: enforce minimum password complexity.
- **OWASP A09 (Security Logging and Monitoring Failures)**: log security-relevant auth events.
- **OWASP A01 (Broken Access Control)**: avoid data leakage in duplicate email path.

---

## Definition of Done

- [ ] `POST /api/auth/register` implemented and wired
- [ ] Input validation enforces email and password policy
- [ ] New candidate created with `pending_verification`
- [ ] Duplicate email path returns non-enumerating generic response
- [ ] Unit/integration tests cover happy path and duplicate email path

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-001 |
| Scenario | 1, 4 |
| FR | FR-001 |
