# AI Interview Application — Architecture Design Document

## Document Control

| Field | Value |
| --- | --- |
| Document ID | DESIGN-AI-INTERVIEW-001 |
| Version | 1.0 |
| Date | 2026-07-22 |
| Source Input | SPEC-AI-INTERVIEW-001 v1.0 |
| Status | Draft for architecture review |

---

## 1. Executive Summary

This document defines the comprehensive technical architecture for the AI Interview Application, a cloud-native hiring platform that automates candidate screening, orchestrates interview workflows, and manages the complete hiring lifecycle from application to offer.

**Key Architectural Decisions:**
- **Pattern**: Event-driven microservices with CQRS for analytics
- **Stack**: Next.js 14 (App Router), Node.js, PostgreSQL, Redis
- **Deployment**: Serverless-first on Vercel (frontend) and Railway.app (backend)
- **AI Strategy**: Pluggable AI worker with fallback mechanisms
- **Data Strategy**: Single source of truth with event sourcing for audit trail

---

## 2. Architecture Patterns

### 2.1 Primary Patterns

| Pattern | Rationale | Applied To |
| --- | --- | --- |
| **Layered Architecture** | Clear separation of concerns; testability; maintainability | All backend services |
| **Event-Driven Architecture** | Loose coupling; async processing; audit trail | State transitions, notifications, AI processing |
| **CQRS (Command Query Responsibility Segregation)** | Optimize reads for analytics; separate write and read models | Analytics dashboard, reporting |
| **API Gateway** | Single entry point; rate limiting; request routing | REST API layer |
| **Repository Pattern** | Abstract data access; testability; consistent data operations | All database interactions |
| **Strategy Pattern** | Pluggable AI models; interchangeable assessment providers | AI screening, external integrations |

### 2.2 Anti-Patterns Avoided

| Anti-Pattern | Risk | Mitigation |
| --- | --- | --- |
| God Object | Monolithic controllers handling too much logic | Decomposed into domain services with single responsibilities |
| Circular Dependencies | Unmaintainable coupling between modules | Strict dependency flow: API → Service → Repository → Data |
| Magic Numbers | Hard-coded thresholds and configuration | All thresholds externalized to database configuration tables |
| Silent Failures | Lost events, untracked errors | Comprehensive error handling with alerting and dead-letter queues |

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web App    │  │  Admin Panel │  │  Mobile Web  │          │
│  │  (Next.js)   │  │  (Next.js)   │  │  (Next.js)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
└─────────┼──────────────────┼──────────────────┼──────────────────┘
          │                  │                  │
          └──────────────────┴──────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │    CDN + Edge Functions (Vercel)    │
          │  ┌────────────────────────────────┐ │
          │  │  Rate Limiting (Upstash Redis) │ │
          │  └────────────────────────────────┘ │
          └──────────────────┬──────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │        API Gateway Layer            │
          │  ┌────────────────────────────────┐ │
          │  │    REST API (Express.js)       │ │
          │  │  - Authentication Middleware   │ │
          │  │  - Request Validation (Zod)    │ │
          │  │  - CORS & Security Headers     │ │
          │  └────────────────────────────────┘ │
          └──────────────────┬──────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │      Application Services Layer     │
          │  ┌─────────┐  ┌──────────────────┐ │
          │  │  Auth   │  │  Candidate       │ │
          │  │ Service │  │  Service         │ │
          │  └─────────┘  └──────────────────┘ │
          │  ┌─────────┐  ┌──────────────────┐ │
          │  │ Screening│  │  Interview       │ │
          │  │ Service  │  │  Service         │ │
          │  └─────────┘  └──────────────────┘ │
          │  ┌─────────┐  ┌──────────────────┐ │
          │  │Decision │  │  Communication   │ │
          │  │ Service │  │  Service         │ │
          │  └─────────┘  └──────────────────┘ │
          └──────────────────┬──────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │       Event Processing Layer        │
          │  ┌────────────────────────────────┐ │
          │  │  BullMQ Job Queues             │ │
          │  │  - AI Screening Queue          │ │
          │  │  - Communication Queue         │ │
          │  │  - Assessment Integration Queue│ │
          │  │  - Analytics Update Queue      │ │
          │  └────────────────────────────────┘ │
          │  ┌────────────────────────────────┐ │
          │  │  Background Workers            │ │
          │  │  - AI Worker                   │ │
          │  │  - Email Worker                │ │
          │  │  - SLA Monitor Worker          │ │
          │  │  - Analytics Aggregator        │ │
          │  └────────────────────────────────┘ │
          └──────────────────┬──────────────────┘
                             │
          ┌──────────────────▼──────────────────┐
          │        Data & Storage Layer         │
          │  ┌────────────────────────────────┐ │
          │  │  PostgreSQL (Supabase)         │ │
          │  │  - Application Data            │ │
          │  │  - Event Store                 │ │
          │  │  - Audit Log (append-only)     │ │
          │  └────────────────────────────────┘ │
          │  ┌────────────────────────────────┐ │
          │  │  Redis (Upstash)               │ │
          │  │  - Session Cache               │ │
          │  │  - Rate Limit Counters         │ │
          │  │  - Job Queue State             │ │
          │  └────────────────────────────────┘ │
          │  ┌────────────────────────────────┐ │
          │  │  Object Storage (Supabase)     │ │
          │  │  - Resume Files                │ │
          │  │  - Generated Documents         │ │
          │  └────────────────────────────────┘ │
          └─────────────────────────────────────┘

          ┌─────────────────────────────────────┐
          │      External Integrations          │
          │  ┌────────────────────────────────┐ │
          │  │  Supabase Auth                 │ │
          │  │  - JWT Management              │ │
          │  │  - OAuth Providers             │ │
          │  │  - OTP Delivery                │ │
          │  └────────────────────────────────┘ │
          │  ┌────────────────────────────────┐ │
          │  │  Resend                        │ │
          │  │  - Transactional Email         │ │
          │  │  - Delivery Webhooks           │ │
          │  └────────────────────────────────┘ │
          │  ┌────────────────────────────────┐ │
          │  │  Assessment Provider           │ │
          │  │  - Test Launch API             │ │
          │  │  - Score Webhook (HMAC)        │ │
          │  └────────────────────────────────┘ │
          │  ┌────────────────────────────────┐ │
          │  │  Grafana Cloud                 │ │
          │  │  - Metrics & Traces (OTLP)     │ │
          │  │  - Log Aggregation             │ │
          │  └────────────────────────────────┘ │
          └─────────────────────────────────────┘
```

### 3.2 Component Interaction Flow

#### 3.2.1 Resume Screening Flow

```
Candidate → Upload Resume → API Gateway
                              ↓
                         Malware Scan
                              ↓
                    Store in Object Storage
                              ↓
                  Enqueue AI Screening Job
                              ↓
                  AI Worker picks up job
                              ↓
            Parse resume + Compute match score
                              ↓
              Store screening result in DB
                              ↓
          Publish "screening.completed" event
                              ↓
        ┌────────────┬────────────┬─────────────┐
        ↓            ↓            ↓             ↓
  Update Queue  Send Email  Update Analytics  Create Audit Entry
```

#### 3.2.2 Interview Scheduling Flow

```
Recruiter → Schedule Interview → API Gateway
                                   ↓
                    Validate prerequisites complete
                                   ↓
                      Check calendar conflicts
                                   ↓
                  Create interview plan record
                                   ↓
            Publish "interview.scheduled" event
                                   ↓
        ┌────────────┬────────────┬─────────────┐
        ↓            ↓            ↓             ↓
  Generate Link  Send Calendar  Notify Panel  Create Timeline Entry
                 Invite
```

---

## 4. Technology Stack

### 4.1 Frontend Stack

| Layer | Technology | Version | Justification |
| --- | --- | --- | --- |
| **Framework** | Next.js | 14.x (App Router) | Server components; built-in API routes; optimal SEO; Vercel deployment |
| **Language** | TypeScript | 5.x | Type safety; improved DX; reduced runtime errors |
| **State Management** | Zustand | 4.x | Lightweight; minimal boilerplate; React 18 compatible |
| **Forms** | React Hook Form | 7.x | Performant; minimal re-renders; Zod integration |
| **Validation** | Zod | 3.x | Runtime + compile-time validation; shared with backend |
| **UI Components** | Radix UI + Tailwind | Latest | Accessible primitives; utility-first styling |
| **Data Fetching** | TanStack Query | 5.x | Caching; optimistic updates; background refetch |
| **Real-time** | Socket.io Client | 4.x | WebSocket for notifications and queue updates |
| **Charts** | Recharts | 2.x | Composable; React-native; responsive |
| **Icons** | Lucide React | Latest | Tree-shakeable; comprehensive icon set |

### 4.2 Backend Stack

| Layer | Technology | Version | Justification |
| --- | --- | --- | --- |
| **Runtime** | Node.js | 20.x LTS | Async I/O; large ecosystem; Railway.app support |
| **Framework** | Express.js | 4.x | Mature; flexible; middleware ecosystem |
| **Language** | TypeScript | 5.x | Type safety; shared types with frontend |
| **ORM** | Prisma | 5.x | Type-safe queries; migrations; excellent DX |
| **Validation** | Zod | 3.x | Shared schemas with frontend |
| **Job Queue** | BullMQ | 5.x | Redis-backed; retries; delayed jobs; dashboard |
| **WebSocket** | Socket.io | 4.x | Fallback transports; room-based broadcasting |
| **Authentication** | Supabase Auth SDK | Latest | JWT handling; OAuth; OTP; RLS integration |
| **File Upload** | Multer + Supabase Storage | Latest | Multipart handling; S3-compatible storage |
| **Email** | Resend SDK | Latest | Transactional email; webhook support |

### 4.3 Data Stack

| Layer | Technology | Version | Justification |
| --- | --- | --- | --- |
| **Primary Database** | PostgreSQL (Supabase) | 15.x | ACID compliance; JSON support; full-text search; managed |
| **Cache** | Redis (Upstash) | 7.x | Session store; rate limiting; job queue state |
| **Object Storage** | Supabase Storage | Latest | S3-compatible; presigned URLs; CDN integration |
| **Search** | PostgreSQL Full-Text | Built-in | Native; no additional service; sufficient for MVP |

### 4.4 DevOps & Observability Stack

| Layer | Technology | Justification |
| --- | --- | --- |
| **Frontend Hosting** | Vercel | Zero-config Next.js deployment; edge functions; preview environments |
| **Backend Hosting** | Railway.app | PostgreSQL + Redis + Node.js; environment management; auto-deploy |
| **CI/CD** | GitHub Actions | Native GitHub integration; matrix builds; secrets management |
| **Monitoring** | Grafana Cloud | OTLP endpoint; distributed tracing; metrics; log aggregation |
| **APM** | OpenTelemetry | Vendor-neutral; auto-instrumentation; trace context propagation |
| **Error Tracking** | Sentry (optional Phase 2) | Real-time error tracking; release tracking; source maps |
| **Uptime Monitoring** | Uptime Robot (free tier) | HTTP checks; status page; Slack integration |

### 4.5 Development Tools

| Tool | Purpose |
| --- | --- |
| **Package Manager** | pnpm 8.x (monorepo support; faster installs) |
| **Monorepo** | Turborepo (shared packages; task caching) |
| **Code Quality** | ESLint + Prettier (enforced via pre-commit hooks) |
| **Testing** | Vitest (unit) + Playwright (E2E) |
| **API Testing** | Bruno or Postman (team collections) |
| **Pre-commit** | Husky + lint-staged (enforce quality gates) |
| **Docs** | Markdown + PlantUML (architecture diagrams) |

---

## 5. Non-Functional Requirements (NFR)

### NFR-001: Performance Requirements

| Metric | Target | Measurement Method | Priority |
| --- | --- | --- | --- |
| **API Response Time (P95)** | < 2 seconds | OpenTelemetry trace percentiles in Grafana | High |
| **AI Screening Latency** | < 3 minutes from upload | Job completion timestamp delta | High |
| **Page Load Time (FCP)** | < 1.5 seconds on 4G | Lighthouse CI in GitHub Actions | High |
| **Time to Interactive (TTI)** | < 2 seconds on 4G | Lighthouse CI; target score ≥ 90 | High |
| **Bundle Size (gzipped)** | < 200 KB initial | Vite bundle analyzer in CI | Medium |
| **Database Query P95** | < 500 ms | Prisma query logging + Grafana | High |
| **WebSocket Message Latency** | < 100 ms | Custom instrumentation | Medium |

### NFR-002: Scalability Requirements

| Aspect | Target | Implementation Strategy |
| --- | --- | --- |
| **Concurrent Users** | 200 active sessions | Horizontal scaling on Railway; CDN caching; stateless API |
| **Database Connections** | 50 connections (pooled) | Prisma connection pooling; Railway scaling |
| **Job Queue Throughput** | 500 jobs/minute | BullMQ concurrency tuning; worker auto-scaling |
| **File Upload Rate** | 50 uploads/minute | Rate limiting per IP; presigned URL uploads |
| **Email Throughput** | 1000 emails/hour | Resend batch API; retry queue |

### NFR-003: Availability Requirements

| SLA | Target | Measurement | Recovery Strategy |
| --- | --- | --- | --- |
| **Monthly Uptime** | 99.9% (≤ 43 minutes downtime) | Uptime Robot; Railway health checks | Automated failover; health endpoints |
| **RTO (Recovery Time Objective)** | ≤ 2 hours | DR runbook quarterly drill | Database restore; redeployment automation |
| **RPO (Recovery Point Objective)** | ≤ 15 minutes | Supabase point-in-time recovery | Automated backups every 15 minutes |
| **Degraded Mode** | AI fallback when worker unavailable | Health dashboard monitoring | Queue resumes; manual review bypass |

### NFR-004: Security Requirements

| Control | Implementation | Verification Method |
| --- | --- | --- |
| **Authentication** | Supabase JWT with refresh token rotation | Security audit; token expiry tests |
| **Authorization** | Row-level security (RLS) + role-based access control (RBAC) | Permission matrix tests; RLS policy review |
| **Transport Security** | TLS 1.3 enforced on all endpoints | SSL Labs scan; HSTS headers |
| **Password Policy** | Min 10 chars; 1 upper, 1 number, 1 special | Zod validation; E2E test coverage |
| **Rate Limiting** | 100 req/min (public); 1000 req/min (authenticated) | Upstash Redis; integration tests |
| **Input Validation** | Zod schemas on all API endpoints | Automated fuzzing; negative test cases |
| **PII Protection** | Masked in logs; encrypted at rest | Log review; encryption verification |
| **Dependency Scanning** | Dependabot weekly scans | GitHub Security tab; auto-merge patches |
| **OWASP Top 10** | Zero critical findings at release | OWASP ZAP CI scan; manual penetration test |

### NFR-005: Accessibility Requirements

| Standard | Target | Verification |
| --- | --- | --- |
| **WCAG Conformance** | 2.2 Level AA | axe-core automated scan + manual keyboard navigation audit |
| **Keyboard Navigation** | 100% operable without mouse | Manual test checklist; screen reader testing |
| **Color Contrast** | 4.5:1 minimum for text | axe-core validation |
| **Screen Reader Support** | NVDA + JAWS + VoiceOver | Manual testing with screen readers |
| **Focus Management** | Visible focus indicators on all interactive elements | Visual regression tests |

### NFR-006: Maintainability Requirements

| Aspect | Target | Implementation |
| --- | --- | --- |
| **Test Coverage** | ≥ 80% for critical paths | Vitest coverage reports; enforced in CI |
| **Documentation** | All public APIs documented | JSDoc comments; OpenAPI spec generation |
| **Code Review** | 100% of PRs reviewed by ≥ 1 peer | GitHub branch protection rules |
| **Dependency Updates** | Weekly automated PRs | Dependabot; automated test gate |
| **Technical Debt** | ≤ 5% of sprint capacity | Tracked in backlog; reviewed in retros |

### NFR-007: Observability Requirements

| Aspect | Implementation | Retention |
| --- | --- | --- |
| **Distributed Tracing** | OpenTelemetry → Grafana Cloud | 30 days |
| **Metrics** | Business + system metrics; OpenTelemetry → Grafana | 90 days |
| **Logs** | Structured JSON logs; centralized in Grafana Loki | 30 days |
| **Error Tracking** | Exception capture with stack traces; Sentry (Phase 2) | 90 days |
| **Audit Trail** | Append-only event log in PostgreSQL | 7 years (legal compliance) |
| **Health Endpoints** | `/health` (liveness) + `/ready` (readiness) | Real-time |

---

## 6. Technical Requirements (TR)

### TR-001: Authentication & Authorization

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-001.1 | JWT-based authentication with 30-minute access token and refresh token rotation | Supabase Auth SDK; token middleware | Token expiry E2E test; rotation verification |
| TR-001.2 | Role-based access control with roles: applicant, recruiter, technical_interviewer, hr_reviewer, hr_manager, system_admin | JWT claims; middleware role check | Permission matrix test suite |
| TR-001.3 | Row-level security (RLS) restricting candidate data access to owner + internal roles | Supabase RLS policies | RLS bypass attempt tests |
| TR-001.4 | OAuth2/OIDC SSO for internal users (Google, GitHub) with domain restriction | Supabase Auth OAuth providers | SSO integration tests |
| TR-001.5 | OTP verification for registration with rate limiting (3 resends/hour) | Supabase Auth OTP; Redis rate limiter | Rate limit violation tests |
| TR-001.6 | Account lockout after 5 failed login attempts within 15 minutes | Redis counter; lockout logic | Brute force simulation test |
| TR-001.7 | Session inactivity timeout of 30 minutes with 5-minute warning modal | Client-side timer + token refresh | Timeout E2E test |

### TR-002: Resume Processing Pipeline

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-002.1 | Accept PDF and DOCX uploads; max file size 10 MB | Multer middleware; MIME type validation | File upload test matrix |
| TR-002.2 | Malware scanning before persistence | ClamAV integration or Supabase Storage scan | Malware sample upload test |
| TR-002.3 | Store resumes in object storage with hashed key to prevent enumeration | Supabase Storage; UUID-based keys | Path enumeration negative test |
| TR-002.4 | Parse resume using AI worker extracting: name, email, phone, experience, skills, education, employers | AI worker job; structured output | Parsing accuracy test suite |
| TR-002.5 | Enqueue AI screening job on parse completion | BullMQ job publish | Job queue integration test |
| TR-002.6 | Compute match score using configurable threshold per job family | AI model inference; job family config | Scoring accuracy test; threshold override test |
| TR-002.7 | Store screening result with model version, confidence, factors, and gaps | Database write; versioning | Result persistence test |
| TR-002.8 | Route low-confidence results to manual review queue with flag | Conditional queue routing | Low-confidence routing test |

### TR-003: Event-Driven Workflows

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-003.1 | Publish domain events for all state transitions: screening.completed, review.decided, interview.scheduled, decision.made | Event publisher service; BullMQ events | Event publication integration tests |
| TR-003.2 | Consume events to trigger side effects: notifications, analytics updates, audit logging | Event consumer workers | Event handler unit tests |
| TR-003.3 | Ensure idempotent event processing with deduplication keys | Redis-backed deduplication | Duplicate event test |
| TR-003.4 | Implement exponential backoff retry for transient failures: 30s → 2m → 8m → 32m → 128m (max 5 attempts) | BullMQ retry configuration | Retry exhaustion test |
| TR-003.5 | Dead-letter queue for failed events after max retries | BullMQ failed job queue | Failed job inspection test |
| TR-003.6 | Event versioning with schema evolution support | Event payload version field | Schema migration test |

### TR-004: Communication System

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-004.1 | Tokenized email templates with dynamic field resolution | Template engine; token parser | Template rendering test |
| TR-004.2 | Dispatch emails via Resend API with retry logic | Resend SDK; retry wrapper | Email delivery integration test |
| TR-004.3 | Webhook callback for delivery status (delivered, bounced, failed) | Webhook endpoint; signature validation | Webhook security test |
| TR-004.4 | Log all communications with message ID, status, timestamps, and retry count | Database logging | Communication audit test |
| TR-004.5 | Notification preference centre for candidates (email opt-in/out) | Preference model; enforcement logic | Opt-out enforcement test |
| TR-004.6 | Multi-channel notifications for internal users (in-app + email) | WebSocket + email dispatch | Notification delivery test |
| TR-004.7 | In-app notification badge with unread count | WebSocket real-time update; DB counter | Real-time badge update test |

### TR-005: Interview Orchestration

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-005.1 | Timezone-aware scheduling with localized confirmations | Timezone conversion; i18n formatting | Timezone test matrix |
| TR-005.2 | Calendar conflict detection before slot confirmation | Overlapping slot query | Conflict detection test |
| TR-005.3 | Generate unique, time-limited assessment links with session state | JWT-based link; expiry validation | Link expiry test |
| TR-005.4 | External assessment provider integration via REST launch + HMAC webhook | Provider API client; webhook validator | Provider integration test |
| TR-005.5 | Idempotent score ingestion with duplicate callback token rejection | Redis deduplication; 200 ACK response | Duplicate callback test |
| TR-005.6 | Technical scorecard with mandatory rubric dimensions | Form validation; dimension completeness | Incomplete scorecard negative test |
| TR-005.7 | Automated reminders at 24h and 1h before interview | Scheduled reminder jobs | Reminder timing test |
| TR-005.8 | No-show, reschedule, cancellation state tracking with reason codes | State machine; reason validation | State transition test |

### TR-006: Decision Governance

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-006.1 | Prerequisite validation before enabling decision controls | Checklist query; UI gate | Incomplete prerequisite test |
| TR-006.2 | Configurable approval matrix by compensation band tier | Approval policy configuration; enforcement logic | Approval chain test |
| TR-006.3 | Approval chain tracking with requester, approvers, and timestamps | Approval record model | Multi-approver workflow test |
| TR-006.4 | Generate offer letter PDF with dynamic token resolution | PDF generation library; token resolver | Token resolution failure test |
| TR-006.5 | Block dispatch on token resolution failure with descriptive error | Validation before generation | Error message clarity test |
| TR-006.6 | Track offer response with automated reminders until response or expiry | Response tracking; scheduled reminders | Offer expiry automation test |
| TR-006.7 | Auto-expire offers on deadline; notify HR Manager | Expiry job; notification dispatch | Expiry notification test |
| TR-006.8 | Decrement requisition slot on offer acceptance; close requisition when full | Slot update transaction; status transition | Slot exhaustion test |

### TR-007: Analytics & Reporting

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-007.1 | Real-time pipeline metrics with ≤ 5-minute lag | Materialized view refresh; incremental aggregation | Lag measurement test |
| TR-007.2 | Stage conversion funnel per requisition | Aggregate query; group by stage | Funnel calculation test |
| TR-007.3 | AI accuracy tracking: human-AI agreement rate by model version | Agreement calculation; version filter | Accuracy metric test |
| TR-007.4 | No-show and cancellation rate metrics with 30-day trend | Time-series aggregation; rolling window | Trend calculation test |
| TR-007.5 | Weekly hiring digest email sent every Monday at 08:00 local time | Scheduled cron job; timezone-aware send | Digest generation test |
| TR-007.6 | CSV export for audit log, funnel data, and pipeline metrics | CSV serialization; large dataset streaming | Export performance test |

### TR-008: Data Management

| ID | Requirement | Implementation | Test Strategy |
| --- | --- | --- | --- |
| TR-008.1 | Immutable audit log with INSERT-only permissions | Database role restrictions; trigger enforcement | UPDATE/DELETE prevention test |
| TR-008.2 | PII anonymization on deletion request within 30 days | Anonymization job; masked placeholder values | Anonymization verification test |
| TR-008.3 | Retain audit and decision records for 7-year compliance period | Retention policy; archival automation | Retention enforcement test |
| TR-008.4 | Versioned screening scores with re-evaluation support | Score versioning; comparison query | Re-evaluation test |
| TR-008.5 | Event sourcing for candidate state transitions | Event store table; replay capability | Event replay test |
| TR-008.6 | Database connection pooling with max 50 connections | Prisma pool config | Connection pool exhaustion test |

---

## 7. Data Requirements (DR)

### 7.1 Data Models

#### 7.1.1 Core Domain Entities

```typescript
// Candidate Identity
interface Candidate {
  id: string;                    // UUID, immutable
  email: string;                 // Unique, indexed
  phone: string;                 // Unique, indexed
  consent_version: string;       // Privacy policy version
  consent_timestamp: Date;
  status: CandidateStatus;       // active | deactivated | anonymized
  created_at: Date;
  updated_at: Date;
}

// Candidate Profile
interface Profile {
  id: string;
  candidate_id: string;          // FK to candidates
  full_name: string;
  experience_years: number;
  skills: string[];              // Array of skill names
  education: Education[];        // JSON array
  raw_parse_json: object;        // Original parser output
  edited_by: string | null;      // User ID who made manual edits
  edited_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Job Requisition
interface Requisition {
  id: string;
  title: string;
  department: string;
  job_family: string;            // FK to job_families
  location: string;
  job_type: JobType;             // full_time | part_time | contract
  slots: number;                 // Total open slots
  filled_slots: number;          // Accepted offers
  status: RequisitionStatus;     // open | closed | on_hold
  eligibility_criteria: object;  // JSON
  opened_at: Date;
  closed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Application
interface Application {
  id: string;
  candidate_id: string;          // FK to candidates
  requisition_id: string;        // FK to requisitions
  status: ApplicationStatus;     // draft | submitted | screening | hr_review | shortlisted | rejected | offer | withdrawn
  path: CandidatePath;           // fresher | experienced
  path_overridden: boolean;
  path_override_justification: string | null;
  path_override_approver: string | null;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// Resume
interface Resume {
  id: string;
  application_id: string;        // FK to applications
  storage_key: string;           // Hashed UUID for object storage
  file_name: string;
  file_size: number;
  mime_type: string;
  scan_status: ScanStatus;       // pending | clean | infected
  scan_result: object | null;
  uploaded_at: Date;
}

// AI Screening Result
interface Screening {
  id: string;
  application_id: string;        // FK to applications
  model_version: string;         // AI model identifier
  score: number;                 // 0-100
  confidence: number;            // 0-1
  factors_json: object;          // Positive factors and skill gaps
  evaluated_at: Date;
  version: number;               // For re-evaluation support
}

// HR Review Decision
interface Review {
  id: string;
  application_id: string;        // FK to applications
  reviewer_id: string;           // FK to users
  decision: ReviewDecision;      // shortlist | reject
  reason_code: string;           // FK to reason_codes
  notes: string | null;
  decided_at: Date;
}

// Assessment
interface Assessment {
  id: string;
  application_id: string;        // FK to applications
  type: AssessmentType;          // aptitude | coding
  provider_ref: string;          // External provider reference
  score: number | null;
  metadata: object;              // Provider-specific data
  started_at: Date | null;
  completed_at: Date | null;
}

// Interview Stage
interface InterviewStage {
  id: string;
  application_id: string;        // FK to applications
  type: InterviewType;           // technical | hr
  scheduled_at: Date | null;
  timezone: string;
  panel_members: string[];       // Array of user IDs
  state: InterviewState;         // scheduled | completed | no_show | cancelled | rescheduled
  reason_code: string | null;    // FK to reason_codes if not completed
  created_at: Date;
  updated_at: Date;
}

// Technical Scorecard
interface Scorecard {
  id: string;
  interview_stage_id: string;    // FK to interview_stages
  interviewer_id: string;        // FK to users
  rubric_json: object;           // Dimension ratings
  recommendation: Recommendation; // strong_hire | hire | no_hire | strong_no_hire
  comments: string | null;
  submitted_at: Date;
}

// Final Decision
interface Decision {
  id: string;
  application_id: string;        // FK to applications
  outcome: DecisionOutcome;      // offer | reject | hold | withdraw
  reason_code: string;           // FK to reason_codes
  compensation_band: string | null;
  offer_details: object | null;  // JSON: salary, start_date, etc.
  decided_by: string;            // FK to users (HR Manager)
  decided_at: Date;
}

// Approval Record
interface Approval {
  id: string;
  decision_id: string;           // FK to decisions
  approver_id: string;           // FK to users
  tier: string;                  // Approval tier identifier
  status: ApprovalStatus;        // pending | approved | rejected
  comments: string | null;
  responded_at: Date | null;
  created_at: Date;
}

// Communication Log
interface Communication {
  id: string;
  application_id: string;        // FK to applications
  template_id: string;           // FK to templates
  channel: CommunicationChannel; // email | sms | in_app
  provider_name: string;         // resend | twilio
  message_id: string;            // Provider message ID
  status: DeliveryStatus;        // queued | sent | delivered | bounced | failed
  retry_count: number;
  sent_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
}

// Audit Event
interface AuditEvent {
  id: string;
  actor_id: string | null;       // FK to users; null for system
  event_type: string;            // Indexed
  entity_type: string;           // Indexed: application | candidate | decision
  entity_id: string;             // Indexed
  payload_json: object;          // Full event data
  ip_address: string | null;
  created_at: Date;              // Indexed
}
```

#### 7.1.2 Configuration Entities

```typescript
// Job Family Configuration
interface JobFamily {
  id: string;
  name: string;
  threshold_version: number;
  match_score_threshold: number; // 0-100
  confidence_threshold: number;  // 0-1
  experience_threshold_years: number; // Fresher vs experienced cutoff
  effective_from: Date;
  created_by: string;            // FK to users
  created_at: Date;
}

// Email Template
interface Template {
  id: string;
  name: string;
  type: TemplateType;            // registration_welcome | rejection | offer | etc.
  locale: string;                // en | es | fr (with fallback)
  version: number;
  subject: string;
  body_html: string;             // With {{tokens}}
  body_text: string;
  active: boolean;
  created_at: Date;
}

// Reason Code
interface ReasonCode {
  id: string;
  category: ReasonCategory;      // rejection | withdrawal | cancellation | override
  code: string;                  // Unique within category
  display_text: string;
  active: boolean;
}

// Approval Matrix Policy
interface ApprovalPolicy {
  id: string;
  compensation_band_min: number;
  compensation_band_max: number | null;
  required_approvers: ApproverTier[]; // Array of tier definitions
  active: boolean;
  created_at: Date;
}
```

### 7.2 Data Relationships

```
candidates 1:N profiles (versioned over time if needed)
candidates 1:N applications
requisitions 1:N applications
applications 1:1 resume
applications 1:N screenings (versioned re-evaluations)
applications 1:N reviews (could have multiple reviewers)
applications 1:N assessments
applications 1:N interview_stages
interview_stages 1:N scorecards (multiple panel members)
applications 1:1 decision
decisions 1:N approvals
applications 1:N communications
templates 1:N communications
job_families 1:N requisitions
reason_codes 1:N reviews, interview_stages, decisions
```

### 7.3 Data Integrity Constraints

| Constraint | Implementation | Enforcement Level |
| --- | --- | --- |
| **Candidate email uniqueness** | UNIQUE constraint | Database |
| **Application duplication prevention** | UNIQUE (candidate_id, requisition_id, submitted_at > NOW() - cooling_period) | Application logic + DB constraint |
| **Immutable audit log** | REVOKE UPDATE, DELETE on audit_events table | Database role |
| **Foreign key integrity** | FOREIGN KEY constraints with CASCADE/RESTRICT | Database |
| **Screening score immutability** | INSERT-only; re-evaluation creates new row | Application logic |
| **Slot count consistency** | Transaction + optimistic locking on requisitions.filled_slots | Application logic |
| **Resume storage key hashing** | UUID v4 generation in application layer | Application logic |

### 7.4 Data Retention & Archival

| Entity | Retention Period | Archival Strategy |
| --- | --- | --- |
| **Audit events** | 7 years (legal compliance) | Partition by year; archive old partitions to cold storage |
| **Applications (active)** | Duration of hiring process + 1 year | Soft delete with status = archived |
| **Applications (rejected)** | 2 years | Anonymize PII after 2 years; retain aggregated stats |
| **Resumes (files)** | Duration of application + 1 year | Delete from object storage on application archival |
| **Communications log** | 3 years | Partition by quarter; archive old partitions |
| **Screening results** | Indefinite (for AI model improvement) | Anonymize PII; retain score + features |
| **Scorecards** | 3 years | Archive with decision records |

### 7.5 Data Security & Privacy

| Requirement | Implementation |
| --- | --- |
| **PII encryption at rest** | Supabase default encryption (AES-256) |
| **PII masking in logs** | Custom logger middleware; redact email, phone, name fields |
| **Anonymization on deletion** | Replace PII with `<anonymized>` placeholder; retain hashed ID for audit trail |
| **Access control** | Row-level security (RLS) policies; candidates see only their data |
| **Data export** | Candidate can request full data export in JSON format |
| **Consent tracking** | Consent version + timestamp stored; required at registration |

---

## 8. Integration Architecture (AIR)

### 8.1 External System Integrations

#### 8.1.1 Supabase Auth Integration

**Purpose**: Authentication, authorization, OTP delivery, OAuth providers

**Integration Pattern**: SDK-based (client & server)

**Authentication Flow**:
```
Client → Supabase Auth API → JWT issuance
JWT stored in httpOnly cookie + client state
Every API request → JWT validation middleware
Refresh token rotation on every use
```

**Configuration**:
- **OAuth Providers**: Google Workspace (domain-restricted), GitHub (org-restricted)
- **OTP Provider**: Supabase built-in (email or SMS)
- **Session Duration**: 30 minutes (access token); 7 days (refresh token)
- **Token Storage**: httpOnly cookies (web); secure storage (mobile)

**Security**:
- PKCE for OAuth flows
- Domain restriction enforced at provider level
- Rate limiting on OTP resend (Redis-backed)

**Error Handling**:
- 401 Unauthorized → Redirect to login
- 403 Forbidden → Show access denied page
- OTP expired → Allow resend with cooldown

#### 8.1.2 Supabase Storage Integration

**Purpose**: Resume and generated document storage

**Integration Pattern**: Presigned URL + direct upload

**Upload Flow**:
```
Client → Request upload URL (POST /resumes/upload-url)
API → Generate presigned URL with 10-minute expiry
Client → Direct upload to Supabase Storage
Client → Confirm upload complete (POST /resumes/:id/confirm)
API → Enqueue malware scan + parse job
```

**Storage Buckets**:
- `resumes-raw`: Uploaded resumes (private; authenticated access only)
- `documents-generated`: Offer letters, decision PDFs (private; role-based access)
- `public-assets`: Logo, email templates assets (public read)

**Security**:
- Presigned URLs expire after 10 minutes
- Storage keys are UUIDs (no sequential enumeration)
- Malware scanning before marking as "clean"
- RLS policies enforce candidate ownership

**Configuration**:
- Max file size: 10 MB
- Allowed MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

#### 8.1.3 Resend Email Integration

**Purpose**: Transactional email delivery

**Integration Pattern**: REST API + webhook callbacks

**Send Flow**:
```
Communication Service → Resend API POST /emails
Resend → Queues email for delivery
Resend → Webhook callback on delivery status change
Webhook → Update communication log status
```

**Webhook Events**:
- `email.sent`: Email accepted by recipient MTA
- `email.delivered`: Email successfully delivered
- `email.bounced`: Permanent delivery failure
- `email.complained`: Recipient marked as spam

**Security**:
- Webhook signature validation (HMAC-SHA256)
- Retry logic with exponential backoff
- Rate limiting per IP (100 req/min public, 1000 req/min authenticated)

**Configuration**:
- Sender domain: `noreply@yourdomain.com` (configured in Resend)
- Reply-to: `support@yourdomain.com`
- Batch sending: Up to 50 recipients per API call

**Error Handling**:
- 429 Rate Limit → Exponential backoff
- 5xx Server Error → Retry with backoff
- 4xx Client Error → Log + alert; do not retry

#### 8.1.4 External Assessment Provider Integration

**Purpose**: Aptitude and coding test delivery

**Integration Pattern**: REST API (launch) + HMAC webhook (scores)

**Test Launch Flow**:
```
Interview Service → POST /assessments/launch
Provider API → Create test session
Provider API ← Return test URL + session token
Store session token in assessments table
Candidate → Click test link → Provider console
```

**Score Callback Flow**:
```
Provider → POST /webhooks/assessment-score (HMAC-signed)
Webhook Handler → Validate HMAC signature
Webhook Handler → Check duplicate by callback_token (idempotency)
Webhook Handler → Store score in assessments table
Webhook Handler → Publish assessment.completed event
Return 200 OK (or 200 for duplicate)
```

**Security**:
- HMAC-SHA256 signature validation with shared secret
- Callback token for idempotency (reject duplicates)
- Test links expire after session window (configured per test type)

**Configuration**:
- Provider API key stored in environment variable
- Webhook secret stored in environment variable
- Test types: `aptitude_general`, `coding_algorithm`, `coding_project`

**Error Handling**:
- Invalid HMAC → 401 Unauthorized
- Duplicate callback → 200 OK (no-op)
- Invalid application ID → 404 Not Found

#### 8.1.5 Grafana Cloud Observability Integration

**Purpose**: Distributed tracing, metrics, logs

**Integration Pattern**: OpenTelemetry SDK push (OTLP)

**Data Flow**:
```
Application → OpenTelemetry SDK
SDK → Batch telemetry data
SDK → OTLP export to Grafana Cloud
Grafana Cloud → Ingest + index
Dashboard → Query + visualize
```

**Instrumentation**:
- **Traces**: Auto-instrumentation for Express.js, Prisma, HTTP clients
- **Metrics**: Custom business metrics (applications_submitted, screenings_completed, etc.)
- **Logs**: Structured JSON logs with trace correlation

**Configuration**:
- **Trace Sampling**: 100% in dev; 10% in production (adjustable)
- **Metric Interval**: 60 seconds
- **Log Level**: INFO in production; DEBUG in development

**Alerts**:
- API P95 latency > 2 seconds
- Error rate > 1%
- AI worker queue depth > 100 jobs
- Email delivery failure rate > 5%

### 8.2 Internal API Design

#### 8.2.1 REST API Standards

**Base URL**: `https://api.yourdomain.com/v1`

**Request/Response Format**: JSON

**Authentication**: Bearer token in `Authorization` header

**Versioning**: URL path versioning (`/v1`, `/v2`)

**HTTP Status Codes**:
- 200 OK: Successful GET, PATCH
- 201 Created: Successful POST
- 204 No Content: Successful DELETE
- 400 Bad Request: Validation error
- 401 Unauthorized: Missing or invalid token
- 403 Forbidden: Insufficient permissions
- 404 Not Found: Resource does not exist
- 409 Conflict: Duplicate resource
- 429 Too Many Requests: Rate limit exceeded
- 500 Internal Server Error: Unexpected error
- 503 Service Unavailable: Degraded mode

**Error Response Format**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "issue": "Invalid email format"
      }
    ],
    "traceId": "abc123xyz"
  }
}
```

**Pagination**:
```
GET /applications?page=1&limit=20
Response headers:
  X-Total-Count: 150
  X-Page: 1
  X-Per-Page: 20
```

**Filtering & Sorting**:
```
GET /reviews/queue?status=pending&sort=-sla_deadline
```

#### 8.2.2 WebSocket Events

**Connection**: `wss://api.yourdomain.com/ws`

**Authentication**: JWT in connection handshake

**Event Format**:
```json
{
  "event": "queue:candidate-added",
  "data": {
    "applicationId": "uuid",
    "candidateName": "John Doe",
    "score": 85,
    "slaDeadline": "2026-07-23T14:00:00Z"
  },
  "timestamp": "2026-07-22T10:30:00Z"
}
```

**Rooms**: Users automatically join role-specific rooms (e.g., `hr-reviewer`, `recruiter`)

**Reconnection**: Exponential backoff (1s → 2s → 4s → 8s → 16s max)

---

## 9. Security Architecture

### 9.1 Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    1. Perimeter Security                     │
│  - Cloudflare DDoS protection (optional)                    │
│  - Rate limiting (Upstash Redis)                            │
│  - IP allowlisting for admin panel (optional)               │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                  2. Transport Security                       │
│  - TLS 1.3 enforced                                         │
│  - HSTS headers (max-age=31536000)                          │
│  - Certificate auto-renewal (Let's Encrypt)                 │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│               3. Authentication & Authorization              │
│  - Supabase Auth (JWT with rotation)                        │
│  - Role-based access control (RBAC)                         │
│  - Row-level security (RLS)                                 │
│  - OAuth2/OIDC for internal users                           │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                    4. Input Validation                       │
│  - Zod schema validation on all endpoints                   │
│  - Parameterized queries (Prisma ORM)                       │
│  - File upload validation (type, size, malware scan)        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                     5. Data Protection                       │
│  - Encryption at rest (Supabase default AES-256)            │
│  - PII masking in logs                                      │
│  - Secure secrets management (Railway/Vercel vaults)        │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                 6. Audit & Monitoring                        │
│  - Immutable audit log                                      │
│  - Security event alerting                                  │
│  - SIEM integration (Grafana Loki)                          │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 OWASP Top 10 Mitigations

| OWASP Risk | Mitigation | Verification |
| --- | --- | --- |
| **A01:2021 Broken Access Control** | RBAC + RLS policies; role validation middleware | Permission matrix tests; RLS bypass attempts |
| **A02:2021 Cryptographic Failures** | TLS 1.3; httpOnly cookies; AES-256 at rest | SSL Labs scan; encryption verification |
| **A03:2021 Injection** | Parameterized queries (Prisma); Zod validation | SQL injection test suite; fuzzing |
| **A04:2021 Insecure Design** | Threat modeling; security requirements in spec | Architecture review; threat model workshop |
| **A05:2021 Security Misconfiguration** | Secure defaults; CSP headers; HSTS | Security header scan; config review |
| **A06:2021 Vulnerable Components** | Dependabot weekly scans; automated patches | Dependency audit in CI |
| **A07:2021 Auth Failures** | JWT rotation; account lockout; MFA for internal | Brute force tests; session tests |
| **A08:2021 Data Integrity Failures** | HMAC webhook validation; signed uploads | Signature bypass tests |
| **A09:2021 Logging Failures** | Structured logging; security event alerts | Log completeness tests |
| **A10:2021 SSRF** | Allowlist external URLs; no user-controlled URLs | SSRF vulnerability tests |

### 9.3 Secrets Management

| Secret Type | Storage | Rotation Policy |
| --- | --- | --- |
| **Database URL** | Railway environment variable | On breach or quarterly |
| **Supabase API keys** | Vercel + Railway environment variables | On breach or quarterly |
| **Resend API key** | Railway environment variable | On breach or quarterly |
| **Assessment provider API key** | Railway environment variable | Per provider policy |
| **Webhook HMAC secrets** | Railway environment variable | Quarterly |
| **JWT signing key** | Supabase managed | Automatic rotation by Supabase |
| **Grafana OTLP endpoint credentials** | Railway environment variable | On breach or annually |

**Access Control**:
- Environment variables accessible only to CI/CD and authorized developers
- Secrets never committed to Git (enforced by pre-commit hooks + GitHub secret scanning)
- Separate secrets per environment (dev, staging, production)

---

## 10. Deployment Architecture

### 10.1 Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────┬───────────────────────────────────────────┘
                  │
      ┌───────────┴───────────┐
      │                       │
      ↓                       ↓
┌──────────────┐      ┌──────────────┐
│   Vercel     │      │  Railway.app │
│   (Frontend) │      │  (Backend)   │
│              │      │              │
│  - Next.js   │      │  - Express   │
│  - Edge Fns  │      │  - Workers   │
│  - SSR       │      │  - BullMQ    │
└──────┬───────┘      └──────┬───────┘
       │                     │
       │                     │
       └──────────┬──────────┘
                  │
      ┌───────────┴───────────────────────────────┐
      │                                           │
      ↓                                           ↓
┌──────────────┐                          ┌──────────────┐
│  Supabase    │                          │   Upstash    │
│              │                          │              │
│  - PostgreSQL│                          │  - Redis     │
│  - Auth      │                          │              │
│  - Storage   │                          └──────────────┘
└──────────────┘
      │
      ↓
┌──────────────┐
│ Grafana Cloud│
│  - Traces    │
│  - Metrics   │
│  - Logs      │
└──────────────┘
```

### 10.2 Deployment Strategy

#### 10.2.1 Frontend Deployment (Vercel)

**Trigger**: Push to `main` branch (production) or PR (preview)

**Pipeline**:
```
1. GitHub webhook → Vercel build trigger
2. Install dependencies (pnpm install)
3. Run lint + type check
4. Run unit tests (Vitest)
5. Build Next.js app (next build)
6. Deploy to Vercel edge network
7. Smoke tests on deployed URL
8. Update status in GitHub PR
```

**Configuration**:
- **Build Command**: `pnpm build`
- **Output Directory**: `.next`
- **Node Version**: 20.x
- **Environment Variables**: Injected from Vercel project settings

**Rollback**: Instant rollback to previous deployment via Vercel dashboard

#### 10.2.2 Backend Deployment (Railway.app)

**Trigger**: Push to `main` branch

**Pipeline**:
```
1. GitHub webhook → Railway build trigger
2. Install dependencies (pnpm install)
3. Run Prisma migrations (prisma migrate deploy)
4. Build TypeScript (tsc)
5. Deploy to Railway container
6. Health check (GET /health)
7. Update DNS if health check passes
```

**Configuration**:
- **Dockerfile**: Multi-stage build (build → production)
- **Port**: 3000 (configurable via `PORT` env var)
- **Health Check**: `/health` endpoint (5-second timeout)
- **Restart Policy**: Always restart on crash

**Zero-Downtime Deployment**: Railway routes traffic to new container after health check passes; old container drains for 30 seconds

**Rollback**: Redeploy previous Git commit via Railway dashboard or CLI

#### 10.2.3 Database Migrations

**Strategy**: Forward-only migrations with Prisma

**Process**:
```
1. Developer creates migration (prisma migrate dev)
2. Migration file committed to Git
3. CI runs migration in test DB (prisma migrate deploy)
4. PR approval required for schema changes
5. Merge to main → Automatic migration in production
```

**Safety**:
- Backward-compatible changes only (add columns with defaults; never drop columns in same release)
- Long-running migrations run manually during maintenance window
- Database backup before every migration

### 10.3 Environment Strategy

| Environment | Purpose | Trigger | Database | External Services |
| --- | --- | --- | --- | --- |
| **Development** | Local development | N/A | Local PostgreSQL or Supabase free tier | Mock providers or test accounts |
| **Preview** | PR preview | Pull request opened/updated | Supabase branch database (optional) | Test accounts |
| **Staging** | Pre-production testing | Push to `staging` branch | Supabase staging project | Test accounts or sandbox APIs |
| **Production** | Live system | Push to `main` branch | Supabase production project | Live accounts with production keys |

### 10.4 Scaling Strategy

#### Horizontal Scaling

| Component | Scaling Trigger | Max Instances |
| --- | --- | --- |
| **Frontend (Vercel)** | Automatic (edge functions scale infinitely) | N/A |
| **Backend (Railway)** | Manual or auto-scale on CPU > 70% | 5 instances |
| **Background Workers** | Manual scaling; separate Railway service per worker type | 3 per worker type |

#### Vertical Scaling

| Component | Current | Upgrade Trigger |
| --- | --- | --- |
| **Railway Backend** | 1 vCPU, 2 GB RAM | CPU > 80% sustained for 10 minutes |
| **Supabase Database** | Free tier (500 MB) | Storage > 400 MB or connection pool exhaustion |
| **Upstash Redis** | Free tier (10k commands/day) | Command rate > 8k/day |

#### Database Optimization

- **Indexes**: All foreign keys, frequently queried columns, and composite indexes on common filters
- **Connection Pooling**: Prisma connection pool (50 max connections)
- **Read Replicas**: Phase 2 (separate read/write databases for analytics)
- **Partitioning**: Partition `audit_events` by year for efficient archival

---

## 11. Observability & Monitoring

### 11.1 Monitoring Strategy

#### 11.1.1 Health Checks

**Liveness Probe**: `GET /health`
```json
{
  "status": "ok",
  "timestamp": "2026-07-22T10:30:00Z"
}
```

**Readiness Probe**: `GET /ready`
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "aiWorker": "ok"
  },
  "timestamp": "2026-07-22T10:30:00Z"
}
```

**Monitoring Interval**: 30 seconds (Uptime Robot + Railway health checks)

#### 11.1.2 Key Metrics

**System Metrics**:
- API response time (P50, P95, P99)
- Error rate (5xx responses / total requests)
- Request rate (req/sec)
- Database connection pool utilization
- Redis cache hit rate
- Job queue depth (per queue)
- Worker processing latency

**Business Metrics**:
- Applications submitted per hour
- AI screening completion rate
- HR review SLA compliance rate
- Interview no-show rate
- Offer acceptance rate
- Email delivery success rate
- Candidate funnel conversion rates

#### 11.1.3 Alerting Rules

| Alert | Condition | Severity | Recipient |
| --- | --- | --- | --- |
| **High Error Rate** | 5xx rate > 1% for 5 minutes | Critical | On-call engineer |
| **API Latency Spike** | P95 > 2 seconds for 5 minutes | High | DevOps team |
| **Database Connection Pool Exhausted** | Available connections < 5 | Critical | On-call engineer |
| **AI Worker Degraded** | No successful screening for 10 minutes | High | Operations team |
| **Email Delivery Failure** | Delivery failure rate > 5% | High | Operations team |
| **SLA Breach** | Candidate in review queue > 48 hours | Medium | HR Manager |
| **Job Queue Backlog** | Queue depth > 100 jobs for 15 minutes | Medium | DevOps team |

### 11.2 Logging Strategy

**Log Format**: Structured JSON

**Log Levels**: ERROR, WARN, INFO, DEBUG

**Log Destinations**: Grafana Loki (centralized)

**Log Retention**: 30 days

**Log Redaction**: PII fields (email, phone, full_name) masked with `<redacted>`

**Example Log Entry**:
```json
{
  "timestamp": "2026-07-22T10:30:00Z",
  "level": "INFO",
  "service": "api",
  "traceId": "abc123xyz",
  "spanId": "span456",
  "message": "Application submitted",
  "context": {
    "applicationId": "uuid",
    "candidateId": "uuid-redacted",
    "requisitionId": "uuid"
  }
}
```

### 11.3 Distributed Tracing

**Instrumentation**: OpenTelemetry auto-instrumentation

**Trace Context Propagation**: W3C Trace Context headers

**Trace Sampling**: 100% in dev/staging; 10% in production (adjustable)

**Trace Retention**: 30 days in Grafana Tempo

**Critical Traces**:
- Resume upload → parse → screening → queue entry
- Application submission → confirmation email
- Interview scheduling → panel invitations
- Decision → offer generation → email dispatch

---

## 12. Disaster Recovery & Business Continuity

### 12.1 Backup Strategy

| Component | Backup Frequency | Retention | Recovery Method |
| --- | --- | --- | --- |
| **PostgreSQL** | Every 15 minutes (Supabase automatic) | 7 days point-in-time recovery | Supabase restore to point-in-time |
| **Redis** | Daily snapshot (Upstash automatic) | 7 days | Upstash restore from snapshot |
| **Object Storage** | Continuous replication (Supabase) | Indefinite | Object already replicated |
| **Environment Config** | On every change (Git) | Indefinite | Redeploy from Git |

### 12.2 Disaster Recovery Plan

**Recovery Time Objective (RTO)**: ≤ 2 hours

**Recovery Point Objective (RPO)**: ≤ 15 minutes

**DR Runbook**:
1. Detect outage (automated alerts + manual verification)
2. Assess impact (which services are down?)
3. Restore database from latest backup (Supabase point-in-time recovery)
4. Redeploy backend from last known good commit
5. Redeploy frontend from last known good commit
6. Verify health checks pass
7. Resume background workers
8. Notify stakeholders of recovery completion

**DR Drill Schedule**: Quarterly

### 12.3 Degraded Mode Operations

| Failure Scenario | Degraded Mode Behavior | User Impact |
| --- | --- | --- |
| **AI Worker Unavailable** | Queue resumes for batch processing; route all to manual review | Longer screening times; no auto-advance |
| **Email Provider Down** | Queue emails in database; retry when provider recovers | Delayed notifications |
| **Assessment Provider Down** | Show maintenance message on test link; reschedule assessments | Candidates cannot take tests |
| **Database Read Replica Down** | Route all reads to primary | Slower analytics queries |
| **Redis Cache Down** | Fallback to database queries; disable rate limiting | Slower response times |

---

## 13. Testing Strategy

### 13.1 Test Pyramid

```
        ┌───────────────┐
        │  E2E Tests    │  (10% - Critical user journeys)
        │  (Playwright) │
        └───────────────┘
       ┌─────────────────┐
       │ Integration Tests│  (30% - API + database + external services)
       │    (Vitest)      │
       └─────────────────┘
      ┌───────────────────┐
      │   Unit Tests      │  (60% - Business logic, utilities, validators)
      │   (Vitest)        │
      └───────────────────┘
```

### 13.2 Test Coverage Targets

| Layer | Target | Enforcement |
| --- | --- | --- |
| **Unit Tests** | ≥ 80% line coverage | CI gate; coverage report in PR |
| **Integration Tests** | All API endpoints covered | CI gate |
| **E2E Tests** | All critical user journeys | CI gate; nightly full suite |

### 13.3 Critical Test Scenarios

| Test Type | Scenarios |
| --- | --- |
| **E2E** | Candidate registration → application → screening → shortlist → offer |
| **E2E** | Fresher path: aptitude → coding → technical interview → HR → offer |
| **E2E** | Experienced path: technical interview → HR → offer |
| **E2E** | Rejection flow with communication |
| **Integration** | Resume upload → parse → screening with mock AI worker |
| **Integration** | Assessment score webhook with HMAC validation |
| **Integration** | Offer approval chain with multiple approvers |
| **Integration** | SLA breach detection and alerting |
| **Unit** | Screening score calculation with various inputs |
| **Unit** | Path classification (fresher vs experienced) logic |
| **Unit** | Token resolution in email templates |
| **Unit** | Idempotency enforcement (duplicate callbacks) |

---

## 14. Migration & Rollout Plan

### 14.1 Phase 1: Foundation (Weeks 1-4)

**Deliverables**:
- Infrastructure setup (Railway, Vercel, Supabase, Upstash)
- Core data models and migrations
- Authentication system (registration, login, OTP)
- Basic candidate and requisition CRUD

**Milestone**: Internal demo of registration + job browsing

### 14.2 Phase 2: Application & Screening (Weeks 5-8)

**Deliverables**:
- Resume upload and storage
- AI worker + screening logic
- HR review queue and shortlist/reject
- Email communication system

**Milestone**: Full application → screening → HR review flow functional

### 14.3 Phase 3: Interview Orchestration (Weeks 9-12)

**Deliverables**:
- Path classification (fresher/experienced)
- Assessment provider integration
- Interview scheduling
- Technical scorecard capture

**Milestone**: Complete interview workflow for both paths

### 14.4 Phase 4: Decision & Offer Management (Weeks 13-16)

**Deliverables**:
- Approval matrix and decision governance
- Offer letter generation
- Response tracking and reminders
- Requisition slot management

**Milestone**: End-to-end hiring from application to offer acceptance

### 14.5 Phase 5: Analytics & Admin (Weeks 17-20)

**Deliverables**:
- Pipeline metrics dashboard
- Funnel charts and AI accuracy tracking
- Admin panel (user management, thresholds, audit log)
- Weekly hiring digest

**Milestone**: Production-ready system with full observability

---

## 15. UI/UX Design Philosophy

### 15.1 Design Theme — "Signal and Speed"

The platform's visual identity is built on clarity, momentum, and intelligent density. Every screen communicates status instantly, surfaces the next action without hunting, and rewards decision-makers with a fast, friction-free experience.

**Core Design Principles:**

| Principle | Implementation |
| --- | --- |
| **Decision-first layout** | The primary CTA and decision controls are always above the fold with no scrolling required |
| **Progressive disclosure** | Detail panels expand on demand; default views show only action-relevant data |
| **Status always visible** | Every screen renders the candidate's current stage, SLA countdown, and pending actions |
| **Dark and light mode** | Full theme support via CSS custom properties; default dark for internal dashboards |
| **Motion with purpose** | Transitions are fast (120–200 ms), directional (left-right for stage progression), and skippable |
| **Accessible by default** | WCAG 2.2 AA conformance; keyboard navigation; screen reader semantics |

### 15.2 Visual Design System

**Typography:**

| Role | Font | Weight | Size |
| --- | --- | --- | --- |
| Display / Hero | Clash Display | 700 | 2rem–3.5rem |
| Section Heading | Plus Jakarta Sans | 700 | 1.25rem–1.5rem |
| Body | Inter | 400/500 | 0.875rem–1rem |
| Monospaced (IDs, code, refs) | JetBrains Mono | 400 | 0.75rem–0.875rem |

**Color Palette:**

| Token | Light Mode | Dark Mode | Usage |
| --- | --- | --- | --- |
| `--color-brand-primary` | `#6366F1` (indigo) | `#818CF8` | Primary actions, active nav, CTAs |
| `--color-brand-accent` | `#06B6D4` (cyan) | `#22D3EE` | Highlights, confidence meters, charts |
| `--color-success` | `#10B981` | `#34D399` | Shortlisted, passed, delivered |
| `--color-warning` | `#F59E0B` | `#FBBF24` | Pending, SLA approaching, review needed |
| `--color-danger` | `#EF4444` | `#F87171` | Rejected, failed, error, overdue |
| `--color-surface-0` | `#FFFFFF` | `#0F172A` | Page background |
| `--color-surface-1` | `#F8FAFC` | `#1E293B` | Card and panel backgrounds |
| `--color-surface-2` | `#F1F5F9` | `#334155` | Secondary panels, table rows |
| `--color-border` | `#E2E8F0` | `#334155` | All border and divider lines |
| `--color-ink-primary` | `#0F172A` | `#F8FAFC` | Primary text |
| `--color-ink-secondary` | `#64748B` | `#94A3B8` | Supporting text, labels |

**Component Tokens:**

| Token | Value |
| --- | --- |
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `16px` |
| `--radius-pill` | `9999px` |
| `--shadow-card` | `0 1px 4px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)` |
| `--shadow-modal` | `0 8px 32px rgba(0,0,0,.18)` |
| `--motion-fast` | `120ms cubic-bezier(0.2,0,0.2,1)` |
| `--motion-medium` | `200ms cubic-bezier(0.2,0,0.2,1)` |

### 15.3 Key Screen UX Patterns

**Candidate Portal:**
- Glassmorphism hero sections with animated gradient mesh backgrounds
- Multi-step form with animated progress rail and step completion celebrations (confetti micro-animation)
- Resume upload with drag-and-drop, live parse preview with field highlight animations
- Assessment timer with visual pulse animation when under 10 minutes remaining
- Status page with animated timeline and stage completion indicators

**Internal Recruiter and HR Dashboard:**
- Dark sidebar navigation with icon badges for pending counts
- Kanban-style candidate pipeline view as an alternative to the queue table
- AI confidence cards with animated circular meters and explanatory factor chips
- Real-time queue updates via WebSocket — new candidates animate in without page refresh
- SLA countdown timers with three-state colour progression (green → amber → red)
- Keyboard shortcuts for power users (shortlist: `S`, reject: `R`, next candidate: `]`)

**Mobile Responsiveness:**
- Candidate-facing screens fully responsive down to 375 px
- Internal dashboards responsive to tablet (768 px); mobile shows read-only status views only
- Touch targets minimum 44×44 px; swipe gestures for stage navigation on mobile

### 15.4 Accessibility Standards

- WCAG 2.2 AA contrast compliance for all text and UI controls
- Full keyboard navigation with visible focus indicators
- ARIA live regions for status updates and error messages
- Color is never the sole conveyor of status (always paired with icon or label)
- Skip navigation link at page top for screen reader users
- Form fields with persistent labels and accessible error descriptions

---

## 16. Roles and Access Control

### 16.1 Role Definitions

| Role | Core Responsibilities | Key Permissions |
| --- | --- | --- |
| **Applicant** | Register, apply, upload resume, complete assessments | Own profile, own applications, own assessments |
| **Recruiter** | Manage funnel, initiate interview plans, manage communications, override routing | All applications for assigned requisitions; communication send |
| **HR Reviewer** | Validate AI screening output, shortlist or reject decisions | HR review queue; read-only AI score; shortlist/reject action |
| **Technical Interviewer** | Run technical interviews, submit scorecards | Assigned interview read; scorecard write |
| **HR Manager** | Conduct HR round, finalize decision, approve offers | HR round write; final decision; approval chain |
| **System Admin** | User management, role assignment, policy configuration, integration health | Full admin panel; audit log read; threshold write |

### 16.2 Permission Matrix

| Action | Applicant | Recruiter | HR Reviewer | Tech Interviewer | HR Manager | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Register / Login | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View own application | ✓ | — | — | — | — | ✓ |
| View all applications | — | ✓ (assigned) | ✓ (queue) | ✓ (assigned) | ✓ (assigned) | ✓ |
| Submit HR review decision | — | — | ✓ | — | — | — |
| Submit scorecard | — | — | — | ✓ | — | — |
| Submit HR round | — | — | — | — | ✓ | — |
| Submit final decision | — | — | — | — | ✓ | — |
| Send offer | — | ✓ | — | — | ✓ | — |
| Manage users | — | — | — | — | — | ✓ |
| Edit scoring thresholds | — | — | — | — | — | ✓ |
| View audit log | — | — | — | — | — | ✓ |

---

## 17. Success Metrics and KPIs

### 17.1 Business Metrics

| KPI | Baseline Target | Measurement Method |
| --- | --- | --- |
| **Time-to-shortlist (days)** | < 3 days from application | Application `submitted_at` → HR decision `decided_at` |
| **Time-to-offer (days)** | < 21 days from application | Application `submitted_at` → Decision `decided_at` (offer) |
| **HR review completion rate** | > 95% within SLA (48 h) | % of reviews decided before SLA deadline |
| **AI-Human agreement rate** | > 90% | % of AI recommendations confirmed by HR reviewer |
| **No-show rate (interview)** | < 10% | No-show events / scheduled interviews |
| **Offer acceptance rate** | > 75% | Accepted responses / offers dispatched |
| **Candidate drop-off rate** | < 15% per stage | Applications abandoned / applications started by stage |

### 17.2 Technical Metrics

| KPI | Baseline Target | Measurement Method |
| --- | --- | --- |
| **Email delivery rate** | > 98% | Delivered / sent per communication type |
| **P95 API latency** | < 2 s | OpenTelemetry trace percentile aggregation |
| **System uptime** | > 99.9% | Monthly calculated from health check monitoring |
| **AI screening latency** | < 3 minutes | Job completion timestamp delta from resume upload |
| **Database query P95** | < 500 ms | Prisma query logging + Grafana dashboard |
| **Job queue throughput** | 500 jobs/minute | BullMQ metrics export to Grafana |

### 17.3 Operational Metrics

| KPI | Baseline Target | Measurement Method |
| --- | --- | --- |
| **Critical conflicts identified** | Tracked and increasing | Overrides, low-confidence escalations, stage-guard blocks |
| **False positive rate (AI)** | < 20% | AI shortlist recommendations rejected by HR |
| **False negative rate (AI)** | < 10% | Manual reviews that overturn AI reject recommendations |
| **SLA breach rate** | < 5% | Candidates breaching review or decision SLA thresholds |

---

## 18. Risk Register

### 18.1 Technical Risks

| Risk | Probability | Impact | Mitigation Strategy | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| **Supabase free tier limits** | Medium | Medium | Monitor usage; upgrade plan at usage threshold; connection pooling via pgBouncer | DevOps | Open |
| **Railway.app service interruption** | Low | High | Health check auto-restart; DR runbook; Supabase data safe independently | DevOps | Open |
| **Assessment provider API outage** | Medium | High | Retry queue; manual score entry fallback via admin panel | Backend Lead | Open |
| **Email provider outage (Resend)** | Low | Medium | Retry with backoff; recruiter task fallback; secondary provider in Phase 2 | Operations | Open |
| **Playwright E2E flakiness in CI** | High | Low | Retry on failure (max 2); isolate flaky tests to separate suite | QA Lead | Open |
| **Timezone handling complexity** | Medium | Medium | Use standard library (luxon); extensive timezone test matrix | Backend Lead | Open |

### 18.2 Security Risks

| Risk | Probability | Impact | Mitigation Strategy | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| **Data breach or unauthorized access** | Low | Critical | RBAC + RLS; encrypted PII; audit alerts; incident response playbook | Security Lead | Open |
| **Candidate PII mishandled** | Low | Critical | Automated PII masking in logs; GDPR deletion flow; quarterly access review | Security Lead | Open |
| **Weak authentication exploitation** | Low | High | JWT rotation; account lockout; MFA for internal users; security audit | Security Lead | Open |

### 18.3 Business Risks

| Risk | Probability | Impact | Mitigation Strategy | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| **AI misclassification of candidate** | Medium | High | Human review gate; low-confidence escalation; model versioning and rollback | AI Lead | Open |
| **Poor candidate UX causing drop-off** | Medium | Medium | Autosave; progress indicators; usability testing before each release | Product Lead | Open |
| **SLA breaches on review queue** | Medium | Medium | Escalation dashboards; in-app alerts; queue balancing rules | HR Operations | Open |
| **Mobile responsiveness not validated** | Low | Low | Responsive design review in Phase 1; mobile testing in Phase 5 | Frontend Lead | Open |

### 18.4 Open Issues

| Issue | Owner | Target Resolution |
| --- | --- | --- |
| Fresher vs. experienced classification policy: define exact experience year threshold | HR Operations | M2 |
| Compensation band tiers: define band boundaries and approval matrix levels | Finance + HR | M4 |
| Assessment provider selection: vendor evaluation for aptitude and coding tests | Engineering + Procurement | M1 |
| Offer letter legal review: template language approved by legal counsel | Legal | M4 |
| Localization scope: which locales are required at go-live | Product | M5 |
| Analytics data warehouse: evaluate whether Grafana or dedicated BI tool needed post-launch | Engineering | M6 |

---

## 19. API Design and Integration Standards

This section provides comprehensive specifications for API design, WebSocket architecture, and external integration patterns to ensure consistency across frontend, backend, and third-party integrations.

### 19.1 REST API Conventions

| Aspect | Standard | Rationale |
| --- | --- | --- |
| **Base URL** | `https://api.aiinterview.app/v1` | Versioned API for backward compatibility |
| **Authentication** | Bearer JWT in `Authorization` header | Stateless authentication; scalable across instances |
| **Content-Type** | `application/json` for requests and responses | Industry standard; TypeScript/JavaScript native |
| **HTTP Methods** | GET (read), POST (create), PATCH (partial update), DELETE (remove) | RESTful semantics; idempotent where appropriate |
| **Status Codes** | 200 (success), 201 (created), 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 409 (conflict), 500 (server error) | Standard HTTP semantics |
| **Error Response** | `{ "error": { "code": string, "message": string, "details"?: object } }` | Consistent error structure; parseable by frontend |
| **Pagination** | Cursor-based using `?after=<cursor>&limit=<n>` (max 100) | Efficient for large datasets; no offset drift |
| **Timestamps** | ISO 8601 UTC format (`2026-07-22T14:30:00.000Z`) | Unambiguous timezone handling |
| **ID Format** | UUID v4 for all entity identifiers | Non-enumerable; collision-resistant |
| **Rate Limiting** | 100 req/min per IP (public); 1000 req/min (authenticated); returned in headers | Prevents abuse; visible to clients |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 987
X-RateLimit-Reset: 1658499600
```

### 19.2 Endpoint Catalog

#### Authentication Endpoints (`/auth`)

| Endpoint | Method | Auth | Purpose | Request Body | Response |
| --- | --- | --- | --- | --- | --- |
| `/auth/register` | POST | None | Candidate registration | `{ email, password, phone, consent }` | `{ message, candidateId }` |
| `/auth/login` | POST | None | Password-based login | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| `/auth/verify-otp` | POST | None | OTP confirmation | `{ email, otp }` | `{ accessToken, refreshToken, user }` |
| `/auth/refresh` | POST | None | Refresh access token | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| `/auth/logout` | POST | JWT | Revoke tokens | `{}` | `{ message }` |
| `/auth/sso/google` | GET | None | Google OAuth initiation | Query params | Redirect to Google |
| `/auth/sso/callback` | GET | None | OAuth callback handler | Query params | Redirect with tokens |

#### Application Endpoints (`/applications`)

| Endpoint | Method | Auth | Purpose | Request Body | Response |
| --- | --- | --- | --- | --- | --- |
| `/applications` | POST | JWT | Submit new application | `{ requisitionId, coverLetter? }` | `{ applicationId, status }` |
| `/applications/:id` | GET | JWT | Retrieve application details | — | `{ application, timeline }` |
| `/applications/:id/withdraw` | PATCH | JWT | Withdraw application | `{ reason }` | `{ message, status }` |
| `/applications/:id/timeline` | GET | JWT | Retrieve full audit timeline | — | `{ events[] }` |

#### Screening Endpoints (`/screening`)

| Endpoint | Method | Auth | Purpose | Request Body | Response |
| --- | --- | --- | --- | --- | --- |
| `/screening/:applicationId` | GET | JWT | Retrieve AI screening result | — | `{ score, confidence, factors, gaps }` |
| `/screening/thresholds/:jobFamily` | GET | JWT (Admin) | Get current threshold | — | `{ threshold, effectiveDate }` |
| `/screening/thresholds/:jobFamily` | PATCH | JWT (Admin) | Update threshold | `{ threshold, effectiveDate }` | `{ message }` |

#### Review Endpoints (`/reviews`)

| Endpoint | Method | Auth | Purpose | Request Body | Response |
| --- | --- | --- | --- | --- | --- |
| `/reviews/queue` | GET | JWT (HR) | Retrieve HR review queue | Query params (filters) | `{ candidates[], pagination }` |
| `/reviews/:applicationId/decide` | POST | JWT (HR) | Submit shortlist/reject | `{ decision, reasonCode, notes }` | `{ message, newStatus }` |
| `/reviews/bulk-reject` | POST | JWT (HR) | Bulk reject action | `{ applicationIds[], reasonCode }` | `{ processed, failed[] }` |

#### Interview Endpoints (`/interviews`)

| Endpoint | Method | Auth | Purpose | Request Body | Response |
| --- | --- | --- | --- | --- | --- |
| `/interviews/:applicationId/schedule` | POST | JWT (Recruiter) | Schedule interview stage | `{ type, scheduledAt, timezone, panelMembers[] }` | `{ stageId, invites }` |
| `/interviews/:stageId/scorecard` | POST | JWT (Interviewer) | Submit scorecard | `{ rubric, recommendation, comments }` | `{ message }` |
| `/interviews/:stageId/state` | PATCH | JWT (Recruiter) | Update stage state | `{ state, reasonCode }` | `{ message, newState }` |

#### Decision Endpoints (`/decisions`)

| Endpoint | Method | Auth | Purpose | Request Body | Response |
| --- | --- | --- | --- | --- | --- |
| `/decisions/:applicationId` | POST | JWT (HR Manager) | Submit final decision | `{ outcome, compensationBand, offerDetails, reasonCode }` | `{ decisionId, requiresApproval }` |
| `/decisions/:id/approve` | POST | JWT (Approver) | Approve offer | `{ comments }` | `{ message, approvalStatus }` |
| `/decisions/:id/respond` | POST | JWT (Candidate) | Respond to offer | `{ response: 'accept' | 'decline' }` | `{ message, outcome }` |

### 19.3 WebSocket Architecture

**WebSocket Server Endpoint:** `wss://api.aiinterview.app/ws`

**Authentication:** JWT passed during WebSocket handshake via query parameter:
```javascript
const socket = io('wss://api.aiinterview.app/ws', {
  auth: { token: accessToken }
});
```

**Room-Based Broadcasting:**

Socket.IO rooms are used for targeted event delivery:

| Room Pattern | Members | Purpose |
| --- | --- | --- |
| `requisition:<requisitionId>` | All recruiters and HR reviewers assigned to the requisition | Broadcast candidate queue updates |
| `user:<userId>` | Individual authenticated user | Personal notifications and alerts |
| `admin` | All system administrators | Platform health alerts and critical events |

**Connection Lifecycle:**

```typescript
// Client-side connection
socket.on('connect', () => {
  // Join requisition rooms based on user assignments
  socket.emit('join-rooms', { requisitionIds: [...] });
});

socket.on('disconnect', (reason) => {
  // Automatic reconnection with exponential backoff
});
```

**Event Specifications:**

| Event | Direction | Payload Schema | Trigger Condition |
| --- | --- | --- | --- |
| `queue:candidate-added` | Server → Client | `{ applicationId: UUID, candidateName: string, score: number, confidence: number, slaDeadline: ISO8601 }` | New candidate enters HR review queue |
| `queue:status-changed` | Server → Client | `{ applicationId: UUID, oldStatus: string, newStatus: string, timestamp: ISO8601 }` | Application status transition |
| `notification:new` | Server → Client | `{ id: UUID, type: 'sla_breach' | 'communication_failed' | 'ai_fallback', title: string, body: string, link: string, priority: 'low' | 'medium' | 'high', timestamp: ISO8601 }` | SLA breach, communication failure, AI degradation |
| `screening:complete` | Server → Client | `{ applicationId: UUID, score: number, confidence: number, factors: string[], gaps: string[], timestamp: ISO8601 }` | AI screening completes |
| `interview:reminder` | Server → Client | `{ applicationId: UUID, candidateName: string, interviewDate: ISO8601, stage: string, minutesUntil: number }` | 24h or 1h before interview |
| `sla:breach` | Server → Client | `{ applicationId: UUID, candidateName: string, stage: string, slaDeadline: ISO8601, breachTime: ISO8601, minutesOverdue: number }` | SLA deadline exceeded |
| `heartbeat` | Server ↔ Client | `{ timestamp: ISO8601 }` | Every 30 seconds (keepalive) |

**Error Handling:**

```typescript
socket.on('error', (error) => {
  // Log error and attempt reconnection
  console.error('WebSocket error:', error);
});

socket.on('connect_error', (error) => {
  // Authentication failure or network issue
  if (error.message === 'Authentication failed') {
    // Refresh JWT and retry
  }
});
```

**Reconnection Strategy:**
- Automatic reconnection with exponential backoff: 1s → 2s → 4s → 8s → 16s (max)
- Preserve room subscriptions across reconnections
- Emit `reconnect` event to trigger state synchronization

### 19.4 External Assessment Provider Integration

**Integration Pattern:** REST API (launch) + HMAC-signed webhook (score ingestion)

**Test Launch Flow:**

```http
POST https://provider.example.com/api/v1/assessments/launch
Authorization: Bearer <PROVIDER_API_KEY>
Content-Type: application/json

{
  "candidateId": "550e8400-e29b-41d4-a716-446655440000",
  "assessmentType": "aptitude" | "coding",
  "duration": 60,
  "returnUrl": "https://app.aiinterview.app/assessments/complete"
}

Response:
{
  "testUrl": "https://provider.example.com/test/abc123",
  "sessionToken": "xyz789",
  "expiresAt": "2026-07-22T16:30:00.000Z"
}
```

**Score Ingestion Webhook:**

Provider calls our webhook endpoint with HMAC signature:

```http
POST https://api.aiinterview.app/v1/webhooks/assessment-score
Content-Type: application/json
X-Signature: sha256=<HMAC-SHA256>

{
  "sessionToken": "xyz789",
  "candidateId": "550e8400-e29b-41d4-a716-446655440000",
  "score": 85,
  "maxScore": 100,
  "completedAt": "2026-07-22T15:45:00.000Z",
  "metadata": {
    "duration": 58,
    "questionsAttempted": 45,
    "questionsCorrect": 38
  }
}
```

**HMAC Signature Validation:**

```typescript
import crypto from 'crypto';

function validateWebhookSignature(payload: string, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', process.env.ASSESSMENT_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(`sha256=${expectedSignature}`)
  );
}
```

**Idempotency Guarantee:**
- Session token is unique per test attempt
- Duplicate callbacks with same session token return 200 OK without creating new score row
- Deduplicate using Redis cache with 24-hour TTL:
  ```typescript
  const cacheKey = `assessment:webhook:${sessionToken}`;
  if (await redis.exists(cacheKey)) {
    return { status: 200, message: 'Already processed' };
  }
  await redis.setex(cacheKey, 86400, 'processed');
  ```

### 19.5 Grafana Cloud Observability Integration

**OTLP Exporter Configuration:**

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'ai-interview-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'production',
  }),
});

const exporter = new OTLPTraceExporter({
  url: 'https://otlp-gateway.grafana.net/otlp/v1/traces',
  headers: {
    Authorization: `Basic ${Buffer.from(
      `${process.env.GRAFANA_INSTANCE_ID}:${process.env.GRAFANA_API_KEY}`
    ).toString('base64')}`,
  },
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();
```

**Custom Metrics:**

```typescript
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const meterProvider = new MeterProvider({
  resource: /* same as above */,
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ /* same config */ }),
      exportIntervalMillis: 60000, // 1 minute
    }),
  ],
});

const meter = meterProvider.getMeter('ai-interview-api');

// Business metrics
const applicationCounter = meter.createCounter('applications.submitted');
const screeningDurationHistogram = meter.createHistogram('screening.duration', {
  unit: 'ms',
  description: 'AI screening processing time',
});

// Technical metrics
const apiLatencyHistogram = meter.createHistogram('http.server.duration', {
  unit: 'ms',
  description: 'API endpoint latency',
});
```

---

## 20. Appendices

### Appendix A: Glossary

| Term | Definition |
| --- | --- |
| **BullMQ** | Redis-backed job queue for Node.js with retries and scheduling |
| **CQRS** | Command Query Responsibility Segregation; separate models for reads and writes |
| **HMAC** | Hash-based Message Authentication Code; used for webhook signature validation |
| **JWT** | JSON Web Token; stateless authentication token |
| **OTLP** | OpenTelemetry Protocol; standard for telemetry data export |
| **Presigned URL** | Time-limited, signed URL allowing direct client-to-storage upload |
| **RLS** | Row-Level Security; database-level access control enforcing data ownership |
| **SLA** | Service Level Agreement; expected response time for a task |
| **WebSocket** | Protocol providing full-duplex communication channels over a single TCP connection |
| **Socket.IO** | JavaScript library for real-time, bidirectional, event-based communication |
| **OTLP Exporter** | OpenTelemetry component that sends telemetry data to observability backends |

### Appendix B: Reference Documents

- **Source Specification**: SPEC-AI-INTERVIEW-001 v1.0
- **Architecture Patterns**: Martin Fowler's Enterprise Application Architecture
- **OWASP Top 10**: 2021 Edition
- **WCAG Guidelines**: Web Content Accessibility Guidelines 2.2
- **OpenTelemetry Spec**: OpenTelemetry Semantic Conventions

### Appendix C: Approval Sign-off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| **Product Owner** | _____________ | _____________ | ________ |
| **Technical Architect** | _____________ | _____________ | ________ |
| **Security Lead** | _____________ | _____________ | ________ |
| **QA Lead** | _____________ | _____________ | ________ |

---

**End of Document**
