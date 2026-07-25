---
id: task_001
us_id: us_002
epic: EP-004
title: "Build Backend Decision API Contract with Mandatory Reason Codes"
status: completed
layer: backend
effort: 4h
priority: critical
created: 2026-07-25
---

# TASK-001 — Build Backend Decision API Contract with Mandatory Reason Codes

## Context

**User Story**: US-002 — Shortlist and Reject Decisions with Mandatory Reason Codes  
**Epic**: EP-004 — HR Review and Decisioning  
**Addresses**: Scenario 1, Scenario 2

Decision APIs must enforce reason-code capture so HR actions are explainable and compliant.

---

## Objective

Extend backend decision endpoints to:
1. require a valid reason code for shortlist and reject actions
2. accept optional free-text comment (max 500 chars)
3. reject invalid payloads with structured validation errors

---

## Technical Specifications

| Area | Requirement |
|------|-------------|
| Decision payload | `decision`, `reasonCode`, optional `comment` |
| Reason code source | `reason_codes` table (active + allowed for decision type) |
| Comment constraints | optional, trimmed, max 500 chars |
| Validation errors | deterministic 400 response with field-level issues |
| Access control | HR reviewer roles only |

---

## Implementation Steps

### Step 1 — Update route schema and request contract

1. Expand decision request schema with `reasonCode` and optional `comment`.
2. Enforce non-empty reason code for both shortlist and reject.
3. Enforce max-length validation for comment.

### Step 2 — Validate reason code against reference data

1. Lookup reason code in `reason_codes`.
2. Ensure code is active and permitted for selected decision.
3. Return 400 if code is unknown or not allowed.

### Step 3 — Update service interface

1. Extend decision service method signature to include reason metadata.
2. Preserve existing authorization and idempotency/lock checks.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Reject without reason code | API test | 400 and field error message |
| Comment length > 500 | API test | 400 validation failure |
| Invalid reason code | API test | 400 reason code not allowed |
| Valid shortlist payload | API test | accepted and forwarded to decision service |

---

## Dependencies

- EP-DATA / US-002 (`reason_codes` seeded)
- Existing manual review decision route

## Security Constraints

- Restrict decision endpoints to authenticated HR roles only
- Do not leak internal validation metadata beyond required field errors

---

## Definition of Done

- [x] Decision API requires reason code for shortlist and reject
- [x] Optional comment is accepted up to 500 chars
- [x] Invalid reason codes are rejected server-side
- [x] Route-level tests cover required payload and error paths

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-002 |
| Epic | EP-004 |
| Scenario | 1, 2 |
| FR | FR-030, FR-031 |