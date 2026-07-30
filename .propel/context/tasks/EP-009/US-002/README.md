# US-002 Implementation Tasks

## Overview

This directory contains implementation tasks for User Story US-002: Policy and Threshold Editor with Versioning and Effective Date Isolation.

## Task Breakdown

### TASK-001: Backend - Policy Versioning Service Layer

**Status:** Todo  
**Estimated Hours:** 10  
**Layer:** Backend  
**Dependencies:** None

Implement comprehensive versioning service for AI screening thresholds, scoring thresholds, and approval policies with effective-date isolation and validation.

### TASK-002: Backend - Policy Management REST API Endpoints

**Status:** Todo  
**Estimated Hours:** 8  
**Layer:** Backend  
**Dependencies:** TASK-001

Create REST API endpoints for managing policy versions, viewing history, and querying effective policies with admin authorization.

### TASK-003: Frontend - Policy Editor UI with Validation

**Status:** Todo  
**Estimated Hours:** 14  
**Layer:** Frontend  
**Dependencies:** TASK-001, TASK-002

Build intuitive admin interface for managing policies with real-time validation, visual feedback, and effective date configuration.

### TASK-004: Frontend - Policy Change History Viewer

**Status:** Todo  
**Estimated Hours:** 6  
**Layer:** Frontend  
**Dependencies:** TASK-002, TASK-003

Build interactive history viewer showing all policy versions with change tracking, comparison, and timeline visualization.

### TASK-005: Database Migration - Policy Version Tracking Schema Updates

**Status:** Todo  
**Estimated Hours:** 4  
**Layer:** Database  
**Dependencies:** TASK-001

Create database migration to add policy version tracking columns to applications for in-flight isolation.

### TASK-006: Testing - Comprehensive Policy Versioning Tests

**Status:** Todo  
**Estimated Hours:** 12  
**Layer:** Testing  
**Dependencies:** TASK-001, TASK-002, TASK-003, TASK-004, TASK-005

Comprehensive test coverage including unit tests, integration tests, E2E tests, and performance tests with focus on in-flight isolation.

## Total Effort Estimate

**Total Hours:** 54 hours  
**Sprint Capacity:** Approximately 2-3 sprints for full implementation

## Implementation Order

1. TASK-005 (Database Migration) - Foundation for versioning
2. TASK-001 (Service Layer) - Core business logic
3. TASK-002 (API Endpoints) - Backend interface
4. TASK-003 (Policy Editor UI) - Admin interface
5. TASK-004 (History Viewer) - Audit and transparency
6. TASK-006 (Testing) - Continuous throughout, finalize after all tasks

## Acceptance Criteria Mapping

| Acceptance Criteria                                                                     | Primary Task       | Supporting Tasks |
| --------------------------------------------------------------------------------------- | ------------------ | ---------------- |
| AC1: New policy version with future effective date does not affect current applications | TASK-001, TASK-005 | TASK-002         |
| AC2: Policy editor shows change history                                                 | TASK-004           | TASK-002         |
| AC3: Invalid policy value rejected                                                      | TASK-001, TASK-003 | TASK-002         |
| AC4: Approval policy change applies to new offer decisions only                         | TASK-001, TASK-005 | -                |

## Technical Stack

- **Backend:** Node.js, Express, TypeScript, Prisma
- **Frontend:** Next.js 14, React, TypeScript, Tailwind CSS
- **Database:** PostgreSQL (via Prisma)
- **Validation:** Zod, client-side validation
- **Testing:** Vitest, Playwright, @testing-library/react

## Key Files to Create/Modify

### Backend

- `src/services/thresholdService.ts` (update)
- `src/services/scoringThresholdService.ts` (new)
- `src/services/approvalPolicyService.ts` (update)
- `src/services/screeningService.ts` (update for in-flight)
- `src/routes/admin/screeningThresholds.ts` (new)
- `src/routes/admin/scoringThresholds.ts` (new)
- `src/routes/admin/approvalPolicies.ts` (new)
- `src/services/errors/PolicyErrors.ts` (new)

### Frontend

- `src/app/admin/policies/page.tsx` (new)
- `src/components/admin/ScreeningThresholdEditor.tsx` (new)
- `src/components/admin/ScoringThresholdEditor.tsx` (new)
- `src/components/admin/ApprovalPolicyEditor.tsx` (new)
- `src/components/admin/PolicyHistoryViewer.tsx` (new)
- `src/components/admin/ThresholdRangeVisualizer.tsx` (new)
- `src/services/policyService.ts` (new)
- `src/utils/policyValidation.ts` (new)
- `src/types/policy.ts` (new)

### Database

- Migration: `add_policy_version_tracking`
- Schema updates for Application model
- Indexes for performance

### Tests

- Multiple test files across backend and frontend
- E2E test suite for policy management
- Performance tests for query optimization
- In-flight isolation tests (critical)

## Definition of Done

- [ ] All tasks completed (TASK-001 through TASK-006)
- [ ] All acceptance criteria verified
- [ ] Code reviewed and approved
- [ ] Tests passing with minimum 85% coverage
- [ ] Database migration tested on staging
- [ ] In-flight isolation verified with real scenarios
- [ ] Documentation updated
- [ ] Deployed to staging environment
- [ ] User acceptance testing completed
- [ ] No blocking bugs
- [ ] Accessibility standards met (WCAG 2.1 AA)
- [ ] Security review completed
- [ ] Performance benchmarks met (<100ms for policy queries)

## Critical Success Factors

### 1. In-Flight Isolation

**Critical:** Applications submitted before a policy change MUST NOT be affected by the new policy. This is a **compliance requirement**.

**Verification:**

- Test with real-world scenarios
- Verify policy version ID stored with each application
- Query uses submission date, not current date

### 2. Validation

**Critical:** All policy values must be validated server-side and client-side to prevent invalid configurations.

**Validation Rules:**

- Screening: 0 ≤ reject < borderlineMin < borderlineMax < shortlist ≤ 100
- Scoring: 0 ≤ aiThreshold, confidence ≤ 1 (4 decimals)
- Approval: min < max compensation, all approvers exist

### 3. Audit Trail

**Critical:** Every policy change must be logged with:

- Who made the change
- When it was made
- What changed (before/after values)
- When it becomes effective

### 4. Effective Date Logic

**Critical:** Effective date query must use correct pattern:

```sql
WHERE effective_from <= target_date
ORDER BY effective_from DESC
LIMIT 1
```

## Risks and Mitigation

| Risk                           | Impact                      | Mitigation                                |
| ------------------------------ | --------------------------- | ----------------------------------------- |
| Retroactive policy application | High - Compliance violation | In-flight isolation with version tracking |
| Invalid policy values          | High - System malfunction   | Multi-layer validation (client + server)  |
| Performance degradation        | Medium - Slow queries       | Proper indexing + caching                 |
| Migration failure              | High - Data loss            | Thorough testing + rollback plan          |
| Audit trail gaps               | Medium - Compliance issues  | Comprehensive audit logging               |

## Performance Targets

- Policy query: <50ms
- History query: <100ms
- Policy creation: <200ms
- Cache hit rate: >95% for active thresholds

## Security Considerations

- Admin-only access for all policy management
- Audit all policy changes
- Validate all inputs server-side
- Rate limit policy creation endpoints
- No policy deletions (soft delete only via active flag)

## Future Enhancements

- Policy preview/dry-run before activation
- Policy rollback functionality
- Webhook notifications for policy changes
- Policy templates for common configurations
- Bulk policy updates
- Policy approval workflow (require approval before activation)
- Policy impact analysis (how many applications will be affected)

## Related Documentation

- US-002 User Story: [us_002.md](../us_002.md)
- Database Schema: `backend/prisma/schema.prisma`
- API Documentation: Update OpenAPI/Swagger specs
- Admin User Guide: Create policy management guide

## Notes

- Policy versioning is critical for fairness and compliance
- In-flight isolation prevents retroactive changes
- All policy changes must be auditable
- Performance optimization is essential for scale
- Validation prevents system misconfiguration
- History viewer provides transparency and accountability
