---
id: TASK-002
user_story: US-001
title: "Backend - Pipeline Analytics API with Requisition Filter"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 6
layer: backend
dependencies: [TASK-001]
---

# TASK-002 - Backend - Pipeline Analytics API with Requisition Filter

## Objective

Expose a secure API endpoint that serves pipeline KPIs from the analytics data layer with optional per-requisition filtering.

## Scope

Implement route, service, validation, and response contract for dashboard KPI retrieval, including freshness metadata and latency-safe execution.

## Technical Requirements

### 1. API Endpoint

Create endpoint:
- `GET /api/analytics/pipeline`

Query parameters:
- `requisitionId` (optional)

Response payload:
- `totalApplications`
- `shortlistRatePct`
- `avgTimeToHireDays`
- `offerAcceptanceRatePct`
- `lastRefreshedAt`
- `generatedAt`

### 2. Validation and Access Control

- Require authenticated recruiting manager/recruiter/admin access
- Validate `requisitionId` format
- Return 400 for invalid params and 403 for unauthorized roles

### 3. Service Layer

- Read KPI data from TASK-001 aggregation source
- Apply requisition filter server-side
- Enforce consistent rounding/precision rules for percentages and days

### 4. Error Handling and Observability

- Structured error responses
- Latency and cache/refresh metadata in logs
- No sensitive payload logging

## Acceptance Criteria

- [ ] API returns all four KPI metrics with expected schema
- [ ] Filtered and unfiltered responses are accurate
- [ ] Invalid filter values return 400 with useful error messages
- [ ] Unauthorized access is blocked
- [ ] Endpoint supports dashboard <2s load target

## Testing Requirements

- [ ] Route integration tests for auth and validation
- [ ] Service tests for metric mapping and filter behavior
- [ ] Contract test for payload shape and metadata fields

## Files to Create/Modify

- `backend/src/routes/analytics.ts` (or existing analytics route)
- `backend/src/services/pipelineAnalyticsService.ts`
- `backend/src/routes/__tests__/*pipeline*.integration.test.ts`
- `backend/src/services/__tests__/*pipelineAnalytics*.test.ts`

## Dependencies

- TASK-001 for KPI aggregation source and refresh metadata

## Notes

- Keep formulas in data/service layer; frontend should render only.
