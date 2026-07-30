---
id: TASK-003
user_story: US-001
title: "Backend Integration - Instrument Auth, Decisions, Communications, Config, and Uploads"
status: done
priority: critical
assigned_to: backend-team
estimated_hours: 8
layer: backend
dependencies: [TASK-001, TASK-002]
---

# TASK-003 - Backend Integration - Instrument Auth, Decisions, Communications, Config, and Uploads

## Objective

Integrate standardized audit logging into all required platform flows: authentication, hiring decisions, communication actions, configuration changes, and file uploads.

## Scope

Instrument and normalize audit emission for:
- authentication routes/services
- decision submission and outcome processing
- communication queue/send lifecycle
- admin configuration updates
- resume and requisition CSV upload flows

## Technical Requirements

### 1. Authentication Event Coverage

Audit events must cover:
- successful login (`auth.login`)
- failed login (`auth.login_failed`)
- logout/session invalidation (`auth.logout` where applicable)
- password reset request/complete events

### 2. Hiring Decision Coverage

Audit events must include:
- `decision.shortlist`, `decision.reject`, `decision.hold`, `decision.withdraw`
- `entity_type = application`
- `entity_id = applicationId`
- `reason_code_id` and decision context in payload

### 3. Communication Coverage

Capture communication lifecycle events:
- queued/sent/failed/retry paths
- reference communication ID/template type/recipient count where applicable

### 4. Configuration Change Coverage

Capture admin config changes including threshold/policy updates:
- event type in `config.*`
- old value and new value in payload
- actor identity and request metadata

### 5. Upload Coverage

Capture upload and bulk import events:
- resume upload initiation/completion/failure
- requisition CSV import started/completed/failed

## Acceptance Criteria

- [x] Required event categories are instrumented across all listed flows
- [x] Decision events include reason code and application context
- [x] Config updates include old/new value metadata
- [x] Upload and communication actions emit canonical audit events
- [x] All events include actor/IP/user-agent where applicable

## Testing Requirements

- [x] Route/service integration tests verify event emission per flow
- [x] Negative-path tests verify failed operations still log relevant audit context

## Files to Create/Modify

- `backend/src/routes/auth.ts`
- `backend/src/routes/decisions.ts`
- `backend/src/routes/requisitions.ts`
- `backend/src/routes/resumes.ts`
- `backend/src/routes/admin/screeningThresholds.ts`
- `backend/src/routes/admin/scoringThresholds.ts`
- `backend/src/routes/admin/thresholds.ts`
- `backend/src/services/communicationService.ts`
- `backend/src/services/emailService.ts`
- `backend/src/services/decisionOutcomeProcessor.ts`

## Dependencies

- TASK-001 taxonomy and contract
- TASK-002 async queue infrastructure

## Notes

- Prefer centralized helper APIs so individual routes remain thin and consistent.
