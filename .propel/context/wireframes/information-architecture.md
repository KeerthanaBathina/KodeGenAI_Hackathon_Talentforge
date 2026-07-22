# Information Architecture

## Document Control

| Field | Value |
| --- | --- |
| Artifact | wireframe / information-architecture |
| Project | AI Interview Application |
| Source | FIGMA-SPEC-AI-INTERVIEW-001 v1.0 |
| Date | 2026-07-22 |
| Status | Draft |

---

## 1. Site Hierarchy

> **SCR Numbering Scheme**: Section 4.x.y maps to SCR-XYY (e.g., section 4.2.6 → SCR-206).
> Modals and sub-screens use the parent SCR with a letter suffix (e.g., SCR-103a).

```
AI Interview Application
├── PUBLIC (Unauthenticated)                                          [Spec §4.1]
│   ├── SCR-101  /                              Landing Page
│   ├── SCR-102  /register                      Candidate Registration (3-step wizard)
│   │   ├── Step 1: Contact Details
│   │   ├── Step 2: OTP Verification
│   │   └── Step 3: Consent & Onboarding
│   ├── SCR-103  /login                         Login (All Roles)
│   │   ├── SCR-103a  [modal]                   Session Timeout Warning Modal
│   │   └── SCR-103b  /login?locked=true        Account Lockout Screen
│   ├── SCR-104  /forgot-password               Forgot Password
│   └── SCR-105  /reset-password?token=xxx      Reset Password
│
├── CANDIDATE PORTAL  (Role: Applicant)                              [Spec §4.2]
│   ├── SCR-201  /candidate/dashboard           Candidate Dashboard
│   ├── SCR-202  /candidate/jobs                Job Search & Browse
│   ├── SCR-203  /candidate/jobs/:id            Job Detail Page
│   ├── SCR-204  /candidate/apply/:jobId        Application Form (4-step wizard)
│   ├── SCR-205  /candidate/applications/:id/confirmation  Application Confirmation
│   ├── SCR-206  /candidate/applications/:id    Application Timeline
│   ├── SCR-207  /candidate/assessments/:id     Assessment Console (fullscreen)
│   ├── SCR-208  /candidate/interviews/:id/confirm  Interview Confirmation
│   ├── SCR-209  /candidate/offers/:id          Offer Review
│   ├── SCR-210  /candidate/apply/:jobId?blocked=cooling_period  Application Blocked (Cooling Period)
│   ├── SCR-211  /candidate/jobs/:id?status=closed  Requisition Closed Screen
│   ├── SCR-212  /candidate/privacy             Consent & Privacy Management
│   └── SCR-213  [inline in registration]       OTP Rate Limit Screen
│
├── HR & RECRUITER  (Role: HR Reviewer, Recruiter, HR Manager, Technical Interviewer)  [Spec §4.3]
│   ├── SCR-301  /hr/dashboard                  HR Dashboard (Home)
│   ├── SCR-302  /hr/queue                      HR Review Queue
│   ├── SCR-303  /hr/candidates/:id             Candidate Detail & Decision Panel
│   ├── SCR-304  /hr/interviews/:applicationId  Interview Planner
│   ├── SCR-305  /hr/interviews/:stageId/scorecard  Scorecard Form
│   ├── SCR-306  /hr/decisions/:applicationId   Decision Workbench
│   └── SCR-307  /hr/communications/:applicationId  Communication Log
│
├── ADMIN  (Role: System Admin)                                       [Spec §4.4]
│   ├── SCR-401  /admin/dashboard               Admin Dashboard
│   ├── SCR-402  /admin/users                   User Management
│   ├── SCR-403  /admin/thresholds              Threshold Configuration
│   ├── SCR-404  /admin/audit                   Audit Log Viewer
│   ├── SCR-405  /admin/templates               Template Management
│   ├── SCR-406  /admin/business-rules          Business Rules Configuration
│   ├── SCR-407  /admin/approval-matrix         Approval Matrix Configuration
│   ├── SCR-408  /admin/ai-config               AI Model Configuration
│   └── SCR-409  /admin/health                  System Health & Monitoring
│
├── ANALYTICS  (Role: HR Manager, Recruiter, System Admin)           [Spec §4.5]
│   ├── SCR-501  /analytics/pipeline            Pipeline Analytics Dashboard
│   └── SCR-502  /analytics/ai-accuracy         AI Accuracy Dashboard
│
└── ADDITIONAL  (Role: Recruiter)                                     [Spec §4.6]
    ├── SCR-601  /hr/requisitions               Requisition Management
    └── SCR-602  /hr/interviews/:stageId/no-show  No-Show Management
```

---

## 2. Screen Count Summary

| Section | SCR Range | Screen Count | Roles |
| --- | --- | --- | --- |
| Public (Unauthenticated) §4.1 | SCR-101–105 (+103a/103b) | 7 | All / None |
| Candidate Portal §4.2 | SCR-201–213 | 13 | Applicant |
| HR & Recruiter §4.3 | SCR-301–307 | 7 | HR Reviewer, Recruiter, HR Manager, Technical Interviewer |
| Admin §4.4 | SCR-401–409 | 9 | System Admin |
| Analytics §4.5 | SCR-501–502 | 2 | HR Manager, Recruiter, System Admin |
| Additional §4.6 | SCR-601–602 | 2 | Recruiter |
| **Total** | | **40** | |

---

## 3. Access Control Matrix

| Screen | Applicant | Recruiter | HR Reviewer | Tech Interviewer | HR Manager | Admin |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| SCR-101–105 Landing / Login / Register | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| SCR-201–213 Candidate Portal (all) | ✓ | — | — | — | — | — |
| SCR-301 HR Dashboard | — | ✓ | ✓ | — | ✓ | — |
| SCR-302 HR Review Queue | — | — | ✓ | — | — | — |
| SCR-303 Candidate Detail | — | ✓ | ✓ | ✓* | ✓ | — |
| SCR-304 Interview Planner | — | ✓ | — | — | — | — |
| SCR-305 Scorecard Form | — | — | — | ✓ | — | — |
| SCR-306 Decision Workbench | — | — | — | — | ✓ | — |
| SCR-307 Communication Log | — | ✓ | — | — | — | — |
| SCR-401–409 Admin Screens (all) | — | — | — | — | — | ✓ |
| SCR-501–502 Analytics | — | ✓ | — | — | ✓ | ✓ |
| SCR-601 Requisition Management | — | ✓ | — | — | ✓ | — |
| SCR-602 No-Show Management | — | ✓ | — | — | — | — |

> *Technical Interviewers see SCR-303 in read-only mode for their assigned interviews.

---

## 4. Navigation Structure

### 4.1 Candidate Portal Navigation

```
Top Navigation Bar
├── Logo (→ /candidate/dashboard)
├── Jobs (→ /candidate/jobs)
├── My Applications (→ /candidate/dashboard)
├── Profile (→ /candidate/profile)
└── Notification Bell + Avatar Menu
    ├── Settings
    ├── Privacy (→ /candidate/privacy)
    └── Sign out
```

### 4.2 HR / Recruiter Navigation

```
Left Sidebar Navigation
├── Dashboard (→ /hr/dashboard)
├── Review Queue (→ /hr/queue)   [HR Reviewer only]
├── Requisitions (→ /hr/requisitions)
├── Candidates (→ /hr/candidates)
├── Communications (→ /hr/communications)
├── Analytics (→ /analytics/pipeline)   [HR Manager only]
└── Bottom Section
    ├── Notifications
    ├── Settings
    └── Sign out
```

### 4.3 Admin Navigation

```
Left Sidebar Navigation
├── Dashboard (→ /admin/dashboard)
├── Users (→ /admin/users)
├── Thresholds (→ /admin/thresholds)
├── Business Rules (→ /admin/business-rules)
├── Templates (→ /admin/templates)
├── Approval Matrix (→ /admin/approval-matrix)
├── Audit Log (→ /admin/audit)
└── Bottom Section
    ├── System Health (→ /admin/health)
    └── Sign out
```

---

## 5. Key Entry Points

| User Goal | Entry Point Screen | Route |
| --- | --- | --- |
| New candidate applying | SCR-101 Landing Page | `/` |
| Existing candidate checking status | SCR-201 Candidate Dashboard | `/candidate/dashboard` |
| HR Reviewer processing queue | SCR-302 HR Review Queue | `/hr/queue` |
| Recruiter scheduling interview | SCR-304 Interview Planner | `/hr/interviews/:id` |
| Technical interviewer submitting feedback | SCR-305 Scorecard Form | `/hr/interviews/:stageId/scorecard` |
| HR Manager making final decision | SCR-306 Decision Workbench | `/hr/decisions/:id` |
| Admin managing users | SCR-402 User Management | `/admin/users` |
| Admin configuring AI thresholds | SCR-403 Threshold Config | `/admin/thresholds` |
| Admin viewing AI model status | SCR-408 AI Model Config | `/admin/ai-config` |
| Admin monitoring system health | SCR-409 System Health | `/admin/health` |

---

## 6. Shared Layouts

| Layout Name | Used By | Key Regions |
| --- | --- | --- |
| `PublicLayout` | Landing, Login, Register, Forgot/Reset Password | Top nav (logo only), Content, Footer |
| `CandidateLayout` | All `/candidate/*` screens | Top nav, Content, Notification drawer |
| `InternalLayout` | All `/hr/*` screens | Left sidebar, Top bar, Content, Alert banners |
| `AdminLayout` | All `/admin/*` screens | Left sidebar (admin links), Top bar, Content |
| `FullscreenLayout` | Assessment Console only | Minimal chrome (timer bar only) |
