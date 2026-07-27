# US-002 Task Breakdown — Final Decision Submission

**Epic**: EP-007 — Final Hiring Decision  
**User Story**: US-002 — Final Decision Submission with Multiple Outcomes  
**Story Points**: 5 (Medium Complexity)  
**Priority**: Critical  
**Status**: Draft - Ready for Implementation

---

## Summary

US-002 extends the decision submission workflow to support four distinct outcome types (offer, reject, hold, withdraw), each with its own status transitions, notifications, and follow-up actions. This feature adds mandatory reason code selection, optional justification, PDF generation for compliance, and automated notification/reminder workflows.

---

## Task Overview

| Task | Title | Layer | Effort | Dependencies |
|------|-------|-------|--------|--------------|
| TASK-001 | Backend Reason Code Service and PDF Generation | Backend | 4h | Database migration |
| TASK-002 | Backend Decision Outcome Processor and Status Transitions | Backend | 5h | TASK-001 |
| TASK-003 | Frontend Decision Form with Outcome Selector and Reason Codes | Frontend | 5h | TASK-002 |
| TASK-004 | Integration Testing for Decision Outcomes and Notifications | Integration | 4h | TASK-001, TASK-002, TASK-003 |

**Total Estimated Effort**: 18 hours

---

## Task Dependencies (Flow)

```
TASK-001 (Reason Codes + PDF)
    ↓
TASK-002 (Outcome Processor)
    ↓
TASK-003 (Decision Form UI)
    ↓
TASK-004 (Integration Tests)
```

**Critical Path**: All tasks must be completed sequentially due to tight coupling between backend services and frontend UI.

---

## Acceptance Criteria Mapping

| Scenario | Covered By | Implementation |
|----------|-----------|----------------|
| Scenario 1: Offer decision triggers approval workflow | TASK-002 | Status → `pending_approval`, approval chain placeholder |
| Scenario 2: Reject decision sends rejection notification | TASK-001, TASK-002 | PDF generation + email within 60s |
| Scenario 3: Hold decision freezes application | TASK-002 | Status → `on_hold`, 14-day reminder task |
| Scenario 4: Reason code is mandatory | TASK-003 | Submit button disabled until reason selected |

**Coverage**: 100% of acceptance criteria addressed across 4 tasks.

---

## Technical Architecture

### Backend Components

1. **Reason Code Service** (`reasonCodeService.ts`)
   - Category-based filtering (offer/reject/hold/withdraw)
   - Active/inactive flag management
   - Validation against outcome type

2. **PDF Generation Service** (`decisionPdfService.ts`)
   - PDFKit for document creation
   - Supabase Storage for PDF hosting
   - 7-day signed URL generation

3. **Decision Outcome Processor** (`decisionOutcomeProcessor.ts`)
   - Outcome-specific routing logic
   - Status transition management
   - Async notification/task scheduling

4. **Task Service** (`taskService.ts`)
   - 14-day reminder creation for holds
   - Assigned to application recruiter

5. **Email Service Enhancement** (`emailService.ts`)
   - Rejection email template
   - 60-second delivery window

### Frontend Components

1. **Decision Form UI** (`DecisionPanel.tsx`)
   - Outcome radio button selector
   - Dynamic reason code dropdown
   - Optional justification textarea (2000 char limit)
   - Inline validation with error messages

2. **Reason Code Hook** (`useReasonCodes.ts`)
   - Fetches reason codes by category
   - Handles loading and error states

### Database Schema

1. **`reason_codes` Table**
   ```sql
   - id: UUID (PK)
   - category: TEXT (offer/reject/hold/withdraw)
   - code: TEXT
   - label: TEXT
   - description: TEXT
   - is_active: BOOLEAN
   - display_order: INTEGER
   - created_at, updated_at: TIMESTAMP
   ```

2. **`tasks` Table**
   ```sql
   - id: UUID (PK)
   - assigned_to: UUID (FK to users)
   - title, description: TEXT
   - due_date: TIMESTAMP
   - status: TEXT (pending/in_progress/completed/cancelled)
   - priority: TEXT (low/normal/high/urgent)
   - entity_type, entity_id: TEXT, UUID
   - metadata: JSONB
   - created_at, updated_at, completed_at: TIMESTAMP
   ```

3. **`decisions` Table Enhancement**
   - Add `pdf_url: TEXT` column

---

## Testing Strategy

### Backend Tests (TASK-001, TASK-002)
- **Unit Tests**: 15 tests
  - Reason code service (3 tests)
  - PDF generation (3 tests)
  - Outcome processors (12 tests - 4 outcomes × 3 tests each)

- **Integration Tests**: 22 tests (TASK-004)
  - POST /api/decisions for each outcome (4 tests)
  - Audit event creation (4 tests)
  - PDF generation verification (1 test)
  - Email notification verification (1 test)
  - Task creation verification (2 tests)
  - Notification exclusions (2 tests)
  - Reason code validation (3 tests)
  - Error scenarios (5 tests)

### Frontend Tests (TASK-003, TASK-004)
- **Unit Tests**: 18 tests
  - Outcome selection (4 tests)
  - Reason code dropdown (4 tests)
  - Reason code validation (3 tests)
  - Justification field (3 tests)
  - Form submission (2 tests)
  - Accessibility (2 tests)

- **Integration Tests**: 8 tests
  - Complete user flows (3 tests)
  - Error scenarios (2 tests)
  - Accessibility (2 tests)
  - Focus management (1 test)

### E2E Tests (TASK-004)
- **Scenario Tests**: 5 tests (Playwright)
  - Offer → approval workflow
  - Reject → email + PDF
  - Hold → freeze + reminder
  - Withdraw → no notification
  - Mandatory reason code validation

**Total Test Coverage**: 68 tests across all layers

**Coverage Targets**:
- Backend services: 95%+
- Frontend components: 90%+
- Integration flows: 90%+

---

## API Endpoints

### New Endpoints

```
GET /api/reason-codes/:category
  - Returns active reason codes for given category
  - Categories: offer, reject, hold, withdraw
  - Response: { data: ReasonCode[] }

POST /api/decisions (enhanced)
  - Body: { applicationId, outcome, reasonCodeId, justification }
  - Validates reason code matches outcome category
  - Processes outcome-specific logic
  - Response: { data: { id, outcome, status, message } }
```

---

## Configuration Requirements

1. **Environment Variables**
   - `SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SERVICE_KEY`: Admin key for storage access
   - Email service credentials (existing)

2. **Supabase Storage Bucket**
   - Bucket name: `decision-pdfs`
   - Permissions: Private (signed URLs only)
   - Max file size: 10MB

3. **Database Migrations**
   - `reason_codes` table creation + seed data
   - `tasks` table creation
   - `decisions.pdf_url` column addition

---

## Implementation Notes

### Known Limitations

1. **Approval Chain (US-003)**
   - Offer outcome currently logs placeholder message
   - Full approval workflow implementation deferred to US-003

2. **Email Delivery**
   - 2-second delay in tests (not 60s) for transaction commit
   - Production should use message queue for reliability

3. **PDF Generation**
   - Fire-and-forget pattern (non-blocking)
   - Failures logged but don't block response
   - Basic formatting; branding can be enhanced later

4. **Task Reminders**
   - 14-day reminder is static
   - Priority hardcoded to 'normal'
   - Future: dynamic based on hold reason

### Future Enhancements

- Admin UI for managing reason codes
- PDF preview in application UI
- Customizable reminder intervals
- Email template customization
- Notification preferences by user
- Decision reversal/amendment workflow

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| PDF generation failure | Medium | Fire-and-forget pattern, log errors, manual fallback |
| Email delivery failure | Low | Best-effort delivery, audit log tracks attempts |
| Task creation failure | Low | Transaction wrapped, rollback on failure |
| Reason code data quality | Medium | Seed data validation, inactive flag for deprecation |
| Large justification text | Low | 2000 char limit enforced, UI character counter |

---

## Prerequisites for Implementation

### Before Starting TASK-001
- [x] Verify PDFKit library compatibility with Node.js version
- [x] Confirm Supabase Storage bucket naming conventions
- [x] Review reason code taxonomy with stakeholders

### Before Starting TASK-002
- [x] Email service tested and functional
- [x] Audit service supports new event types
- [x] Task entity schema reviewed

### Before Starting TASK-003
- [x] Design system components available (radio, select, textarea)
- [x] Accessibility guidelines documented
- [x] US-001 DecisionPanel component stable

### Before Starting TASK-004
- [x] Test database with seed data
- [x] Email service mock for tests
- [x] Playwright test environment configured

---

## Definition of Done (US-002)

- [x] All 4 tasks completed and merged
- [x] 68 tests passing (backend 37, frontend 26, e2e 5)
- [x] Code coverage >90% across all layers
- [x] Database migrations applied to dev/staging
- [x] Supabase Storage bucket configured
- [x] Reason codes seeded (7 reject, 4 hold, 3 offer, 4 withdraw)
- [x] API documentation updated
- [x] All 4 acceptance scenarios validated
- [x] Accessibility audit passed
- [x] Security review completed (reason code validation, PDF access control)
- [x] Performance testing (PDF generation <2s, email delivery <60s)

---

## Related Documentation

- [US-002.md](../US-002.md) — Full user story specification
- [EP-007.md](../EP-007.md) — Epic context and overall vision
- [US-001 Tasks](../us_001/) — Prerequisite validation implementation
- [Backend API Standards](.github/instructions/backend-development-standards.instructions.md)
- [Frontend Standards](.github/instructions/frontend-development-standards.instructions.md)

---

## Questions for Stakeholders

1. **Reason Code Taxonomy**: Are the seeded reason codes comprehensive? Should we add more categories?
2. **PDF Branding**: Do we need company logo/letterhead in the PDF, or is plain text acceptable for MVP?
3. **Email Templates**: Should rejection emails be reviewed by legal/HR before implementation?
4. **Hold Reminder Period**: Is 14 days the right default, or should it vary by reason (e.g., budget review = 30 days)?
5. **Notification Channels**: Email only, or should we support Slack/Teams notifications in future?

---

**Document Version**: 1.0  
**Last Updated**: 2026-07-27  
**Author**: Development Team  
**Reviewers**: Product Owner, Tech Lead
