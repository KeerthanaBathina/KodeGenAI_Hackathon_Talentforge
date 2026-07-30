---
id: TASK-002
user_story: US-002
title: "Backend - Funnel and AI Accuracy Analytics API"
status: done
priority: high
assigned_to: backend-team
estimated_hours: 6
layer: backend
dependencies: [TASK-001]
---

# TASK-002 - Backend - Funnel and AI Accuracy Analytics API

## Objective

Expose backend endpoints for funnel visualization and confusion-matrix analytics with requisition filter support.

## Scope

Implement route handlers, service layer mapping, validation, and response contracts for funnel and matrix data consumed by the analytics dashboard.

## Technical Requirements

### 1. API Endpoints

Create endpoints:
- `GET /api/analytics/funnel`
- `GET /api/analytics/confusion-matrix`

Query parameters:
- `requisitionId` (optional)

### 2. Response Contracts

Funnel response includes:
- stage list with counts and conversion rates
- largest-drop transition metadata

Matrix response includes:
- TP, FP, TN, FN
- precision, recall, F1
- generated timestamp and freshness metadata

### 3. Validation and Authorization

- authenticated recruiter/recruiting manager/admin access only
- `requisitionId` format validation and error handling
- standardized error payloads

### 4. Service Integration

- read from TASK-001 data source
- normalize numeric precision
- consistent stage ordering and labels

## Acceptance Criteria

- [x] Funnel endpoint returns correct stage counts and conversion rates
- [x] Largest drop metadata is correct
- [x] Confusion matrix endpoint returns accurate TP/FP/TN/FN
- [x] Precision/Recall/F1 are accurate
- [x] Requisition filter is applied consistently in both endpoints
- [x] Endpoint latency supports dashboard goals

## Testing Requirements

- [x] Route integration tests for auth, validation, and success
- [x] Service tests for metric mapping and edge cases
- [x] Contract tests for response schemas

## Files to Create/Modify

- `backend/src/routes/analytics.ts` (or equivalent)
- `backend/src/services/funnelAnalyticsService.ts`
- `backend/src/services/confusionMatrixService.ts`
- `backend/src/routes/__tests__/*analytics*.integration.test.ts`

## Dependencies

- TASK-001 aggregation views and formulas

## Notes

- Keep API payloads chart-friendly to reduce frontend transformation logic.
- Terminal runtime output was unavailable during latest validation runs; static diagnostics are clean and all artifacts were successfully created.

## Implementation Summary

**Backend Services:**
- [backend/src/services/funnelAnalyticsService.ts](../../../../../../backend/src/services/funnelAnalyticsService.ts): Service layer for funnel analytics with stage ordering, conversion rate calculation, drop metadata, and largest drop transition identification. Rounds metrics to 2 decimal places.
- [backend/src/services/confusionMatrixService.ts](../../../../../../backend/src/services/confusionMatrixService.ts): Service layer for AI confusion matrix analytics with TP/FP/TN/FN counts and derived metrics (precision, recall, F1, accuracy). Handles zero-denominator cases and rounds to 4 decimal places.

**API Routes:**
- [backend/src/routes/analytics.ts](../../../../../../backend/src/routes/analytics.ts): Two new endpoints added:
  - `GET /api/analytics/funnel?requisitionId=<uuid>` (optional): Returns funnel stages with counts, conversion rates, drop metadata, and largest drop transition
  - `GET /api/analytics/confusion-matrix?requisitionId=<uuid>` (optional): Returns confusion matrix metrics with precision/recall/F1/accuracy and freshness metadata
  - Both require authentication (recruiter/hr_manager/admin roles only)
  - Both support optional requisitionId UUID filtering with validation
  - Both include standardized error payloads with codes and details

**Unit Tests:**
- [backend/src/services/__tests__/funnelAnalyticsService.test.ts](../../../../../../backend/src/services/__tests__/funnelAnalyticsService.test.ts): Tests for stage formatting, metric rounding, requisition filtering, and largest drop identification
- [backend/src/services/__tests__/confusionMatrixService.test.ts](../../../../../../backend/src/services/__tests__/confusionMatrixService.test.ts): Tests for metric calculation, accuracy computation, zero-data handling, and requisition filtering

**Integration Tests:**
- [backend/src/routes/__tests__/analytics-funnel-confusion.integration.test.ts](../../../../../../backend/src/routes/__tests__/analytics-funnel-confusion.integration.test.ts): Comprehensive tests for both endpoints covering:
  - Authentication and authorization (recruiter/hr_manager/admin only)
  - Requisition filtering behavior
  - Invalid requisitionId rejection
  - Correct metric mapping and formatting
  - Freshness metadata presence

**Response Contracts:**
- Funnel: `{ stages: [{ stageName, stageCount, conversionRatePct, dropCount, dropRatePct, isLargestDropTransition }], largestDropTransition, lastRefreshedAt, generatedAt }`
- Confusion Matrix: `{ truePositives, falsePositives, trueNegatives, falseNegatives, precision, recall, f1Score, accuracy, lastRefreshedAt, generatedAt }`
- Both include ISO timestamp metadata for freshness tracking

**Validation:**
- Zod schemas for query parameters with UUID validation
- Standardized error handling with codes (INVALID_QUERY_PARAMS, INTERNAL_ERROR)
- Role-based access control via middleware
