---
epic: EP-008
us_id: us_001
title: "Task Planning Summary — Tokenised Email Template Management"
created: 2026-07-28
status: completed
---

# Task Planning Summary — US-001

## Overview

**User Story**: US-001 — Tokenised Email Template Management with Preview and Versioning  
**Story Points**: 5 | **Total Effort**: 27 hours

This document summarizes the implementation task breakdown for building the email template management system with live preview, version control, and locale fallback.

---

## Task Breakdown

### TASK-001: Template Version History Schema and Backend API
- **Layer**: Backend
- **Effort**: 6h
- **Priority**: High
- **Scope**: Database schema for version tracking, CRUD API endpoints, rollback logic
- **Key Deliverables**:
  - `template_versions` table with foreign key to `templates`
  - API endpoints: GET, PUT templates with automatic versioning
  - Rollback endpoint: `POST /api/templates/:id/rollback`
  - Admin authorization enforcement

### TASK-002: Template Preview Service with Token Replacement
- **Layer**: Backend
- **Effort**: 4h
- **Priority**: High
- **Scope**: Live preview API with token rendering and sample data
- **Key Deliverables**:
  - `POST /api/templates/preview` endpoint
  - Token replacement using existing renderer
  - Sample data repository for all 11 template types
  - `GET /api/templates/sample-data/:type` endpoint
  - Missing token detection

### TASK-003: Frontend Template Editor UI with Rich Text
- **Layer**: Frontend
- **Effort**: 8h
- **Priority**: High
- **Scope**: Admin interface for template editing and version management
- **Key Deliverables**:
  - `/admin/templates` page with authorization guard
  - Rich text editor (Lexical recommended) with token insertion
  - Template selector for all 11 templates
  - Version history sidebar with restore capability
  - Save and rollback confirmation dialogs

### TASK-004: Frontend Live Preview with Token Documentation
- **Layer**: Frontend
- **Effort**: 5h
- **Priority**: High
- **Scope**: Real-time preview and token reference panel
- **Key Deliverables**:
  - Split-screen preview (HTML + plain text tabs)
  - Debounced preview updates (300ms)
  - Token documentation panel with copy-to-clipboard
  - Missing token warnings
  - Performance optimization with request cancellation

### TASK-005: Locale Fallback Logic and Template Seeding
- **Layer**: Backend
- **Effort**: 4h
- **Priority**: Medium
- **Scope**: Multi-locale support with English fallback and initial data
- **Key Deliverables**:
  - 3-tier locale resolution (exact → language → en)
  - Structured logging for fallback events
  - Seed script with all 11 platform templates
  - Email service integration with locale preference
  - Admin fallback monitoring endpoint

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Rich Text Editor | Lexical | Modern React integration, extensible, Microsoft-backed |
| State Management | React Query | API caching, request deduplication, loading states |
| Version Storage | PostgreSQL | Native support for versioning with foreign keys |
| Token Rendering | RegEx replacement | Simple, predictable, already implemented in EP-DATA |
| Authorization | Role middleware | Existing admin role enforcement pattern |

---

## Acceptance Criteria Coverage

| Scenario | Primary Task | Supporting Tasks |
|----------|--------------|------------------|
| **Scenario 1**: Live preview with token replacement | TASK-004 | TASK-002, TASK-003 |
| **Scenario 2**: Save creates version | TASK-001 | TASK-003 |
| **Scenario 3**: Version rollback | TASK-001 | TASK-003 |
| **Scenario 4**: Locale fallback | TASK-005 | — |

---

## Dependencies

### External
- EP-DATA / US-002: `templates` table schema (completed)
- EP-DATA / US-002: Token renderer utility (completed)
- User authentication and role middleware (exists)

### Internal Task Dependencies
```
TASK-001 (backend API)
  └─→ TASK-002 (preview service)
        └─→ TASK-004 (frontend preview)
  └─→ TASK-003 (editor UI)
        └─→ TASK-004 (frontend preview)
  └─→ TASK-005 (locale fallback)
```

**Recommended Implementation Order**:
1. TASK-001 (enables all backend functionality)
2. TASK-005 (seeding and fallback logic)
3. TASK-002 (preview API)
4. TASK-003 (editor UI structure)
5. TASK-004 (live preview integration)

---

## Risk Assessment

| Risk | Mitigation | Task |
|------|------------|------|
| Rich text editor complexity | Use proven library (Lexical) with minimal customization | TASK-003 |
| Preview API performance | Debounce requests, abort in-flight calls, cache results | TASK-004 |
| Version table growth | Add retention policy after 100 versions (future work) | TASK-001 |
| Token validation gaps | Sample data coverage tests ensure all tokens documented | TASK-002 |
| XSS in preview HTML | Iframe sandboxing, CSP headers | TASK-004 |

---

## Testing Strategy

### Unit Tests
- Token replacement and missing token detection (TASK-002)
- Locale fallback logic (TASK-005)
- Version creation and retrieval (TASK-001)
- Form validation (TASK-003)

### Integration Tests
- Template save creates version in database (TASK-001)
- Preview API returns rendered content (TASK-002)
- Rollback restores previous version (TASK-001)
- Email service uses locale fallback (TASK-005)

### E2E Tests
- Admin can edit template and see live preview (TASK-003, TASK-004)
- Version rollback loads historical content (TASK-003)
- Non-admin users blocked from template management (TASK-003)

### Performance Tests
- Preview updates complete in <500ms (TASK-004)
- Version history query scales to 100+ versions (TASK-001)

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Template edit cycle time | <2 minutes | Time from opening editor to successful save |
| Preview render latency | <500ms | P95 latency for preview API |
| Version history load | <1 second | Time to display 50 versions |
| Fallback log coverage | 100% | All unsupported locale requests logged |
| Admin adoption | 100% | All 11 templates configured within 1 week |

---

## Future Enhancements (Out of Scope)

- Multi-language template editor (translation UI)
- Template A/B testing and analytics
- Template diff viewer for version comparison
- Scheduled template activation (effective_from support)
- Template approval workflow for multi-admin teams
- Bulk template import/export
- Template preview with multiple sample datasets
- Custom token validation rules per template type

---

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-008 |
| FR | FR-057 |
| Dependencies | EP-DATA / US-002 |

---

**Planning Completed**: 2026-07-28  
**Estimated Completion**: 27 hours (5 story points)  
**Recommended Sprint**: Can be completed in single 2-week sprint with 1 full-stack developer
