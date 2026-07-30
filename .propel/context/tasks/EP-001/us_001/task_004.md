---
id: task_004
us_id: us_001
epic: EP-001
title: "Build Registration and OTP Verification UI Flow"
status: done
layer: frontend
effort: 4h
priority: high
created: 2026-07-24
---

# TASK-004 - Build Registration and OTP Verification UI Flow

## Context

**User Story**: US-001 - Candidate Self-Registration with OTP Email Verification  
**Epic**: EP-001 - Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

The frontend must provide clear, safe user flows for registration and OTP verification. It should enforce basic form validation, support resend for expired OTP, and avoid account enumeration signals.

---

## Objective

Implement candidate-facing registration and OTP screens that integrate with backend auth APIs and satisfy UX-level acceptance criteria.

---

## Technical Specifications

| Screen | Route | Purpose |
|--------|-------|---------|
| Registration | `/register` | submit email + password |
| OTP Verify | `/verify-otp` | submit 6-digit OTP and resend |
| Onboarding Redirect | `/onboarding/profile` | target after successful verification |

UI requirements:
- Email format validation and password rule hints.
- On register success, redirect to OTP screen.
- On expired OTP, show exact message: `Code expired - please request a new one`.
- Render resend action on expired OTP response.
- Duplicate email flow always shows generic message.

---

## Implementation Steps

### Step 1 - Registration form

Build form fields:

- email
- password

Add client-side validation:

- valid email pattern
- password minimum 8 chars, includes uppercase and numeric

On submit:
- call `POST /api/auth/register`
- display generic response message
- redirect to `/verify-otp` with email prefilled (query param or local state)

### Step 2 - OTP verification form

Build fields:

- email (editable or prefilled)
- OTP input (6 digits)

On submit:
- call `POST /api/auth/verify-otp`
- on success redirect to `/onboarding/profile`
- on expired response show required message and reveal resend action

### Step 3 - Resend interaction

When resend action clicked:
- call `POST /api/auth/resend-otp`
- show neutral success toast/message
- keep user on verify screen

### Step 4 - Error and loading states

Implement:
- disabled buttons during in-flight requests
- inline errors for validation failures
- accessible status updates (`aria-live`) for async responses

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Registration validation | component test | invalid input blocks submit |
| Register success redirect | integration/component test | navigates to `/verify-otp` |
| Verify success redirect | integration/component test | navigates to `/onboarding/profile` |
| Expired OTP UX | integration/component test | required expiry message + resend visible |
| Duplicate email UX safety | manual/API mocked test | generic non-enumerating message only |

---

## Dependencies

- TASK-002 registration API available.
- TASK-003 verify/resend OTP APIs available.

## Security Constraints

- **OWASP A01 (Broken Access Control)**: UI must not leak account existence.
- **OWASP A04 (Insecure Design)**: sensitive auth errors must be normalized.
- **OWASP A11 (SSRF and input abuse defense-in-depth)**: validate and sanitize user inputs client-side as first barrier.

---

## Definition of Done

- [ ] Registration page implemented with required validation hints
- [ ] OTP verify page implemented with 6-digit input
- [ ] Expired OTP message and resend flow implemented
- [ ] Redirect flow register -> verify -> onboarding works
- [ ] Duplicate-email path remains generic from UI perspective
- [ ] Frontend tests added for key states and redirects

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-001 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-001, FR-006, FR-007 |
