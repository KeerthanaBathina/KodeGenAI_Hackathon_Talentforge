---
id: task_002
us_id: us_001
epic: EP-006
title: "Implement Provider Launch Client and Persist Assessment Session"
status: completed
layer: backend
effort: 6h
priority: critical
created: 2026-07-27
---

# TASK-002 — Implement Provider Launch Client and Persist Assessment Session

## Context

**User Story**: US-001 — External Assessment Launch API — POST to Provider and Return Test URL  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 1, Scenario 3

Core story value is achieved only when a provider session is created and returned test metadata is persisted and linked to the correct application.

---

## Objective

Implement the launch execution path that:
1. calls provider launch endpoint with normalized payload
2. parses provider response (`testUrl`, `sessionToken`, status metadata)
3. writes `assessment_sessions` record with required linkage fields

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| External call | HTTP POST to provider endpoint with timeout and correlation headers |
| Required provider response | `testUrl` and `sessionToken` must be present and non-empty |
| Persistence fields | `session_token`, `application_id`, `provider_id`, `launched_at`, `status` |
| Initial status | `in_progress` on successful provider launch |
| Idempotency behavior | Prevent duplicate active launch for same application unless explicitly allowed by policy |

---

## Implementation Steps

### Step 1 — Build provider launch adapter

1. Implement provider request serializer from internal launch model.
2. Add response parser with strict required-field validation.
3. Map provider-specific errors to canonical internal error types.

### Step 2 — Persist assessment session transactionally

1. Insert `assessment_sessions` row with all required fields.
2. Ensure `launched_at` is server timestamp in UTC.
3. Link record to application and provider IDs used in the call.

### Step 3 — Return API response for recruiter flow

1. Return launch success payload including `testUrl`.
2. Include internal session identifier for auditability.
3. Keep response free of provider secrets and tokens not required by UI.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Provider 200 with valid body | integration test | Session row created and response returns test URL |
| Missing `sessionToken` | integration test | Launch fails with validation error; no row committed |
| Required persistence fields | repository test | All required columns populated and linked correctly |
| Duplicate active launch | integration/service test | Deterministic behavior per policy, no silent duplication |

---

## Dependencies

- TASK-001 provider resolution and contract
- `assessment_sessions` table and indexes available

## Security Constraints

- Sanitize provider response logging
- Validate outbound URL against configured allowlist/domain policy

---

## Definition of Done

- [x] Provider launch adapter implemented with strict response validation
- [x] Successful launches persisted to `assessment_sessions`
- [x] API returns recruiter-shareable `testUrl`
- [x] Duplicate/invalid launch protections implemented
- [x] Integration tests cover success and malformed-response failures

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-006 |
| Scenario | 1, 3 |
| FR | FR-044 |
| TR | TR-005.4 |
