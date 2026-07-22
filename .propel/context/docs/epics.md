# AI Interview Application — Epic Backlog

## Document Control

| Field | Value |
| --- | --- |
| Document ID | EPICS-AI-INTERVIEW-001 |
| Version | 1.0 |
| Date | 2026-07-22 |
| Source Input | SPEC-AI-INTERVIEW-001 v1.0, DESIGN-AI-INTERVIEW-001 v1.0 |
| Status | Draft for product and engineering sign-off |

---

## 1. Overview

This document decomposes the AI Interview Application requirements into prioritized, actionable epics. Each epic represents a major feature area with clear business value, requirement traceability, and delivery dependencies.

**Total Epics**: 13 (including 2 foundational)

**Epic Naming Convention**: EP-XXX (e.g., EP-001) or reserved tokens (EP-TECH, EP-DATA)

---

## 2. Epic Portfolio

### 2.1 Portfolio Summary

| Epic ID | Epic Name | Priority | Business Value | Effort (Story Points) | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **EP-TECH** | Technical Bootstrap | Critical | Infrastructure foundation for all features | 34 | None |
| **EP-DATA** | Data Foundation | Critical | Database schema and data integrity | 21 | EP-TECH |
| **EP-001** | Candidate Identity & Registration | High | Enable candidate self-service onboarding | 21 | EP-TECH, EP-DATA |
| **EP-002** | Job Search & Application | High | Enable candidate application submission | 21 | EP-001, EP-DATA |
| **EP-003** | Resume Processing & AI Screening | High | Automate initial candidate evaluation | 34 | EP-002, EP-DATA |
| **EP-004** | HR Review & Decision Workflow | High | Enable human oversight of AI screening | 21 | EP-003 |
| **EP-005** | Interview Orchestration | High | Manage multi-stage interview process | 34 | EP-004 |
| **EP-006** | Assessment Integration | High | External testing platform integration | 21 | EP-005 |
| **EP-007** | Decision Governance & Offer Management | High | Final hiring decisions with approval chain | 21 | EP-005, EP-006 |
| **EP-008** | Communication & Notification | Medium | Automated stakeholder communications | 21 | EP-001 |
| **EP-009** | Admin Panel & Configuration | Medium | System administration and policy management | 21 | EP-DATA |
| **EP-010** | Analytics & Reporting | Medium | Pipeline metrics and insights | 13 | EP-DATA |
| **EP-011** | Audit & Compliance | High | Immutable audit trail and GDPR compliance | 13 | EP-DATA |

**Total Estimated Effort**: 296 Story Points

---

## 3. Foundational Epics

### EP-TECH — Technical Bootstrap

**Priority**: Critical  
**Business Value**: Infrastructure foundation enabling all application features  
**Effort Estimate**: 34 Story Points  
**Dependencies**: None

#### Description

Establish core technical infrastructure including hosting, CI/CD pipelines, security foundations, monitoring, and development tooling. This epic creates the production-ready platform foundation.

#### Success Criteria

- Vercel frontend deployment with preview environments
- Railway.app backend deployment with health checks
- GitHub Actions CI/CD pipeline operational
- Supabase PostgreSQL and Auth configured
- Upstash Redis operational
- OpenTelemetry + Grafana Cloud monitoring active
- All security controls implemented (TLS, RBAC, rate limiting)

#### Functional Requirements Mapped

- FR-002: Password policy enforcement infrastructure
- FR-009: Session token management
- FR-010: Authentication event logging

#### Technical Requirements Mapped

- TR-001: Authentication & authorization infrastructure
- TR-003: Event-driven workflow foundation (BullMQ setup)
- TR-008: Database connection pooling

#### Non-Functional Requirements Mapped

- NFR-001: Performance monitoring infrastructure
- NFR-002: Scalability foundation
- NFR-003: Availability and health checking
- NFR-004: Security controls (TLS, encryption, rate limiting)
- NFR-007: Observability infrastructure

#### Key Features

1. **Frontend Infrastructure** (5 SP)
   - Vercel deployment with CDN
   - Environment variable management
   - Preview environment automation

2. **Backend Infrastructure** (8 SP)
   - Railway.app Node.js deployment
   - Express.js API scaffold
   - WebSocket server setup (Socket.IO)
   - Environment configuration

3. **Data Infrastructure** (8 SP)
   - Supabase PostgreSQL setup
   - Prisma ORM configuration
   - Connection pooling
   - Upstash Redis setup

4. **CI/CD Pipeline** (5 SP)
   - GitHub Actions workflow
   - Automated testing gates
   - Deployment automation
   - Environment promotion

5. **Security Foundation** (5 SP)
   - TLS enforcement
   - Rate limiting (Upstash Redis)
   - Secret management
   - Security headers middleware

6. **Observability** (3 SP)
   - OpenTelemetry SDK setup
   - Grafana Cloud integration
   - Structured logging (Pino)
   - Health endpoints

#### Acceptance Criteria

- [ ] Frontend deploys to Vercel on main branch push
- [ ] Backend deploys to Railway.app with zero downtime
- [ ] CI pipeline runs tests and blocks on failure
- [ ] Grafana Cloud receives traces and metrics
- [ ] Rate limiting enforced at 100 req/min (public), 1000 req/min (authenticated)
- [ ] All HTTP endpoints enforce TLS 1.3
- [ ] Health endpoints return 200 OK when services healthy

---

### EP-DATA — Data Foundation

**Priority**: Critical  
**Business Value**: Database schema and data integrity enabling all business logic  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-TECH

#### Description

Design and implement the complete database schema including all entities, relationships, constraints, and indexes. Establish data integrity rules, audit tables, and migration infrastructure.

#### Success Criteria

- All 17+ tables created with proper constraints
- Foreign key relationships enforced
- Indexes optimized for query patterns
- Audit trail table configured as append-only
- Prisma migrations automated
- Row-level security policies defined

#### Functional Requirements Mapped

- All data models from FR sections (candidates, applications, screenings, etc.)

#### Data Requirements Mapped

- DR Section 7.1: All core domain entities
- DR Section 7.2: All data relationships
- DR Section 7.3: Data integrity constraints
- DR Section 7.4: Data retention policies
- DR Section 7.5: Data security and privacy

#### Technical Requirements Mapped

- TR-008.1: Immutable audit log
- TR-008.2: PII anonymization capability
- TR-008.3: Retention policy enforcement
- TR-008.6: Connection pooling

#### Key Features

1. **Core Schema** (8 SP)
   - Candidates, profiles, requisitions, applications
   - Resumes, screenings, reviews
   - Interview stages, scorecards, assessments
   - Decisions, approvals, communications
   - Users, audit events

2. **Configuration Tables** (3 SP)
   - Job families, scoring thresholds
   - Templates, reason codes
   - Approval policies

3. **Data Integrity** (5 SP)
   - Foreign key constraints
   - Unique constraints
   - Check constraints
   - Indexes for performance

4. **Audit Infrastructure** (3 SP)
   - Append-only audit_events table
   - Trigger for automatic audit logging
   - Retention policy implementation

5. **Migration Framework** (2 SP)
   - Prisma migration setup
   - Seed data scripts
   - Rollback procedures

#### Acceptance Criteria

- [ ] All 17 tables created with complete attributes
- [ ] All relationships enforce referential integrity
- [ ] Audit table rejects UPDATE and DELETE operations
- [ ] Prisma migrations run successfully in all environments
- [ ] Query performance meets < 500ms P95 target
- [ ] Row-level security policies tested and verified

---

## 4. Feature Epics

### EP-001 — Candidate Identity & Registration

**Priority**: High  
**Business Value**: Enable candidate self-service onboarding with secure authentication  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-TECH, EP-DATA

#### Description

Implement candidate registration, OTP verification, authentication, and profile management. Includes support for SSO for internal users and consent capture for GDPR compliance.

#### Success Criteria

- Candidates can self-register with email/password
- OTP verification functional via email
- Session management with 30-minute inactivity timeout
- SSO working for internal users (Google, GitHub)
- Consent version tracked and versioned

#### Functional Requirements Mapped

- FR-001 to FR-010: Registration, Login, and Candidate Identity

#### Business Rules Mapped

- BR-08: OTP verification lockout after 5 failures

#### Use Cases Mapped

- UC-001: Candidate Self-Registration

#### Key Features

1. **Registration Flow** (5 SP)
   - FR-001: Email/phone registration with OTP
   - FR-003: Consent capture and versioning
   - FR-006: Unique candidate ID generation
   - FR-007: Onboarding checklist

2. **Authentication** (5 SP)
   - FR-002: Password policy enforcement
   - FR-004: Role-based login routing
   - FR-009: Session token management with timeout
   - FR-010: Authentication event logging

3. **OTP Management** (3 SP)
   - FR-008: OTP resend with rate limiting
   - Supabase Auth integration
   - Email delivery via future EP-008

4. **SSO Integration** (5 SP)
   - FR-005: OAuth2/OIDC for Google and GitHub
   - Domain restriction enforcement
   - Role mapping from OAuth claims

5. **Profile Management** (3 SP)
   - Candidate profile CRUD
   - Preference management
   - Password reset flow

#### Acceptance Criteria

- [ ] Candidate can register with email and receive OTP
- [ ] OTP verification succeeds and creates verified account
- [ ] Account locks after 5 failed login attempts
- [ ] Session expires after 30 minutes of inactivity with warning modal
- [ ] Internal users can authenticate via Google/GitHub SSO
- [ ] Consent version and timestamp recorded in database

---

### EP-002 — Job Search & Application

**Priority**: High  
**Business Value**: Enable candidates to discover and apply for open positions  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-001, EP-DATA

#### Description

Implement job requisition listing, search/filtering, eligibility checking, and application submission workflow. Includes draft application support, auto-save, and duplicate prevention.

#### Success Criteria

- Candidates can browse and filter open requisitions
- Application form supports auto-save every 60 seconds
- Duplicate applications blocked within cooling period
- Withdrawal supported before HR review

#### Functional Requirements Mapped

- FR-011 to FR-020: Job Search, Application, and Resume Capture

#### Business Rules Mapped

- BR-03: Duplicate application prevention
- BR-13: Application withdrawal

#### Use Cases Mapped

- UC-002: Job Search and Application Submission

#### Key Features

1. **Requisition Listing** (5 SP)
   - FR-011: Display open requisitions with filters
   - Search by department, location, job type
   - Eligibility criteria display
   - Pagination support

2. **Application Workflow** (8 SP)
   - FR-012: Duplicate application detection
   - FR-013: Resume upload (delegated to EP-003)
   - FR-016: Auto-save every 60 seconds
   - FR-017: Real-time validation
   - FR-018: Progress bar and completion estimate

3. **Application Management** (5 SP)
   - FR-014: Resume parsing integration (EP-003)
   - FR-015: Manual profile edits with audit
   - FR-019: Confirmation email
   - FR-020: Withdrawal functionality

4. **Requisition Admin** (3 SP)
   - Create/edit requisitions
   - Slot management
   - Status transitions (open/closed)

#### Acceptance Criteria

- [ ] Candidate can filter jobs by department, location, experience level
- [ ] Application form auto-saves every 60 seconds
- [ ] Duplicate application attempt shows cooling period end date
- [ ] Progress bar reflects completed vs remaining sections
- [ ] Confirmation email delivered within 5 minutes
- [ ] Withdrawal updates status and releases requisition slot

---

### EP-003 — Resume Processing & AI Screening

**Priority**: High  
**Business Value**: Automate initial candidate evaluation, reducing recruiter screening time by 65%  
**Effort Estimate**: 34 Story Points  
**Dependencies**: EP-002, EP-DATA

#### Description

Implement resume upload, malware scanning, AI parsing, and match score computation. Includes explainability factors, confidence scoring, low-confidence escalation, and AI fallback mode.

#### Success Criteria

- Resume parsing completes within 3 minutes
- Match score computed with confidence level
- Explainability shows top 3 positive factors and up to 5 skill gaps
- Low-confidence candidates routed to manual review queue

#### Functional Requirements Mapped

- FR-013: Resume upload with malware scanning
- FR-014: AI resume parsing
- FR-021 to FR-028: AI Screening and Explainability

#### Business Rules Mapped

- BR-01: Resume scan failure handling
- BR-02: Low-confidence escalation
- BR-14: Threshold changes preserve old evaluations
- BR-16: AI fallback mode

#### Use Cases Mapped

- UC-003: AI Resume Screening

#### Technical Requirements Mapped

- TR-002: Resume Processing Pipeline

#### Key Features

1. **Resume Upload** (5 SP)
   - FR-013: PDF/DOCX upload with 10MB limit
   - Presigned URL generation (Supabase Storage)
   - Malware scanning (ClamAV or Supabase scan)
   - Direct client-to-storage upload

2. **AI Worker - Parsing** (8 SP)
   - FR-014: Extract name, email, phone, experience, skills, education
   - Python worker with spaCy NER
   - PDF/DOCX text extraction
   - BullMQ job queue integration

3. **AI Worker - Screening** (13 SP)
   - FR-021: Compute match score (skills, experience, role fit)
   - FR-022: Generate positive factors and skill gaps
   - FR-023: Flag low-confidence results
   - FR-024: Configurable thresholds per job family
   - FR-028: Model versioning

4. **Explainability UI** (5 SP)
   - FR-027: AI confidence meter (color-coded)
   - Display factors and gaps
   - HR review panel integration

5. **AI Management** (3 SP)
   - FR-025: Fallback mode handling
   - FR-026: Re-evaluation on threshold change
   - Health dashboard integration

#### Acceptance Criteria

- [ ] Resume uploads successfully with presigned URL
- [ ] Malware-infected files rejected with error message
- [ ] Parsed profile fields populate within 3 minutes
- [ ] Screening score stored with confidence, factors, gaps
- [ ] Low-confidence candidates appear in manual queue with flag
- [ ] AI confidence meter renders at correct color band
- [ ] Fallback mode visible on health dashboard

---

### EP-004 — HR Review & Decision Workflow

**Priority**: High  
**Business Value**: Enable human oversight and decision-making on AI screening results  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-003

#### Description

Implement HR review dashboard, candidate queue management, shortlist/reject decisions, path classification (fresher vs. experienced), and SLA monitoring.

#### Success Criteria

- HR reviewers can filter and sort candidate queue
- Shortlist/reject decisions require mandatory reason codes
- Path classification automated with override capability
- SLA countdown timers show amber/red alerts

#### Functional Requirements Mapped

- FR-029 to FR-036: HR Review, Shortlist, and Routing

#### Business Rules Mapped

- BR-04: Fresher path prerequisites
- BR-05: Experienced path routing
- BR-11: Shortlist override approval

#### Use Cases Mapped

- UC-004: HR Review and Shortlist

#### Key Features

1. **Review Dashboard** (8 SP)
   - FR-029: Queue with column filters
   - FR-030: Mandatory reason code selection
   - FR-034: SLA countdown timers
   - FR-036: Real-time badge notifications

2. **Decision Actions** (5 SP)
   - FR-030: Shortlist with reason code
   - FR-031: Auto-trigger rejection email
   - FR-035: Bulk reject action

3. **Path Classification** (5 SP)
   - FR-032: Auto-classify fresher vs. experienced
   - FR-033: Recruiter override with justification
   - Experience threshold configuration

4. **Queue Management** (3 SP)
   - Filtering by requisition, stage, confidence
   - Sorting by SLA, score, submitted date
   - WebSocket real-time updates

#### Acceptance Criteria

- [ ] Queue filters by requisition, stage, SLA status, confidence band
- [ ] Decision submission blocked without reason code
- [ ] Rejection email dispatched within 5 minutes
- [ ] Path classification visible and editable with justification
- [ ] SLA timers show amber at 8 hours before deadline
- [ ] Real-time notification when new candidate enters queue

---

### EP-005 — Interview Orchestration

**Priority**: High  
**Business Value**: Manage multi-stage interview process with scheduling, panel coordination, and scorecard capture  
**Effort Estimate**: 34 Story Points  
**Dependencies**: EP-004

#### Description

Implement interview scheduling with timezone awareness, panel management, scorecard capture with rubric validation, and state tracking (no-show, reschedule, cancellation).

#### Success Criteria

- Interviews scheduled with timezone-aware confirmations
- Panel members can submit scorecards with mandatory rubrics
- No-show and reschedule states tracked
- Automated reminders at 24h and 1h before interview

#### Functional Requirements Mapped

- FR-037 to FR-048: Assessments and Interviews

#### Business Rules Mapped

- BR-09: No-show handling

#### Use Cases Mapped

- UC-005: Interview Scheduling
- UC-006: Technical Interview
- UC-007: HR Round

#### Technical Requirements Mapped

- TR-005: Interview Orchestration

#### Key Features

1. **Scheduling** (8 SP)
   - FR-037: Timezone-aware slot selection
   - FR-047: Conflict detection
   - FR-048: Panel member invitation and confirmation
   - Calendar integration

2. **Scorecard Capture** (8 SP)
   - FR-041: Mandatory rubric dimensions
   - FR-045: Read-only candidate panel for interviewers
   - Recommendation submission
   - Comments capture

3. **Interview Lifecycle** (8 SP)
   - FR-042: No-show, reschedule, cancellation states
   - FR-043: Automated reminders (24h, 1h)
   - FR-046: Recruiter notifications on completion
   - State machine transitions

4. **Path Enforcement** (5 SP)
   - FR-038: Fresher path prerequisites
   - FR-039: Experienced path direct access
   - Stage progression gates

5. **Panel Management** (5 SP)
   - Panel member assignment
   - Availability checking
   - Confirmation tracking
   - Scorecard completion tracking

#### Acceptance Criteria

- [ ] Interview scheduled with localized timezone for candidate and panel
- [ ] Conflict indicator shown when slot unavailable
- [ ] Scorecard submission blocked without all mandatory dimensions
- [ ] Reminders sent at 24h and 1h before interview
- [ ] No-show marks candidate and prompts reschedule or close
- [ ] Fresher path blocks coding assessment until aptitude complete

---

### EP-006 — Assessment Integration

**Priority**: High  
**Business Value**: External testing platform integration for aptitude and coding assessments  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-005

#### Description

Integrate external assessment provider for test launch and score ingestion. Includes HMAC-signed webhook handling, idempotent score processing, and live coding environment.

#### Success Criteria

- Assessment tests launched via provider API
- Scores ingested via signed webhook callbacks
- Duplicate callbacks rejected idempotently
- Test URLs time-limited and session-bound

#### Functional Requirements Mapped

- FR-040: Assessment score ingestion via HMAC webhook
- FR-044: Live coding environment link generation

#### Technical Requirements Mapped

- TR-005.4: External assessment provider integration
- TR-005.5: Idempotent score ingestion

#### Key Features

1. **Test Launch API** (8 SP)
   - POST /assessments/launch to provider
   - Test URL + session token response
   - Candidate metadata pass-through
   - Duration and test type configuration

2. **Webhook Ingestion** (8 SP)
   - FR-040: HMAC signature validation
   - Idempotent callback handling (session token deduplication)
   - Score storage with metadata
   - Status update trigger

3. **Session Management** (3 SP)
   - FR-044: Persistent session timer
   - Reconnect handling
   - Session expiry enforcement

4. **Provider Configuration** (2 SP)
   - API key management
   - Webhook secret configuration
   - Provider health monitoring

#### Acceptance Criteria

- [ ] Test launched successfully returns test URL and session token
- [ ] Webhook validates HMAC signature before processing
- [ ] Duplicate callback with same session token returns 200 without creating new score
- [ ] Score metadata includes questions attempted, correct, and duration
- [ ] Live coding link persists session state across reconnects

---

### EP-007 — Decision Governance & Offer Management

**Priority**: High  
**Business Value**: Final hiring decisions with approval chain governance and offer dispatch  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-005, EP-006

#### Description

Implement final decision workflow with prerequisite checking, compensation band-based approval matrix, offer letter generation with token resolution, and offer response tracking.

#### Success Criteria

- Decision controls enabled only when all prerequisites met
- Approval chain enforced for high compensation bands
- Offer letter generated with resolved tokens
- Offer response tracked with automated reminders

#### Functional Requirements Mapped

- FR-049 to FR-056: Final Decision, Offer Governance, and Closure

#### Business Rules Mapped

- BR-06: Prerequisite enforcement
- BR-07: Approval matrix by compensation band
- BR-12: Offer auto-expiry
- BR-18: Requisition slot management

#### Use Cases Mapped

- UC-008: Final Decision and Offer Dispatch

#### Technical Requirements Mapped

- TR-006: Decision Governance

#### Key Features

1. **Prerequisite Validation** (3 SP)
   - FR-049: Check all mandatory stages complete
   - Display missing prerequisites
   - Enable/disable decision controls

2. **Decision Submission** (5 SP)
   - FR-050: Support outcomes (offer, reject, hold, withdraw)
   - FR-052: Generate decision summary PDF
   - Reason code capture

3. **Approval Chain** (8 SP)
   - FR-051: Query approval policy by compensation band
   - Multi-tier approver workflow
   - Approval status tracking
   - Email notifications to approvers

4. **Offer Generation** (5 SP)
   - FR-056: Token resolution (name, job title, salary, start date, deadline)
   - PDF generation
   - Storage in Supabase Storage
   - Token failure blocking

5. **Response Tracking** (3 SP)
   - FR-053: Automated reminders
   - FR-055: Slot decrement on acceptance
   - Offer expiry automation

#### Acceptance Criteria

- [ ] Decision button disabled with prerequisite list until all stages complete
- [ ] Approval chain triggered for compensation band tier 3+
- [ ] Offer letter PDF generated with all tokens resolved
- [ ] Token resolution failure blocks dispatch with descriptive error
- [ ] Offer acceptance decrements requisition slot and closes if full
- [ ] Offer expires automatically on deadline without response

---

### EP-008 — Communication & Notification

**Priority**: Medium  
**Business Value**: Automated stakeholder communications with delivery tracking and retry logic  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-001

#### Description

Implement tokenized email templates, multi-channel delivery (email + in-app), retry with exponential backoff, delivery status tracking, and notification preference centre.

#### Success Criteria

- All communication events dispatched via templates
- Delivery status tracked with provider message ID
- Retries handled with exponential backoff (max 5 attempts)
- Candidates can opt-in/out per channel

#### Functional Requirements Mapped

- FR-057 to FR-062: Communication and Notification System

#### Business Rules Mapped

- BR-10: Email delivery retry and fallback

#### Technical Requirements Mapped

- TR-004: Communication System

#### Key Features

1. **Template Management** (5 SP)
   - FR-057: 11 tokenized templates
   - Template preview with sample data
   - Version control
   - Locale support with fallback

2. **Email Delivery** (8 SP)
   - FR-058: Resend API integration
   - FR-059: Exponential backoff retry (30s → 2m → 8m → 32m → 128m)
   - Provider message ID logging
   - Webhook callback handling

3. **Multi-Channel Notifications** (5 SP)
   - FR-060: In-app alerts + email
   - WebSocket real-time delivery
   - Badge count management
   - Toast notifications

4. **Preference Centre** (3 SP)
   - FR-062: Opt-in/out per channel
   - Preference persistence
   - Opt-out enforcement within 1 send cycle

#### Acceptance Criteria

- [ ] Template renders correctly with sample data before send
- [ ] Delivery, bounce, and retry statuses visible in communication log
- [ ] Retry stops after 5 attempts and creates recruiter task
- [ ] In-app notification badge increments on new notification
- [ ] Opt-out honored on next queued send
- [ ] Webhook validates signature before processing

---

### EP-009 — Admin Panel & Configuration

**Priority**: Medium  
**Business Value**: System administration, policy management, and operational tooling  
**Effort Estimate**: 21 Story Points  
**Dependencies**: EP-DATA

#### Description

Implement admin panel for user management, role assignment, requisition management, scoring threshold editor, template management, and health dashboard.

#### Success Criteria

- Admins can create/deactivate users and assign roles
- Job family thresholds configurable with audit trail
- Platform health dashboard shows service status
- Bulk requisition import from CSV

#### Functional Requirements Mapped

- FR-063 to FR-068: Administration and Configuration

#### Business Rules Mapped

- BR-14: Threshold changes preserve existing evaluations
- BR-17: Closed requisition behavior

#### Key Features

1. **User Management** (5 SP)
   - FR-063: Create, deactivate, assign roles
   - Role permissions matrix
   - Active/inactive status

2. **Policy Configuration** (8 SP)
   - FR-064: Job family and stage policy editor
   - FR-065: Scoring threshold editor with versioning
   - Policy effective date management
   - In-flight application isolation

3. **Health Dashboard** (5 SP)
   - FR-067: BullMQ queue depth
   - AI worker service status
   - Email delivery rate
   - 60-second refresh

4. **Requisition Management** (3 SP)
   - FR-068: Bulk CSV import
   - Validation and error report
   - Status management (open/closed)

#### Acceptance Criteria

- [ ] Deactivated user cannot authenticate on next login
- [ ] Role changes take effect on next session
- [ ] Threshold change logged with author, timestamp, old and new values
- [ ] Health dashboard alerts on degraded AI or email service
- [ ] CSV import validates required fields and produces error report

---

### EP-010 — Analytics & Reporting

**Priority**: Medium  
**Business Value**: Pipeline insights, funnel optimization, and AI accuracy tracking  
**Effort Estimate**: 13 Story Points  
**Dependencies**: EP-DATA

#### Description

Implement recruiter dashboard with pipeline metrics, stage conversion funnels, AI accuracy tracking, no-show rates, and weekly hiring digest email.

#### Success Criteria

- Metrics update with < 5-minute lag
- Funnel charts exportable as PNG or CSV
- AI accuracy calculated as human-AI agreement rate
- Weekly digest sent every Monday at 08:00 local time

#### Functional Requirements Mapped

- FR-069 to FR-073: Analytics and Reporting

#### Key Features

1. **Pipeline Dashboard** (5 SP)
   - FR-069: Total applications, shortlist rate, time-to-hire
   - Real-time updates (< 5-minute lag)
   - Per-requisition filtering

2. **Funnel Visualization** (5 SP)
   - FR-070: Stage conversion rates
   - Drop-off analysis
   - PNG and CSV export

3. **AI Accuracy Tracking** (3 SP)
   - FR-071: Human-AI agreement rate per model version
   - Confusion matrix visualization
   - Model version filtering

4. **Operational Metrics** (2 SP)
   - FR-072: No-show and cancellation rates
   - 30-day trend lines
   - Stage-level breakdown

5. **Weekly Digest** (3 SP)
   - FR-073: Automated Monday 08:00 send
   - Key pipeline metrics summary
   - Preference toggle

#### Acceptance Criteria

- [ ] Metrics reflect database state within 5 minutes
- [ ] Funnel shows drop-off at each stage with percentages
- [ ] AI accuracy filters by model version correctly
- [ ] No-show rate trend covers last 30 days
- [ ] Digest generated and sent every Monday at 08:00 local

---

### EP-011 — Audit & Compliance

**Priority**: High  
**Business Value**: Immutable audit trail, GDPR compliance, and legal defensibility  
**Effort Estimate**: 13 Story Points  
**Dependencies**: EP-DATA

#### Description

Implement immutable audit log, audit log viewer with search/export, PII anonymization on deletion request, and 7-year retention enforcement.

#### Success Criteria

- All decision and communication events logged
- Audit table rejects UPDATE and DELETE operations
- PII anonymization completes within 30 days of request
- Audit retention enforced for 7 years

#### Functional Requirements Mapped

- FR-010: Authentication event logging
- FR-066: Audit log viewer

#### Business Rules Mapped

- BR-15: PII anonymization on deletion request

#### Data Requirements Mapped

- DR Section 7.3: Audit log immutability

#### Technical Requirements Mapped

- TR-008.1: Immutable audit log
- TR-008.2: PII anonymization
- TR-008.3: Retention policy

#### Key Features

1. **Audit Logging** (5 SP)
   - FR-010: Authentication events
   - State transition events
   - Decision and approval events
   - Communication send/failure events
   - Configuration change events

2. **Audit Viewer** (5 SP)
   - FR-066: Search by actor, event type, entity, date range
   - CSV export within 30 seconds
   - Pagination support

3. **GDPR Compliance** (3 SP)
   - PII anonymization job
   - Masked placeholder values
   - Legal record retention (7 years)
   - Audit trail preserved

#### Acceptance Criteria

- [ ] All auth, decision, and communication events appear in audit log
- [ ] Audit table rejects UPDATE and DELETE attempts
- [ ] Search by all dimensions returns correct results
- [ ] CSV export includes all visible columns
- [ ] Anonymization replaces PII with <anonymized> within 30 days

---

## 5. Epic Sequencing & Dependencies

### 5.1 Dependency Graph

```
EP-TECH (Foundation)
    ↓
EP-DATA (Database Schema)
    ↓
    ├─→ EP-001 (Identity & Registration)
    │       ↓
    │   EP-002 (Job Search & Application)
    │       ↓
    │   EP-003 (Resume & AI Screening)
    │       ↓
    │   EP-004 (HR Review & Decision)
    │       ↓
    │   EP-005 (Interview Orchestration)
    │       ├─→ EP-006 (Assessment Integration)
    │       │
    │       ↓
    │   EP-007 (Decision Governance & Offer)
    │
    ├─→ EP-008 (Communication & Notification) [Parallel to EP-001+]
    ├─→ EP-009 (Admin Panel) [Parallel to EP-002+]
    ├─→ EP-010 (Analytics) [Parallel to EP-003+]
    └─→ EP-011 (Audit & Compliance) [Parallel to EP-001+]
```

### 5.2 Phased Delivery Plan

#### Phase 1 — Foundation (Weeks 1–4, 55 SP)
- EP-TECH: Technical Bootstrap (34 SP)
- EP-DATA: Data Foundation (21 SP)

**Milestone**: Infrastructure and database ready

---

#### Phase 2 — Core Candidate Flow (Weeks 5–8, 63 SP)
- EP-001: Candidate Identity & Registration (21 SP)
- EP-002: Job Search & Application (21 SP)
- EP-003: Resume Processing & AI Screening (21 SP partial — parsing only)

**Milestone**: Candidates can register, apply, and upload resumes

---

#### Phase 3 — HR Workflow (Weeks 9–12, 76 SP)
- EP-003: Resume Processing & AI Screening (13 SP remaining — scoring)
- EP-004: HR Review & Decision Workflow (21 SP)
- EP-008: Communication & Notification (21 SP)
- EP-011: Audit & Compliance (13 SP)

**Milestone**: End-to-end candidate screening with HR decision

---

#### Phase 4 — Interview Pipeline (Weeks 13–18, 55 SP)
- EP-005: Interview Orchestration (34 SP)
- EP-006: Assessment Integration (21 SP)

**Milestone**: Full interview pipeline operational

---

#### Phase 5 — Decision & Governance (Weeks 19–21, 21 SP)
- EP-007: Decision Governance & Offer Management (21 SP)

**Milestone**: Final decision and offer dispatch functional

---

#### Phase 6 — Admin & Analytics (Weeks 22–24, 34 SP)
- EP-009: Admin Panel & Configuration (21 SP)
- EP-010: Analytics & Reporting (13 SP)

**Milestone**: Production-ready with full observability

---

## 6. Epic Prioritization Matrix

### 6.1 MoSCoW Priority

| Priority | Epic IDs | Rationale |
| --- | --- | --- |
| **Must Have** | EP-TECH, EP-DATA, EP-001, EP-002, EP-003, EP-004, EP-005, EP-007, EP-011 | Core hiring workflow from registration to offer |
| **Should Have** | EP-006, EP-008, EP-009 | Enhanced functionality and operational tooling |
| **Could Have** | EP-010 | Analytics insights for optimization |
| **Won't Have (This Release)** | — | SMS channel, mobile app, advanced BI |

### 6.2 Risk-Value Matrix

| Epic | Business Value | Technical Risk | Priority Quadrant |
| --- | --- | --- | --- |
| EP-TECH | High | Medium | High Priority |
| EP-DATA | High | Low | High Priority |
| EP-001 | High | Low | High Priority |
| EP-002 | High | Low | High Priority |
| EP-003 | High | High | High Priority (mitigate with fallback) |
| EP-004 | High | Low | High Priority |
| EP-005 | High | Medium | High Priority |
| EP-006 | Medium | High | Medium Priority (external dependency) |
| EP-007 | High | Medium | High Priority |
| EP-008 | Medium | Low | Medium Priority |
| EP-009 | Medium | Low | Medium Priority |
| EP-010 | Low | Low | Low Priority |
| EP-011 | High | Low | High Priority |

---

## 7. Cross-Cutting Concerns

### 7.1 Security (Applied Across All Epics)

- NFR-004: TLS 1.3, RBAC, RLS, rate limiting, input validation
- OWASP Top 10 mitigations
- PII masking in logs
- Dependency scanning (Dependabot)

### 7.2 Observability (Applied Across All Epics)

- NFR-007: OpenTelemetry traces, metrics, structured logs
- Health endpoints (/health, /ready)
- Error tracking and alerting
- Performance monitoring (P95 < 2s)

### 7.3 Accessibility (Applied to UI Epics)

- NFR-005: WCAG 2.2 AA conformance
- Keyboard navigation
- Screen reader support
- Color contrast and focus indicators

### 7.4 Testing (Applied Across All Epics)

- Unit tests (80% coverage target for critical paths)
- Integration tests (API endpoints, database queries)
- E2E tests (Playwright for critical user journeys)
- Accessibility tests (axe-core)

---

## 8. Success Metrics

### 8.1 Delivery Metrics

| Metric | Target |
| --- | --- |
| **Epic Completion Rate** | 100% of Must Have epics by Week 21 |
| **Velocity Stability** | ±20% variance between sprints |
| **Story Point Accuracy** | ±30% estimation accuracy after Sprint 3 |
| **Blocked Days** | < 10% of total sprint capacity |

### 8.2 Quality Metrics

| Metric | Target |
| --- | --- |
| **Test Coverage** | ≥ 80% for critical paths |
| **Production Defects** | < 5 critical/high defects per epic |
| **Accessibility Score** | WCAG 2.2 AA conformance (axe-core 100%) |
| **Performance** | P95 API latency < 2s |

### 8.3 Business Metrics

| Metric | Target |
| --- | --- |
| **Time-to-Shortlist** | < 3 days from application submission |
| **AI-Human Agreement Rate** | > 90% by end of Phase 3 |
| **No-Show Rate** | < 10% by end of Phase 4 |
| **Offer Acceptance Rate** | > 75% by end of Phase 5 |

---

## 9. Appendices

### Appendix A: Glossary

| Term | Definition |
| --- | --- |
| **Epic** | A large body of work that can be broken down into smaller user stories |
| **Story Point** | Relative unit of effort estimation using Fibonacci sequence |
| **MoSCoW** | Prioritization method: Must have, Should have, Could have, Won't have |
| **Technical Debt** | Implied cost of rework caused by choosing quick solutions over better approaches |
| **Spike** | Time-boxed research activity to reduce uncertainty |

### Appendix B: Reference Documents

- **Source Specification**: SPEC-AI-INTERVIEW-001 v1.0
- **Architecture Design**: DESIGN-AI-INTERVIEW-001 v1.0
- **UML Models**: MODEL-AI-INTERVIEW-001 v1.0
- **BRD**: AI_Interview_Workflow_BRD.md v3.0

### Appendix C: Approval Sign-off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| **Product Owner** | _____________ | _____________ | ________ |
| **Engineering Lead** | _____________ | _____________ | ________ |
| **Scrum Master** | _____________ | _____________ | ________ |

---

**End of Document**
