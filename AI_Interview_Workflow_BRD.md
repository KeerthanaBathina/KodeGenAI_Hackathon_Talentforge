# AI Interview Application
## Business Requirements Document

| Field | Value |
|---|---|
| Version | 3.0 |
| Prepared Date | 2026-07-21 |
| Document Type | Full-Stack BRD — Real-Time Production Grade |
| Source Workflow | Registration → Offer/Rejection with Fresher and Experienced Branches |
| Status | Draft for Architecture, Product, and Operations Sign-Off |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Problem and Market Opportunity](#2-business-problem-and-market-opportunity)
3. [Proposed Solution](#3-proposed-solution)
4. [Full Application Workflow](#4-full-application-workflow)
5. [Functional Requirements](#5-functional-requirements)
6. [Business Rules](#6-business-rules)
7. [UI and UX Design Philosophy](#7-ui-and-ux-design-philosophy)
8. [Technology Stack and Infrastructure](#8-technology-stack-and-infrastructure)
9. [System Architecture](#9-system-architecture)
10. [Data Model and Entities](#10-data-model-and-entities)
11. [API Design Standards](#11-api-design-standards)
12. [Security and Compliance](#12-security-and-compliance)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Integrations](#14-integrations)
15. [Communication and Notification System](#15-communication-and-notification-system)
16. [Testing Strategy](#16-testing-strategy)
17. [DevOps and Deployment Pipeline](#17-devops-and-deployment-pipeline)
18. [Roles and Access Control](#18-roles-and-access-control)
19. [Success Metrics and KPIs](#19-success-metrics-and-kpis)
20. [Risk Register](#20-risk-register)
21. [Delivery Roadmap](#21-delivery-roadmap)
22. [Open Issues and Glossary](#22-open-issues-and-glossary)

---

## 1. Executive Summary

The AI Interview Application is a production-grade, end-to-end hiring orchestration platform that standardizes the full recruitment lifecycle from candidate self-registration through to final offer or rejection. The platform replaces fragmented, manual hiring workflows with an intelligent, policy-driven engine that enforces stage sequencing, reduces recruiter overhead, and provides explainable AI-assisted candidate evaluation.

The system combines:

- **Candidate self-service flows** for registration, job discovery, resume upload, and assessment completion.
- **AI-powered screening** with explainable scoring, low-confidence human escalation, and model fallback safety.
- **Human decision gates** at every critical transition to maintain accountability while eliminating administrative bottleneck.
- **Recruiter and HR tooling** including review queues, scoring dashboards, communication management, and audit trails.
- **Immutable audit and compliance** records for every decision, transition, and communication event.

The platform is architected for real-time, production-grade deployment using a modern decoupled stack: React on Vercel, Node.js API on Railway.app, Python AI workers, PostgreSQL on Supabase, and GitHub Actions CI/CD.

---

## 2. Business Problem and Market Opportunity

### 2.1 Core Pain Points

| Problem | Business Impact |
|---|---|
| Manual resume screening at volume | Recruiters spend 3–5 hours per requisition on initial screening |
| Inconsistent interview sequencing | Fresher vs. experienced paths handled ad-hoc, causing compliance gaps |
| No-show and late-stage drop-off | High-quality candidates lost due to delayed or unclear next-step communication |
| Opaque AI scoring ("Black Box") | HR teams unable to justify AI-assisted shortlist decisions, creating legal risk |
| Fragmented communication | Offer letters, rejection mails, and reminders managed in separate tools |
| Audit gaps | Decision rationale not captured, causing compliance exposure |

### 2.2 Market Opportunity

- 72% of hiring managers report that manual screening is the top bottleneck in time-to-hire.
- AI-assisted screening with human gates reduces time-to-shortlist by up to 65% compared to fully manual processes.
- Platforms that combine scheduling, AI screening, and offer governance in a single workflow are underrepresented in the mid-market segment.

---

## 3. Proposed Solution

A modular, event-driven hiring platform with the following capability pillars:

| Pillar | Description |
|---|---|
| Candidate Experience | Self-registration, job search, resume upload, assessment portal with autosave and progress tracking |
| AI Intelligence Layer | Resume parsing, skill match scoring, explainability factors, configurable thresholds, model fallback |
| Human Governance | Mandatory HR review gates, shortlist/reject with reason codes, approval matrix for offers |
| Interview Orchestration | Experience-path routing, timezone-aware scheduling, external assessment integration, scorecard capture |
| Decision and Offer Engine | Final decision with prerequisite enforcement, compensation band approval, offer response tracking |
| Communication Hub | Tokenized templates, multi-channel delivery, retry with exponential backoff, audit log |
| DevOps and Observability | Fully automated CI/CD, structured logging, health dashboards, zero-downtime deploys |

---

## 4. Full Application Workflow

### 4.1 Workflow Diagram

```
Applicant Registration
        │
        ▼
     Login
        │
        ▼
  Apply for Job
        │
        ▼
  Upload Resume
        │
        ▼
AI Resume Screening
        │
        ▼
    HR Review
        │
        ▼
  Shortlisted?
    ┌───────────┐
No  │           │  Yes
    ▼           ▼
Rejection    Interview Process
Mail             │
                 ▼
       Experience Check
              │
    ┌─────────┴──────────┐
    │                    │
 Fresher           Experienced
    │                    │
    ▼                    ▼
Aptitude           Technical
  Test              Interview
    │                    │
    ▼                    ▼
Programming        Programming
Assessment         Assessment
    │                    │
    └─────────┬──────────┘
              ▼
       Technical Interview
              │
              ▼
           HR Round
              │
              ▼
       Final Decision
              │
    ┌─────────┴──────────┐
    │                    │
    ▼                    ▼
 Offer Mail        Rejection Mail
```

### 4.2 Workflow Step Table

| Step | Actor | Trigger | Output | SLA |
|---|---|---|---|---|
| Applicant Registration | Applicant | Opens hiring portal | Verified candidate account | Instant |
| Login | All roles | Submits credentials | Role-specific dashboard | Instant |
| Apply for Job | Applicant | Selects open requisition | Draft or submitted application | Instant |
| Upload Resume | Applicant | Application in draft or submitted state | Resume stored, parse queued | < 30 s |
| AI Resume Screening | System | Resume parsing complete | Screening score, recommendation | < 3 min |
| HR Review | HR Reviewer | AI result available | Shortlist or reject decision | 48 h SLA |
| Shortlisted Decision Branch | HR Reviewer | Review decision submitted | Workflow status updated | Instant |
| Rejection Communication | System | Not shortlisted | Communication log entry | < 5 min |
| Interview Process Initiation | Recruiter | Shortlisted candidate | Interview plan shell | 24 h SLA |
| Experience Check | Recruiter | Interview process initiated | Path assignment (fresher/experienced) | Instant |
| Fresher Path — Aptitude Test | Applicant | Path assigned as fresher | Aptitude score ingested | Per schedule |
| Experienced Path — Technical Interview | Technical Interviewer | Path assigned as experienced | Technical recommendation | Per schedule |
| Programming Assessment | Applicant | Aptitude or initial technical gate complete | Programming score | Per schedule |
| Technical Interview | Technical Interviewer | Programming score available | Technical panel recommendation | Per schedule |
| HR Round | HR Manager | Technical recommendation available | HR recommendation | 24 h SLA |
| Final Decision | HR Manager | All mandatory stages complete | Final decision record | 24 h SLA |
| Offer or Final Rejection | System and Recruiter | Final decision recorded | Candidate notified, workflow closed | < 10 min |

---

## 5. Functional Requirements

### FR-REG: Registration, Login, and Candidate Identity

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-REG-01 | System shall support candidate self-registration with email or phone OTP verification. | High | User receives verified status and can log in. |
| FR-REG-02 | System shall enforce configurable password policy (min length, complexity) and lockout thresholds. | High | After 5 failures, account lock event is logged and recovery email is sent. |
| FR-REG-03 | System shall capture and version consent for privacy and AI processing notices. | High | Consent version and timestamp appear in candidate audit timeline. |
| FR-REG-04 | System shall support role-based login for applicant, recruiter, technical interviewer, HR reviewer, HR manager, and system admin. | High | Users only see permitted navigation and permitted API resources. |
| FR-REG-05 | System shall support optional SSO for internal users via OAuth2 / OIDC. | Medium | SSO users can authenticate without a local password. |
| FR-REG-06 | System shall generate a unique candidate profile ID at registration, persisted across all subsequent actions. | High | All application events reference the canonical candidate ID. |
| FR-REG-07 | System shall display a visual onboarding checklist to first-time candidates showing pending profile steps. | Medium | Checklist items update in real time as candidate completes each step. |
| FR-REG-08 | System shall support email address verification resend with rate limiting (max 3 resends per hour). | Medium | Resend button disabled after limit; timestamp of next allowed resend displayed. |
| FR-REG-09 | Session tokens shall expire after 30 minutes of inactivity with a 5-minute warning modal. | High | Token refresh succeeds if user acts within warning window; otherwise forced logout. |
| FR-REG-10 | System shall log all authentication events (login, logout, failed attempt, lockout, SSO) to the immutable audit service. | High | Every auth event appears in the audit log with timestamp and IP. |

### FR-APP: Job Search, Application, and Resume Capture

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-APP-01 | System shall display requisitions with eligibility criteria, status, department, location, and job type. | High | Candidate can filter by department, location, and experience level; apply to open jobs only. |
| FR-APP-02 | System shall prevent duplicate applications for the same requisition within a configurable cooling period. | High | Duplicate attempt shows reason and cooling period end date. |
| FR-APP-03 | System shall accept resume uploads in PDF and DOCX formats with malware scanning before storage. | High | Upload returns accepted status; scan result stored with upload record. |
| FR-APP-04 | System shall parse resumes using AI and map extracted fields to candidate profile attributes. | High | At minimum: name, email, phone, experience years, skills, education, previous employers are mapped. |
| FR-APP-05 | System shall allow candidate edits to extracted profile before final submission. | Medium | Manual edits are audit-tracked separately from parser output; original parse is preserved. |
| FR-APP-06 | System shall auto-save application form progress every 60 seconds and on blur. | High | Progress persists across browser refreshes; candidate sees last-saved timestamp. |
| FR-APP-07 | System shall display a real-time character count and validation feedback for all text fields. | Medium | Inline validation triggers on blur; submission blocked until all required fields are valid. |
| FR-APP-08 | System shall display a progress bar and estimated completion time on the application form. | Medium | Progress bar reflects completed sections; completion time estimate is dynamic. |
| FR-APP-09 | System shall send an email confirmation with application summary within 5 minutes of submission. | High | Confirmation email includes application ID, requisition name, and next-step guidance. |
| FR-APP-10 | System shall allow candidates to withdraw an application before HR review begins. | Medium | Withdrawal creates audit entry; slot is released back to the requisition. |

### FR-AI: AI Screening and Explainability

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-AI-01 | System shall compute a match score using required skills, experience years, and role fit heuristics. | High | Score and model version are stored with timestamp on every evaluation. |
| FR-AI-02 | System shall store the top contributing positive factors and skill gaps for the HR explainability view. | High | HR reviewer sees positives, gaps, and confidence level; no black-box output. |
| FR-AI-03 | System shall flag low-confidence results (below configurable threshold) for mandatory human review. | High | Low-confidence candidates route to manual queue with flag indicator. |
| FR-AI-04 | System shall support configurable score thresholds per job family, with effective date and change author logged. | High | Threshold changes are versioned; old threshold remains on existing evaluations. |
| FR-AI-05 | System shall support model fallback mode when AI service is degraded or unavailable. | Medium | System enters fallback state, queues resumes for batch processing, notifies operations. |
| FR-AI-06 | System shall re-evaluate a candidate's screening score if a recruiter updates the job family threshold. | Medium | Re-evaluation creates a new score version; previous version is preserved with diff. |
| FR-AI-07 | System shall expose an AI confidence meter on the HR review card, colour-coded by risk band. | High | Confidence meter renders correctly at three levels: high, medium, low. |
| FR-AI-08 | System shall version all AI model outputs with model ID, version, and evaluation timestamp. | High | HR can filter candidate queue by model version for audits. |

### FR-REV: HR Review, Shortlist, and Routing

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-REV-01 | System shall provide an HR review dashboard with candidate queue, column filters, and SLA aging indicators. | High | Queue filters by requisition, stage, SLA breach status, and confidence band. |
| FR-REV-02 | System shall require a shortlist or reject decision with mandatory reason codes before state transition. | High | Decision submission is blocked without required fields. |
| FR-REV-03 | System shall trigger rejection communication automatically and immediately for candidates not shortlisted. | High | Communication event appears in timeline and audit log within 5 minutes. |
| FR-REV-04 | System shall classify shortlisted candidates as fresher or experienced based on configurable policy rules. | High | Classified path is visible and editable by authorized role with override justification. |
| FR-REV-05 | System shall support recruiter override of path classification with justification and approval workflow. | Medium | Override request captures requester, justification, and approver; all fields are audited. |
| FR-REV-06 | System shall display an SLA countdown timer on each candidate card in the HR review queue. | High | Cards approaching SLA breach are visually escalated with colour change and alert. |
| FR-REV-07 | System shall support bulk action (bulk reject with single reason code) for batch processing. | Medium | Bulk action requires confirmation dialog; each individual rejection is logged separately. |
| FR-REV-08 | System shall notify the HR reviewer by in-app alert and email when a new candidate enters their queue. | Medium | Notification delivered within 2 minutes of queue entry. |

### FR-INT: Assessments and Interviews

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-INT-01 | System shall schedule aptitude, coding, and interview stages with timezone-aware slots. | High | Candidate and panel each receive localized schedule with timezone displayed. |
| FR-INT-02 | System shall enforce the fresher path with mandatory aptitude stage completion before coding access. | High | Coding assessment link is disabled until aptitude score is ingested. |
| FR-INT-03 | System shall allow the experienced path to begin directly with a technical interview per policy. | High | Experienced candidate can proceed without aptitude; path assignment is logged. |
| FR-INT-04 | System shall ingest aptitude and coding scores from the external assessment provider via signed callback. | High | Duplicate callback does not create duplicate score rows (idempotent by callback token). |
| FR-INT-05 | System shall capture interviewer scorecards with rubric dimensions, per-dimension rating, and overall recommendation. | High | Scorecard requires all mandatory rubric dimensions before submission. |
| FR-INT-06 | System shall support no-show, reschedule, and cancellation states with reason codes. | Medium | State changes tracked with timestamp, actor, and reason; visible in candidate timeline. |
| FR-INT-07 | System shall send an automated interview reminder 24 hours and 1 hour before the scheduled slot. | High | Reminders sent via email and in-app notification; delivery status logged. |
| FR-INT-08 | System shall provide a live coding environment link for programming assessments with session timer. | High | Link generation idempotent; timer persists across reconnects within session window. |
| FR-INT-09 | System shall allow technical interviewers to view the candidate's resume and AI screening rationale during the interview. | Medium | Interviewer panel shows read-only resume, score, and top factors. |
| FR-INT-10 | System shall notify the recruiter when any interview stage is completed and scorecard is submitted. | Medium | Notification within 5 minutes of scorecard submission. |

### FR-DEC: Final Decision, Offer Governance, and Closure

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-DEC-01 | System shall permit final decision only when all mandatory stages are complete. | High | Decision button is disabled with prerequisite list shown until all gates are met. |
| FR-DEC-02 | System shall support decision outcomes: offer, reject, hold, and withdraw. | High | Outcome reflected in candidate dashboard, requisition metrics, and communication trigger. |
| FR-DEC-03 | System shall enforce an approval matrix for offer release based on compensation band thresholds. | High | Offer cannot be dispatched without all required approver sign-offs. |
| FR-DEC-04 | System shall produce an auditable decision summary including stage scores and rationale. | High | Summary export available as PDF from recruiter console. |
| FR-DEC-05 | System shall support candidate offer response tracking with automated reminders for pending responses. | Medium | Reminder jobs run until candidate responds or offer expiry date is reached. |
| FR-DEC-06 | System shall record the final offer or rejection communication with template version, delivery status, and timestamp. | High | Communication log entry linked to decision record in audit trail. |
| FR-DEC-07 | System shall close the requisition slot automatically when an offer is accepted. | High | Slot count decrements on acceptance; requisition status updates if all slots are filled. |
| FR-DEC-08 | System shall support offer letter generation with dynamic tokens populated from candidate and decision records. | High | Generated letter matches approved template; token substitution failures block send. |

### FR-COM: Communication and Notification System

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-COM-01 | System shall provide tokenized email templates for offer, rejection, interview invite, aptitude invite, and reminders. | High | Template preview renders correctly with sample data before send. |
| FR-COM-02 | System shall log all outbound communications with provider, delivery status, and timestamp. | High | Delivery, bounce, open, and retry statuses are visible in the communication log. |
| FR-COM-03 | System shall retry transient notification failures with exponential backoff (max 5 attempts). | High | Retries stop after maximum attempts and create a recruiter task for manual follow-up. |
| FR-COM-04 | System shall support multi-channel in-app alerts for internal users for SLA and critical events. | Medium | Recruiter receives both in-app notification badge and email for critical SLA events. |
| FR-COM-05 | System shall support localization-ready template content with locale and fallback locale. | Low | Template model includes locale field; render falls back to English if locale is missing. |
| FR-COM-06 | System shall provide a notification preference centre for candidates (email, SMS opt-in or opt-out). | Medium | Preference changes take effect immediately; opt-out is honoured within 1 send cycle. |

### FR-ADMIN: Administration and Configuration

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-ADM-01 | System shall provide an admin panel to manage users, roles, and permissions. | High | Admin can create, deactivate, and assign roles; changes take effect on next login. |
| FR-ADM-02 | System shall allow admin to manage job requisitions, job families, and stage policy configuration. | High | Policy changes are versioned with effective date; in-flight applications use previous version. |
| FR-ADM-03 | System shall provide a configurable scoring threshold editor per job family with audit trail. | High | Threshold changes logged with author, timestamp, and old and new values. |
| FR-ADM-04 | System shall provide an audit log viewer with search, filter, date range, and export. | High | All decision and communication events are searchable; export produces CSV within 30 seconds. |
| FR-ADM-05 | System shall provide a platform health dashboard showing queue depth, AI service status, and email delivery rate. | Medium | Dashboard refreshes every 60 seconds; alerts shown for any degraded service. |
| FR-ADM-06 | System shall support bulk import of requisitions from CSV with validation and error report. | Medium | Import validates required fields; rows with errors are rejected and listed in error report. |

### FR-ANALYTICS: Reporting and Insights

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| FR-ANA-01 | System shall provide a recruiter dashboard with pipeline metrics: applications, shortlist rate, and time-to-hire. | High | Metrics update in near real time (< 5 minute lag). |
| FR-ANA-02 | System shall provide stage conversion funnel charts for each requisition. | Medium | Funnel shows drop-off at each stage; exportable as image or CSV. |
| FR-ANA-03 | System shall provide AI accuracy tracking showing human-AI agreement rate per model version. | High | Agreement rate calculated on HR review decisions vs. AI recommendation. |
| FR-ANA-04 | System shall surface no-show and cancellation rates by stage and requisition. | Medium | Rate displayed on planner view; trend line covers last 30 days. |
| FR-ANA-05 | System shall generate a weekly hiring digest email for HR managers with key metrics. | Low | Digest generated every Monday 08:00 local; can be toggled in notification preferences. |

---

## 6. Business Rules

| Rule ID | Condition | Action |
|---|---|---|
| BR-01 | Resume is missing or scan failed | Block AI screening; prompt candidate to re-upload |
| BR-02 | AI confidence score is below threshold | Force mandatory HR manual review; cannot auto-advance |
| BR-03 | Duplicate application within cooling period | Block submission; show cooling period end date |
| BR-04 | Candidate classified as fresher | Aptitude test must be completed before coding assessment link is active |
| BR-05 | Candidate classified as experienced | Can proceed directly to technical interview; aptitude is optional |
| BR-06 | Any mandatory stage is incomplete | Final decision button remains disabled; missing stages listed |
| BR-07 | Compensation band exceeds tier threshold | Require additional approver from finance or executive chain |
| BR-08 | OTP verification fails 5 times in 15 minutes | Lock account; send recovery email; log lockout event |
| BR-09 | Interview no-show recorded | Candidate flagged; recruiter prompted to reschedule or close |
| BR-10 | Email delivery bounce after max retries | Create open recruiter task; candidate status shown as communication-failed |
| BR-11 | Shortlist override requested | Requires second approver at recruiter-manager level; captured in audit |
| BR-12 | Offer response deadline passes without response | Auto-expire offer; notify HR manager; record outcome as no-response |
| BR-13 | Candidate withdraws application | Release slot; close workflow; send acknowledgement |
| BR-14 | Admin changes scoring threshold | Old threshold frozen on existing evaluations; new threshold applies to new submits only |
| BR-15 | Data deletion request received | Anonymize PII with legal retention of decision records per compliance period |
| BR-16 | AI service degraded | Enter fallback mode; queue resumes; notify operations; block new auto-advances |
| BR-17 | Requisition is closed | Block new applications; candidates in pipeline proceed to completion |
| BR-18 | Offer accepted | Decrement requisition slot; close other open applications for same requisition if seats full |

---

## 7. UI and UX Design Philosophy

### 7.1 Design Theme — "Signal and Speed"

The platform's visual identity is built on clarity, momentum, and intelligent density. Every screen communicates status instantly, surfaces the next action without hunting, and rewards decision-makers with a fast, friction-free experience.

**Core Design Principles:**

| Principle | Implementation |
|---|---|
| Decision-first layout | The primary CTA and decision controls are always above the fold with no scrolling required |
| Progressive disclosure | Detail panels expand on demand; default views show only action-relevant data |
| Status always visible | Every screen renders the candidate's current stage, SLA countdown, and pending actions |
| Dark and light mode | Full theme support via CSS custom properties; default dark for internal dashboards |
| Motion with purpose | Transitions are fast (120–200 ms), directional (left-right for stage progression), and skippable |
| Accessible by default | WCAG 2.2 AA conformance; keyboard navigation; screen reader semantics |

### 7.2 Visual Design System

**Typography:**

| Role | Font | Weight | Size |
|---|---|---|---|
| Display / Hero | Clash Display | 700 | 2rem–3.5rem |
| Section Heading | Plus Jakarta Sans | 700 | 1.25rem–1.5rem |
| Body | Inter | 400/500 | 0.875rem–1rem |
| Monospaced (IDs, code, refs) | JetBrains Mono | 400 | 0.75rem–0.875rem |

**Color Palette:**

| Token | Light Mode | Dark Mode | Usage |
|---|---|---|---|
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
|---|---|
| `--radius-sm` | `6px` |
| `--radius-md` | `10px` |
| `--radius-lg` | `16px` |
| `--radius-pill` | `9999px` |
| `--shadow-card` | `0 1px 4px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)` |
| `--shadow-modal` | `0 8px 32px rgba(0,0,0,.18)` |
| `--motion-fast` | `120ms cubic-bezier(0.2,0,0.2,1)` |
| `--motion-medium` | `200ms cubic-bezier(0.2,0,0.2,1)` |

### 7.3 Key Screen UX Patterns

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

### 7.4 Accessibility Standards

- WCAG 2.2 AA contrast compliance for all text and UI controls
- Full keyboard navigation with visible focus indicators
- ARIA live regions for status updates and error messages
- Color is never the sole conveyor of status (always paired with icon or label)
- Skip navigation link at page top for screen reader users
- Form fields with persistent labels and accessible error descriptions

---

## 8. Technology Stack and Infrastructure

### 8.1 Stack Summary

| Layer | Technology | Hosting | Purpose |
|---|---|---|---|
| Frontend | React 18 + TypeScript + Vite | Vercel | Candidate and recruiter-facing web application |
| Backend API | Node.js 20 + Express / Fastify + TypeScript | Railway.app | Core REST API, workflow orchestration, WebSocket server |
| AI Worker | Python 3.11 + FastAPI + spaCy / Transformers | Railway.app | Resume parsing, AI screening, model management |
| Database | PostgreSQL 15 | Supabase | Primary relational data store |
| Cache | Upstash Redis | Upstash (serverless) | Session cache, queue state, rate limiting, pub/sub |
| Object Storage | Supabase Storage | Supabase | Resume files, generated PDFs, offer letters |
| Job Queue | BullMQ over Upstash Redis | Railway.app | Background jobs: email, AI processing, reminders |
| Email | Resend | Managed | Transactional email with webhook status callbacks |
| Auth | Supabase Auth | Supabase | JWT issuance, OTP, OAuth2/SSO, RBAC claims |
| CI/CD | GitHub Actions | GitHub | Build, test, deploy pipeline |
| Monitoring | OpenTelemetry + Grafana Cloud (free tier) | Grafana Cloud | Distributed tracing, metrics, structured logging |

### 8.2 Frontend Architecture (React + Vite on Vercel)

```
src/
├── app/                   # App shell, routing, providers
│   ├── router.tsx          # React Router v6 route definitions
│   └── providers.tsx       # Auth, theme, query providers
├── features/               # Feature-sliced modules
│   ├── auth/               # Login, register, OTP, SSO
│   ├── jobs/               # Job search, apply, eligibility
│   ├── resume/             # Upload, parse preview, profile edit
│   ├── assessment/         # Assessment console, timer, navigator
│   ├── hr-queue/           # HR review queue, decision panel
│   ├── interview/          # Planner, scorecard, schedule
│   ├── decision/           # Decision workbench, approval chain
│   ├── communications/     # Template picker, channel status
│   ├── timeline/           # Candidate timeline view
│   └── admin/              # Policy, thresholds, templates, users
├── shared/
│   ├── ui/                 # Design system components
│   ├── hooks/              # Custom React hooks
│   ├── api/                # API client (React Query + Axios)
│   ├── store/              # Zustand global state
│   └── utils/              # Helpers, formatters, validators
└── styles/
    ├── tokens.css           # Design tokens (CSS custom properties)
    └── global.css           # Reset and base styles
```

**Key Libraries:**

| Library | Purpose |
|---|---|
| React Query (TanStack Query) | Server state, caching, invalidation, background refetch |
| Zustand | Lightweight client-side global state |
| React Hook Form + Zod | Form state and schema validation |
| Framer Motion | Animation and gesture system |
| Recharts | Pipeline funnel, confidence charts, analytics |
| Socket.IO Client | Real-time queue updates from the Node.js WS server |
| date-fns | Timezone-aware date formatting |
| @tanstack/react-table | Virtualized, sortable, filterable data tables |

### 8.3 Backend Architecture (Node.js on Railway.app)

```
src/
├── api/
│   ├── routes/             # Express route definitions by module
│   ├── middleware/         # Auth guard, rate limiter, error handler
│   └── validators/         # Zod request schemas
├── services/               # Business logic layer
├── repositories/           # Database access layer (Prisma ORM)
├── workers/                # BullMQ job definitions
│   ├── email.worker.ts
│   ├── ai-screening.worker.ts
│   └── reminder.worker.ts
├── events/                 # Domain event emitters and handlers
├── websocket/              # Socket.IO server and room management
└── infrastructure/
    ├── db.ts               # Prisma client singleton
    ├── redis.ts            # Upstash Redis client
    ├── storage.ts          # Supabase Storage client
    └── logger.ts           # Pino structured logger
```

**ORM:** Prisma with PostgreSQL (Supabase connection string via pooled proxy)

**Authentication:** Supabase Auth JWTs verified in Node.js middleware; RBAC claims extracted from JWT payload.

### 8.4 AI Worker Architecture (Python on Railway.app)

```
app/
├── api/
│   ├── routes/
│   │   ├── parse.py        # Resume parse endpoint
│   │   └── screen.py       # Screening score endpoint
│   └── schemas.py          # Pydantic request/response models
├── services/
│   ├── parser_service.py   # PDF/DOCX text extraction
│   ├── nlp_service.py      # spaCy NER for skill and entity extraction
│   ├── scorer_service.py   # Match scoring logic
│   └── explainer_service.py # Factor extraction for HR view
├── models/
│   ├── registry.py         # Model version registry
│   └── fallback.py         # Rule-based fallback scorer
└── core/
    ├── config.py           # Environment config (Pydantic Settings)
    └── health.py           # Health check endpoint
```

**AI Stack:**
- `spaCy` + custom NER models for skill and entity extraction
- `sentence-transformers` for semantic similarity scoring
- `pdfplumber` + `python-docx` for document text extraction
- Versioned model outputs stored in PostgreSQL alongside every evaluation

---

## 9. System Architecture

### 9.1 Component Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        Vercel CDN                            │
│                   React SPA (TypeScript)                      │
│         Candidate Portal │ Recruiter │ HR │ Admin            │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTPS / WSS
          ┌───────────────┼───────────────────────┐
          ▼               ▼                       ▼
┌─────────────────┐ ┌──────────────┐   ┌──────────────────────┐
│  Node.js API    │ │  WebSocket   │   │   Python AI Worker   │
│  (Railway.app)  │ │  Server      │   │   (Railway.app)      │
│                 │ │  Socket.IO   │   │   FastAPI + spaCy    │
│  REST API       │ └──────────────┘   └──────────┬───────────┘
│  BullMQ Workers │                               │
└────────┬────────┘                               │
         │                              ┌─────────┘
         ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase                                │
│   ┌────────────┐   ┌───────────────┐   ┌─────────────────┐  │
│   │ PostgreSQL │   │  Auth (JWT)   │   │  Object Storage │  │
│   │ (Prisma)   │   │  OTP, SSO     │   │  Resumes, PDFs  │  │
│   └────────────┘   └───────────────┘   └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                     Upstash Redis                            │
│   Session Cache │ BullMQ Queues │ Rate Limit │ Pub/Sub      │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│              External Services                │
│  Resend (Email) │ External Assessment API     │
│  Google/GitHub OAuth │ Grafana Monitoring     │
└──────────────────────────────────────────────┘
```

### 9.2 Key Architectural Patterns

| Pattern | Application |
|---|---|
| Event-driven async | Resume parsing, AI screening, and email delivery run as async BullMQ jobs |
| Deterministic state guards | Stage transitions enforced server-side; client CTA reflects real guard state |
| Optimistic UI updates | Shortlist and reject decisions update client immediately; server confirms asynchronously |
| Idempotent callbacks | Assessment score ingestion uses callback token to prevent duplicate rows |
| Append-only audit log | Audit service uses INSERT-only table; no UPDATE or DELETE permitted |
| Retry with exponential backoff | Email and AI jobs: retry intervals 30 s → 2 min → 8 min → 32 min → max-attempts fail |
| Row-level security | Supabase RLS policies restrict data access to role-appropriate rows |
| WebSocket rooms | Each recruiter subscribes to their requisition's room for real-time queue updates |

---

## 10. Data Model and Entities

### 10.1 Core Entities

| Entity | Key Attributes |
|---|---|
| `candidates` | id, email, phone, password_hash, verified_at, consent_version, status, created_at |
| `profiles` | id, candidate_id, full_name, experience_years, skills[], education[], raw_parse_json |
| `requisitions` | id, title, department, job_family, location, type, slots, status, opened_at, closed_at |
| `applications` | id, candidate_id, requisition_id, status, path (fresher/experienced), submitted_at |
| `resumes` | id, application_id, storage_key, scan_status, mime_type, uploaded_at |
| `screenings` | id, application_id, model_version, score, confidence, factors_json, evaluated_at |
| `hr_reviews` | id, application_id, reviewer_id, decision, reason_code, notes, decided_at |
| `interview_plans` | id, application_id, recruiter_id, stages[], created_at |
| `assessments` | id, application_id, type (aptitude/coding), provider_ref, score, completed_at |
| `scorecards` | id, application_id, interviewer_id, stage, rubric_json, recommendation, submitted_at |
| `hr_rounds` | id, application_id, manager_id, policy_checks_json, comp_band_ok, recommendation, submitted_at |
| `decisions` | id, application_id, manager_id, outcome (offer/reject/hold/withdraw), reason_code, decided_at |
| `approvals` | id, decision_id, approver_id, status, responded_at |
| `communications` | id, application_id, template_id, channel, status, provider_message_id, sent_at |
| `audit_events` | id, actor_id, actor_role, event_type, entity_type, entity_id, payload_json, created_at |
| `notification_prefs` | id, user_id, email_opt_in, sms_opt_in, in_app_opt_in |
| `scoring_thresholds` | id, job_family, auto_advance_pct, auto_reject_pct, author_id, effective_date |
| `templates` | id, name, type, subject, body_html, locale, version, created_at |

### 10.2 Key Relationships

```
candidates  1──*  applications  1──1  resumes
                              1──1  screenings
                              1──1  hr_reviews
                              1──1  interview_plans ──1──*  assessments
                                                    ──1──*  scorecards
                              1──1  hr_rounds
                              1──1  decisions ──1──*  approvals
                              1──*  communications
                              1──*  audit_events
```

---

## 11. API Design Standards

### 11.1 REST Conventions

- Base URL: `https://api.aiinterview.app/v1`
- Authentication: Bearer JWT in `Authorization` header
- Content-Type: `application/json`
- Error response shape: `{ "error": { "code": string, "message": string, "details"?: object } }`
- Pagination: cursor-based using `?after=<cursor>&limit=<n>` (max limit 100)
- All timestamps in ISO 8601 UTC

### 11.2 Key Endpoint Groups

| Group | Base Path | Purpose |
|---|---|---|
| Auth | `/auth` | Register, login, OTP verify, refresh, logout |
| Candidates | `/candidates` | Profile management, consent, preferences |
| Jobs | `/jobs` | Requisition listing, search, eligibility check |
| Applications | `/applications` | Submit, withdraw, status |
| Resumes | `/resumes` | Upload, parse status, profile update |
| Screening | `/screening` | Score retrieval, threshold configuration |
| Reviews | `/reviews` | HR queue, shortlist, reject, override |
| Interviews | `/interviews` | Schedule, scorecard, no-show, reschedule |
| Decisions | `/decisions` | Final decision, approval chain, offer letter |
| Communications | `/communications` | Send, status, retry, template preview |
| Audit | `/audit` | Event log search, export |
| Admin | `/admin` | Users, roles, thresholds, requisitions |
| Analytics | `/analytics` | Pipeline metrics, funnel, AI accuracy |
| Health | `/health` | Liveness and readiness probes |

### 11.3 WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `queue:candidate-added` | Server → Client | `{ applicationId, candidateName, score, slaDeadline }` |
| `queue:status-changed` | Server → Client | `{ applicationId, oldStatus, newStatus }` |
| `notification:new` | Server → Client | `{ type, title, body, link }` |
| `screening:complete` | Server → Client | `{ applicationId, score, confidence }` |

---

## 12. Security and Compliance

### 12.1 Authentication and Authorization

| Control | Implementation |
|---|---|
| Authentication | Supabase Auth with JWT; refresh token rotation on every use |
| Password policy | Min 10 chars, 1 uppercase, 1 number, 1 special; configurable via admin panel |
| Account lockout | 5 failed attempts → 15-minute lockout → recovery email |
| Multi-factor authentication | OTP via email or TOTP (Google Authenticator) for internal users |
| RBAC | JWT claims carry role; server-side guard on every protected endpoint |
| Row-level security | Supabase RLS ensures candidates can only read their own records |
| API rate limiting | Upstash Redis rate limiter: 100 req/min per IP for public; 1000 req/min per authenticated user |

### 12.2 Data Protection

| Control | Implementation |
|---|---|
| Encryption at rest | Supabase PostgreSQL AES-256 at rest; storage files encrypted at rest |
| Encryption in transit | TLS 1.3 enforced on all endpoints |
| PII handling | Names, emails, phone numbers stored in dedicated PII columns; masked in logs |
| Data retention | Decision and audit records retained for 7 years; PII anonymized after deletion request within 30 days |
| GDPR / data deletion | Anonymization job triggered by deletion request; legal hold applied to decision records |
| Secret management | Environment variables via Railway.app and Vercel secret stores; never committed to repository |

### 12.3 OWASP Top 10 Controls

| Risk | Mitigation |
|---|---|
| Broken Access Control | RBAC on every API route; Supabase RLS at database layer |
| Injection | Parameterised queries via Prisma ORM; Zod input validation on all request bodies |
| Cryptographic Failures | TLS 1.3; bcrypt password hashing (cost factor 12); AES-256 at rest |
| Insecure Design | Threat model reviewed; stage guards are server-enforced, not client-enforced |
| Security Misconfiguration | CORS whitelist; security headers (CSP, HSTS, X-Frame-Options) via middleware |
| Vulnerable Components | Dependabot automated dependency updates; weekly vulnerability scan in CI |
| Auth Failures | JWT expiry, rotation, and revocation; brute-force lockout |
| Integrity Failures | Signed callbacks for assessment ingestion; content hashing for resume uploads |
| Logging Failures | Structured Pino logs; audit service immutable; OpenTelemetry traces |
| SSRF | Allowlist-only external HTTP calls; no user-controlled URL parameters in server requests |

### 12.4 Audit Logging

All of the following event types are written to the immutable `audit_events` table with actor, timestamp, and full payload JSON:

- Authentication events (login, logout, lockout, SSO)
- Application state transitions
- HR review decisions and reason codes
- Path classification and overrides
- Scorecard submissions
- Final decision and approval chain events
- Offer dispatch and response
- Communication send and failure events
- Threshold and policy configuration changes
- User and role management actions
- Data deletion and anonymization requests

---

## 13. Non-Functional Requirements

| Category | Target | Measurement |
|---|---|---|
| API Latency | P95 < 2 s on core CRUD APIs | Grafana APM percentile trace |
| AI Processing | Resume parse + score < 3 minutes from upload | Job completion timestamp delta |
| Availability | 99.9% monthly uptime | Uptime monitoring via Railway health checks |
| Throughput | Sustain 200 concurrent active sessions | Load tested with k6 before each major release |
| Audit Completeness | 100% decision path traceability | Automated audit coverage test in CI |
| Security | Zero critical OWASP findings at release | OWASP ZAP scan result in CI pipeline |
| Recovery (RPO) | ≤ 15 minutes | Supabase point-in-time recovery validation |
| Recovery (RTO) | ≤ 2 hours | Documented runbook validated in quarterly DR drill |
| Accessibility | WCAG 2.2 AA | Automated axe-core scan + manual audit |
| Bundle Size | Initial load < 200 KB gzipped | Vite bundle analysis in CI |
| Time to Interactive | < 2 s on 4G / mid-range device | Lighthouse CI score ≥ 90 |

---

## 14. Integrations

| Integration | Purpose | Method | Constraint |
|---|---|---|---|
| Supabase Auth | JWT issuance, OTP, OAuth2 | Supabase JS SDK | Free tier; edge function JWT verification |
| Supabase Storage | Resume and PDF storage | Supabase JS SDK | Files scanned before access URL issued |
| Resend | Transactional email | REST API + webhook | Webhook for delivery status callbacks |
| External Assessment Provider | Aptitude and coding test launch and score ingest | REST launch + signed HMAC callback | Idempotent callback by token |
| Google / GitHub OAuth | SSO for internal users | OAuth2 Authorization Code flow | Restricted to verified domain |
| Grafana Cloud | Distributed tracing, metrics, logs | OpenTelemetry SDK | Free tier (14-day trace retention) |
| GitHub Actions | CI/CD pipeline | YAML workflow | Deploy on push to main after all checks pass |

---

## 15. Communication and Notification System

### 15.1 Templates

| Template | Trigger | Key Tokens |
|---|---|---|
| Registration Welcome | Account verified | `{{candidate.firstName}}`, `{{verificationDate}}` |
| Application Confirmation | Application submitted | `{{jobTitle}}`, `{{applicationId}}`, `{{nextStep}}` |
| Screening Complete | AI score available | `{{jobTitle}}`, `{{status}}` |
| Rejection Notification | HR decision: reject | `{{candidate.firstName}}`, `{{jobTitle}}`, `{{feedbackNote}}` |
| Shortlist Notification | HR decision: shortlist | `{{candidate.firstName}}`, `{{jobTitle}}`, `{{nextStep}}` |
| Aptitude Invite | Fresher path assigned | `{{assessmentLink}}`, `{{deadline}}`, `{{duration}}` |
| Technical Interview Invite | Stage scheduled | `{{interviewDate}}`, `{{interviewerName}}`, `{{zoomLink}}` |
| Interview Reminder | 24 h and 1 h before slot | `{{interviewDate}}`, `{{interviewTime}}`, `{{timezone}}` |
| Offer Letter | Decision: offer | `{{candidate.firstName}}`, `{{jobTitle}}`, `{{salary}}`, `{{startDate}}`, `{{offerDeadline}}` |
| Final Rejection | Decision: reject | `{{candidate.firstName}}`, `{{jobTitle}}`, `{{closingNote}}` |
| Offer Reminder | Pending response | `{{offerDeadline}}`, `{{recruiterContact}}` |

### 15.2 Delivery and Retry Flow

```
Event triggered
     │
     ▼
Template resolved + tokens substituted
     │
     ▼
Job enqueued in BullMQ email queue
     │
     ▼
Resend API call
     │
  ┌──┴──┐
  │     │
 OK   Error (transient)
  │     │
  │     ▼
  │  Exponential backoff retry
  │  (30s → 2min → 8min → 32min → 128min)
  │     │
  │   Max attempts reached?
  │     │ Yes
  │     ▼
  │  Create recruiter task
  │  Mark communication: failed
  │
  ▼
Log delivery status to communications table
Emit WebSocket event to recruiter dashboard
```

---

## 16. Testing Strategy

| Type | Scope | Tool | Owner | Gate |
|---|---|---|---|---|
| Unit | Business rules, stage guards, validators, AI scorer | Vitest (FE), Jest (BE), pytest (Python) | Engineering | PR merge block |
| Integration | API endpoints, DB queries, job queue, Supabase Auth | Supertest + test DB | Engineering QA | PR merge block |
| E2E | Both candidate branches, edge states, communication flows | Playwright + TypeScript | QA and Product | Pre-release gate |
| Accessibility | WCAG 2.2 AA, keyboard nav, ARIA | axe-core in Playwright | QA | Pre-release gate |
| Performance | Load testing core APIs at 200 concurrent sessions | k6 | Engineering | Major release gate |
| Security | OWASP Top 10, auth bypass, injection | OWASP ZAP (CI-integrated) | Security QA | Release gate |
| Visual regression | UI component and screen snapshot comparison | Playwright + Percy | QA | PR merge (FE) |
| UAT | Operational readiness, hiring manager usability | Manual test scripts | HR Ops | Go-live sign-off |
| Contract | AI worker API contract between Node.js and Python | Pact | Engineering | PR merge block |

### 16.1 Playwright E2E Coverage Targets

| Scenario | Priority |
|---|---|
| Complete fresher candidate journey: registration → offer | Critical |
| Complete experienced candidate journey: registration → offer | Critical |
| HR review: shortlist with reason code | Critical |
| HR review: bulk reject | High |
| Assessment: no-show, reschedule | High |
| Offer approval chain: single and multi-approver | Critical |
| Communication: email bounce → recruiter task creation | High |
| AI fallback mode: queue accumulation and recovery | Medium |
| Admin: threshold change + re-evaluation trigger | Medium |

---

## 17. DevOps and Deployment Pipeline

### 17.1 GitHub Actions Pipeline

```yaml
# Triggered on: push to main, PR to main

Stages:
1. Lint and Type Check
   - ESLint + Prettier (frontend)
   - TypeScript tsc --noEmit (frontend + backend)
   - Ruff + mypy (Python AI worker)

2. Unit and Integration Tests
   - Frontend: Vitest
   - Backend: Jest + Supertest (test Supabase instance)
   - AI Worker: pytest

3. Security Scan
   - npm audit (frontend + backend)
   - pip-audit (Python)
   - OWASP ZAP baseline scan (on staging URL)

4. Build
   - Vite build (frontend) → artifact
   - tsc build (backend) → artifact

5. E2E Tests
   - Playwright suite against staging environment

6. Visual Regression (PR only)
   - Percy snapshot comparison

7. Deploy
   - Frontend → Vercel (via Vercel GitHub integration)
   - Backend → Railway.app (via Railway GitHub integration)
   - AI Worker → Railway.app (separate service)

8. Post-Deploy Health Check
   - Ping /health endpoints
   - Smoke test: registration + job search
   - Alert on failure → rollback trigger
```

### 17.2 Environment Strategy

| Environment | Frontend | Backend | Database | Purpose |
|---|---|---|---|---|
| Development | `localhost:5173` | `localhost:3000` | Supabase project (dev) | Local development |
| Staging | Vercel preview URL | Railway staging service | Supabase project (staging) | PR previews and E2E |
| Production | `app.aiinterview.app` | `api.aiinterview.app` | Supabase project (prod) | Live traffic |

### 17.3 Zero-Downtime Deploys

- **Frontend:** Vercel atomic deployments with instant rollback.
- **Backend:** Railway rolling deploys with health check grace period (30 s) before traffic cut.
- **Database migrations:** Prisma migrate with additive-only schema changes in Phase 1; breaking migrations require maintenance window with announcement.

---

## 18. Roles and Access Control

| Role | Core Responsibilities | Key Permissions |
|---|---|---|
| Applicant | Register, apply, upload resume, complete assessments | Own profile, own applications, own assessments |
| Recruiter | Manage funnel, initiate interview plans, manage communications, override routing | All applications for assigned requisitions; communication send |
| HR Reviewer | Validate AI screening output, shortlist or reject decisions | HR review queue; read-only AI score; shortlist/reject action |
| Technical Interviewer | Run technical interviews, submit scorecards | Assigned interview read; scorecard write |
| HR Manager | Conduct HR round, finalize decision, approve offers | HR round write; final decision; approval chain |
| System Admin | User management, role assignment, policy configuration, integration health | Full admin panel; audit log read; threshold write |

### 18.1 Permission Matrix

| Action | Applicant | Recruiter | HR Reviewer | Tech Interviewer | HR Manager | Admin |
|---|---|---|---|---|---|---|
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

## 19. Success Metrics and KPIs

| KPI | Baseline Target | Measurement |
|---|---|---|
| Time-to-shortlist (days) | < 3 days from application | Application submitted_at → HR decision decided_at |
| Time-to-offer (days) | < 21 days from application | Application submitted_at → Decision decided_at (offer) |
| HR review completion rate | > 95% within SLA (48 h) | % of reviews decided before SLA deadline |
| AI-Human agreement rate | > 90% | % of AI recommendations confirmed by HR reviewer |
| No-show rate (interview) | < 10% | No-show events / scheduled interviews |
| Offer acceptance rate | > 75% | Accepted responses / offers dispatched |
| Candidate drop-off rate | < 15% per stage | Applications abandoned / applications started by stage |
| Email delivery rate | > 98% | Delivered / sent per communication type |
| P95 API latency | < 2 s | OpenTelemetry trace percentile |
| System uptime | > 99.9% | Monthly calculated from health check monitoring |
| Critical conflicts identified | Tracked and increasing | Overrides, low-confidence escalations, stage-guard blocks |

---

## 20. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| AI misclassification of candidate | Medium | High | Human review gate; low-confidence escalation; model versioning and rollback |
| Assessment provider API outage | Medium | High | Retry queue; manual score entry fallback via admin panel |
| Email provider outage (Resend) | Low | Medium | Retry with backoff; recruiter task fallback; secondary provider in Phase 2 |
| Railway.app service interruption | Low | High | Health check auto-restart; DR runbook; Supabase data safe independently |
| Supabase free tier limits | Medium | Medium | Monitor usage; upgrade plan at usage threshold; connection pooling via pgBouncer |
| Data breach or unauthorised access | Low | Critical | RBAC + RLS; encrypted PII; audit alerts; incident response playbook |
| Candidate PII mishandled | Low | Critical | Automated PII masking in logs; GDPR deletion flow; quarterly access review |
| SLA breaches on review queue | Medium | Medium | Escalation dashboards; in-app alerts; queue balancing rules |
| Playwright E2E flakiness in CI | High | Low | Retry on failure (max 2); isolate flaky tests to separate suite |
| Poor candidate UX causing drop-off | Medium | Medium | Autosave; progress indicators; usability testing before each release |

---

## 21. Delivery Roadmap

| Milestone | Scope | Outcome |
|---|---|---|
| M1 — Identity and Application | Registration, Login, SSO, Apply, Resume Upload, Parse | Candidate can register and submit an application with resume |
| M2 — AI Screening and HR Review | AI scoring, explainability, HR review queue, shortlist/reject, path classification | Recruiters can review and shortlist or reject candidates |
| M3 — Interview Orchestration | Experience routing, aptitude, programming assessment, technical interview, scorecard | Full interview pipeline with both fresher and experienced paths |
| M4 — Decision and Offer Governance | HR Round, final decision, approval chain, offer letter, response tracking | End-to-end from decision to offer dispatch with audit |
| M5 — Communications and Notifications | Full template system, multi-channel delivery, retry, preference centre | All outbound communications automated and audited |
| M6 — Analytics, Admin, and Go-Live | Pipeline metrics, admin panel, threshold editor, audit viewer, load testing, security scan | Production-ready with full observability and compliance |

---

## 22. Open Issues and Glossary

### 22.1 Open Issues

| Issue | Owner | Target Resolution |
|---|---|---|
| Fresher vs. experienced classification policy: define exact experience year threshold | HR Operations | M2 |
| Compensation band tiers: define band boundaries and approval matrix levels | Finance + HR | M4 |
| Assessment provider selection: vendor evaluation for aptitude and coding tests | Engineering + Procurement | M1 |
| Offer letter legal review: template language approved by legal counsel | Legal | M4 |
| Localization scope: which locales are required at go-live | Product | M5 |
| Analytics data warehouse: evaluate whether Grafana or dedicated BI tool needed post-launch | Engineering | M6 |

### 22.2 Glossary

| Term | Definition |
|---|---|
| ATS | Applicant Tracking System — the broader category of software this platform partially replaces |
| RBAC | Role-Based Access Control — permission model where access rights are assigned to roles |
| RLS | Row-Level Security — PostgreSQL / Supabase feature restricting row access by policy |
| JWT | JSON Web Token — signed token used for stateless authentication and claims |
| SLA | Service Level Agreement — the agreed time window within which a stage action must be completed |
| RPO | Recovery Point Objective — maximum acceptable data loss measured in time |
| RTO | Recovery Time Objective — maximum acceptable system downtime after an incident |
| Idempotent | An operation that produces the same result when executed multiple times |
| BullMQ | Redis-backed job queue library for Node.js used for background processing |
| Fresher Path | Hiring track for candidates with limited experience: Aptitude → Programming → Technical |
| Experienced Path | Hiring track for experienced candidates: Technical Interview → Programming → Technical |
| Confidence Band | Categorical classification of AI score reliability: High (>80%), Medium (50–80%), Low (<50%) |
| Stage Guard | Server-side rule that prevents a state transition until all preconditions are met |
| Approval Matrix | Configuration defining which approvers are required based on compensation band level |
| Tokenized Template | Email template with placeholder tokens (e.g., `{{candidate.firstName}}`) resolved at send time |
| Fallback Mode | Degraded-service state when AI worker is unavailable; resumes queue for batch processing |
| Audit Event | Immutable record of every meaningful system or user action, written to an append-only log |
| Canonical ID | The single, permanent identifier for an entity that persists across all systems and stages |

---

*Document prepared by the PropelIQ Platform Team. All requirements are subject to sign-off by architecture, product, and operations leads before implementation begins.*
