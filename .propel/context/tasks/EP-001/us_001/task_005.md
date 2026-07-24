---
id: task_005
us_id: us_001
epic: EP-001
title: "Validate OTP Registration Scenarios and Complete US-001 Sign-Off"
status: done
layer: qa
effort: 3h
priority: critical
created: 2026-07-24
---

# TASK-005 - Validate OTP Registration Scenarios and Complete US-001 Sign-Off

## Context

**User Story**: US-001 - Candidate Self-Registration with OTP Email Verification  
**Epic**: EP-001 - Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: All scenarios and full DoD closure

This task is the quality gate for US-001. It validates backend and frontend behavior together, captures objective evidence, and updates story status to done only after all checks pass.

---

## Objective

Execute end-to-end validation for all four acceptance criteria, generate evidence artefacts, and complete story sign-off updates.

---

## Technical Specifications

| Scenario | Validation Type | Target Outcome |
|----------|------------------|----------------|
| 1 | API + UI + timing | pending candidate created, OTP sent, redirect to verify page |
| 2 | API + DB | account activated, unique candidate ID assigned |
| 3 | API + UI | expired OTP error + resend action available |
| 4 | API + UI security | duplicate email returns generic non-enumerating response |

Required tests:
- backend unit/integration tests for register/verify/resend paths
- frontend component/integration tests for form and messaging flows
- Playwright E2E for happy path and expired OTP path

---

## Implementation Steps

### Step 1 - Backend validation

Run backend checks:

```bash
cd backend
npm run type-check
npm test
```

Add/verify tests for:
- new candidate registration with pending status
- successful OTP verification activation
- expired OTP error behavior
- duplicate email generic response

### Step 2 - Frontend validation

Run frontend checks (if frontend project is present):

```bash
cd frontend
npm run type-check
npm test
```

Validate route transitions and messaging contract.

### Step 3 - Playwright E2E coverage

Create or update E2E spec to cover:

1. Happy path: register -> OTP verify -> onboarding redirect
2. Expired OTP path: verify failure message + resend option displayed

### Step 4 - Evidence document

Create evidence file:

- `docs/validation/ep_001_us_001_validation_evidence.md`

Include:
- executed commands and outputs
- screenshots/log snippets for E2E
- pass/fail matrix for scenarios 1-4

### Step 5 - Status updates

After evidence is complete:

1. Update `status: done` in story file.
2. Mark DoD checklist items complete.
3. Set all US-001 task files status to done.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| DoD password policy | API + UI tests | policy enforced consistently |
| OTP sent in time | integration/E2E with instrumentation | delivery initiated within 30s SLA |
| OTP expiry behavior | time-controlled test | exact expired-code message shown |
| Candidate ID assignment | DB assertion | non-null unique public candidate ID on activation |
| Duplicate email non-enumeration | API response comparison | same message/body/status pattern |
| Playwright AC coverage | E2E spec run | happy path + expired OTP pass |

---

## Dependencies

- TASK-001 through TASK-004 completed.
- Test environments and OTP email transport test double available.

## Security Constraints

- **OWASP A09 (Security Logging and Monitoring Failures)**: preserve evidence logs for auth flows.
- **OWASP A07 (Identification and Authentication Failures)**: validation must include OTP expiry and replay protections.

---

## Definition of Done

- [ ] All US-001 acceptance criteria validated with evidence
- [ ] Playwright E2E test covers happy path and expired OTP scenario
- [ ] Validation evidence document committed
- [ ] US-001 story status updated to `done`
- [ ] All US-001 task files marked `done`

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-001 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-001, FR-003, FR-006, FR-007 |
