---
id: task_001
us_id: us_001
epic: EP-006
title: "Design Provider Resolution and Launch Request Contract"
status: completed
layer: backend
effort: 4h
priority: high
created: 2026-07-27
---

# TASK-001 — Design Provider Resolution and Launch Request Contract

## Context

**User Story**: US-001 — External Assessment Launch API — POST to Provider and Return Test URL  
**Epic**: EP-006 — Assessment Integration  
**Addresses**: Scenario 4

Launch behavior depends on requisition-specific provider configuration. Before integrating external calls, the request contract and provider resolution rules must be explicit and validated.

---

## Objective

Define and implement backend contract and domain logic for:
- `POST /assessments/launch` request payload and response shape
- requisition-to-provider resolution
- provider configuration validation and error mapping

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Endpoint input | `applicationId` required; optional `providerId` override only for authorized internal users |
| Resolution rule | Default provider must come from requisition/provider mapping when override is absent |
| Config source | `assessment_providers` table with endpoint, auth mode, timeout, and active flag |
| Validation failures | Return deterministic 4xx errors with machine-readable code and safe message |
| Authorization | Recruiter/HR roles only; ownership/tenant constraints enforced |

---

## Implementation Steps

### Step 1 — Define API contract

1. Add request/response schema in backend route validation.
2. Include correlation ID in response metadata for observability.
3. Add typed error envelope for config and eligibility failures.

### Step 2 — Implement provider resolution service

1. Resolve `applicationId -> requisitionId -> providerId` mapping.
2. Validate provider is active and has required config fields.
3. Return normalized provider config object for downstream client call.

### Step 3 — Add access-control and business guardrails

1. Enforce authorized role checks.
2. Ensure application is in a state eligible for assessment launch.
3. Reject reassignment to inactive or unauthorized provider.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Missing application ID | API test | HTTP 400 with validation code |
| Inactive provider config | service/unit test | Launch blocked with deterministic error |
| Requisition mapping | integration test | Correct provider selected per requisition |
| Unauthorized override | API test | HTTP 403 and no provider call |

---

## Dependencies

- EP-005 / US-005 stage-prerequisite model available
- EP-DATA / US-001 `assessment_sessions` schema exists

## Security Constraints

- Do not expose provider secrets in logs or API responses
- Enforce least-privilege access for launch endpoint

---

## Definition of Done

- [x] Launch API contract documented in code and validated
- [x] Requisition-based provider resolution implemented
- [x] Provider config validation and safe error mapping complete
- [x] Authorization checks enforced for launch endpoint
- [x] Automated tests cover resolution success and failure paths

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-006 |
| Scenario | 4 |
| FR | FR-044 |
| TR | TR-005.4 |
