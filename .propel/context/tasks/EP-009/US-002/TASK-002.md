---
id: TASK-002
user_story: US-002
title: "Backend - Policy Management REST API Endpoints"
status: todo
priority: high
assigned_to: backend-team
estimated_hours: 8
layer: backend
dependencies: [TASK-001]
---

# TASK-002 — Backend - Policy Management REST API Endpoints

## Objective

Implement REST API endpoints for managing policy versions, viewing history, and querying effective policies with proper authorization.

## Scope

Create comprehensive API routes for screening thresholds, scoring thresholds, and approval policies with version management.

## Technical Requirements

### 1. Screening Threshold Routes

Create `/backend/src/routes/admin/screeningThresholds.ts`:

#### GET `/api/admin/screening-thresholds/active` - Get Active Threshold

**Response:**

```typescript
{
  id: string;
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
  version: number;
  effectiveFrom: string;
  createdAt: string;
}
```

**Status Codes:** 200, 404, 403

#### GET `/api/admin/screening-thresholds/history` - Get Version History

**Query Parameters:**

- `limit?: number` - Max results (default: 50, max: 200)
- `asOfDate?: string` - ISO date to get threshold effective at that time

**Response:**

```typescript
{
  thresholds: Array<{
    id: string;
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    version: number;
    effectiveFrom: string;
    createdAt: string;
  }>;
  total: number;
}
```

**Status Codes:** 200, 403

#### POST `/api/admin/screening-thresholds` - Create New Version

**Request Body:**

```typescript
{
  shortlistThreshold: number; // 0-100
  borderlineMin: number; // 0-100
  borderlineMax: number; // 0-100
  rejectThreshold: number; // 0-100
  effectiveFrom: string; // ISO date
}
```

**Response:** New threshold object
**Validations:**

- All values 0-100
- Logical order: reject < borderlineMin < borderlineMax < shortlist
- effectiveFrom cannot be in the past (allow same day)
  **Status Codes:** 201, 400, 403

#### GET `/api/admin/screening-thresholds/:id` - Get Specific Version

**Response:** Single threshold object
**Status Codes:** 200, 404, 403

### 2. Scoring Threshold Routes

Create `/backend/src/routes/admin/scoringThresholds.ts`:

#### GET `/api/admin/scoring-thresholds` - List All Scoring Thresholds

**Query Parameters:**

- `jobFamilyId?: string` - Filter by job family
- `activeOnly?: boolean` - Only show currently effective versions
  **Response:** Array of scoring thresholds with job family details
  **Status Codes:** 200, 403

#### GET `/api/admin/scoring-thresholds/:jobFamilyId/history` - Get History for Job Family

**Query Parameters:**

- `limit?: number`
  **Response:**

```typescript
{
  jobFamily: {
    id: string;
    name: string;
  }
  versions: Array<{
    id: string;
    aiShortlistThreshold: number;
    confidenceThreshold: number;
    experienceThresholdYears: number;
    effectiveFrom: string;
    createdAt: string;
    createdBy: {
      id: string;
      fullName: string;
      email: string;
    };
  }>;
}
```

**Status Codes:** 200, 404, 403

#### POST `/api/admin/scoring-thresholds` - Create New Version

**Request Body:**

```typescript
{
  jobFamilyId: string;
  aiShortlistThreshold: number; // 0.0-1.0
  confidenceThreshold: number; // 0.0-1.0
  experienceThresholdYears: number; // 0-50
  effectiveFrom: string; // ISO date
}
```

**Validations:**

- aiShortlistThreshold: 0.0-1.0 (up to 4 decimal places)
- confidenceThreshold: 0.0-1.0 (up to 4 decimal places)
- experienceThresholdYears: 0-50 integer
- jobFamilyId must exist
- effectiveFrom cannot be in the past
  **Status Codes:** 201, 400, 404, 403

#### GET `/api/admin/scoring-thresholds/:jobFamilyId/effective` - Get Effective Threshold

**Query Parameters:**

- `asOfDate?: string` - ISO date (defaults to now)
  **Response:** Currently effective scoring threshold for job family
  **Status Codes:** 200, 404, 403

### 3. Approval Policy Routes

Create `/backend/src/routes/admin/approvalPolicies.ts`:

#### GET `/api/admin/approval-policies` - List All Policies

**Query Parameters:**

- `active?: boolean` - Filter by active status
- `compensationAmount?: number` - Find policy covering this amount
  **Response:** Array of approval policies
  **Status Codes:** 200, 403

#### GET `/api/admin/approval-policies/history` - Get Policy History

**Query Parameters:**

- `compensationBandMin?: number`
- `compensationBandMax?: number`
- `limit?: number`
  **Response:**

```typescript
{
  policies: Array<{
    id: string;
    compensationBandMin: string;
    compensationBandMax: string;
    requiredApprovers: Array<{
      tier: number;
      role: string;
      approverId: string;
      displayName: string;
    }>;
    active: boolean;
    effectiveFrom: string;
    createdAt: string;
    createdBy: {
      id: string;
      fullName: string;
      email: string;
    };
  }>;
}
```

**Status Codes:** 200, 403

#### POST `/api/admin/approval-policies` - Create New Policy

**Request Body:**

```typescript
{
  compensationBandMin: number;
  compensationBandMax: number;
  requiredApprovers: Array<{
    tier: number;
    role: string;
    approverId: string;
    displayName: string;
  }>;
  effectiveFrom: string; // ISO date
}
```

**Validations:**

- compensationBandMin < compensationBandMax
- All approvers exist and are active users
- Tier numbers start at 1 and are sequential
- No duplicate tiers
- effectiveFrom cannot be in the past
  **Status Codes:** 201, 400, 404, 403

#### PATCH `/api/admin/approval-policies/:id/deactivate` - Deactivate Policy

**Response:** Updated policy with active=false
**Status Codes:** 200, 404, 403

### 4. Middleware and Authorization

All routes require:

- `authenticate` middleware
- `requireAdmin` middleware (role = 'admin')

### 5. Error Handling

**Validation Errors (400):**

```typescript
{
  error: "VALIDATION_ERROR",
  message: "Invalid policy values",
  details: [
    "Shortlist threshold must be between 0 and 100",
    "Borderline min must be less than borderline max"
  ]
}
```

**Not Found (404):**

```typescript
{
  error: "NOT_FOUND",
  message: "Policy not found",
  resourceType: "ScoringThreshold",
  resourceId: "uuid"
}
```

**Unauthorized (403):**

```typescript
{
  error: "FORBIDDEN",
  message: "Admin access required"
}
```

### 6. Response Headers

All policy endpoints should include:

```
Cache-Control: no-cache, no-store, must-revalidate
X-Policy-Version: <version-number>
```

## Acceptance Criteria

- [ ] GET active threshold returns currently effective threshold
- [ ] GET history returns ordered list of past versions
- [ ] POST creates new version with validation
- [ ] Validation errors return 400 with detailed error messages
- [ ] Invalid range values rejected with appropriate messages
- [ ] effectiveFrom validation prevents past dates
- [ ] All endpoints require admin authentication
- [ ] Scoring threshold endpoints work per job family
- [ ] Approval policy endpoints handle compensation bands correctly
- [ ] API returns consistent error format
- [ ] All endpoints log to audit trail

## Testing Requirements

- Integration tests for all endpoints
- Test validation error cases
- Test authorization (admin-only)
- Test date filtering and effective-date queries
- Test pagination and limits
- Test error handling and status codes
- Test audit logging for all mutations

## Files to Create

- `/backend/src/routes/admin/screeningThresholds.ts`
- `/backend/src/routes/admin/scoringThresholds.ts`
- `/backend/src/routes/admin/approvalPolicies.ts`
- `/backend/src/__tests__/routes/admin-screening-thresholds.integration.test.ts`
- `/backend/src/__tests__/routes/admin-scoring-thresholds.integration.test.ts`
- `/backend/src/__tests__/routes/admin-approval-policies.integration.test.ts`

## Files to Modify

- `/backend/src/app.ts` - Register new routes

## API Documentation

Update OpenAPI/Swagger documentation to include:

- All new policy management endpoints
- Request/response schemas
- Validation rules
- Error codes and messages

## Related User Story

**US-002 Acceptance Criteria:**

- ✅ Scenario 1: New policy version with future effective date
- ✅ Scenario 2: Policy editor shows change history
- ✅ Scenario 3: Invalid policy value rejected
- ✅ Scenario 4: Approval policy change applies to new offer decisions only

## Dependencies

- TASK-001 (Service layer must be complete)
- Existing authentication middleware
- Existing admin authorization

## Performance Considerations

- Add caching headers for GET requests
- Limit history query results to prevent large responses
- Use pagination for large result sets
- Index effectiveFrom columns for fast queries

## Security Considerations

- Admin-only access for all policy management
- Validate all inputs server-side
- Prevent injection attacks in query parameters
- Audit log all policy changes with actor information
- Rate limit policy creation endpoints

## Notes

- Policy changes should be rare in production
- Consider adding "draft" mode for policies before activation
- Future enhancement: Policy preview/diff before activation
- Consider webhook notifications for policy changes
