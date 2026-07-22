# AI Interview Application — Functional Specification

## Document Control

| Field | Value |
| --- | --- |
| Document ID | SPEC-AI-INTERVIEW-001 |
| Version | 1.0 |
| Date | 2026-07-21 |
| Source Input | AI_Interview_Workflow_BRD.md v3.0 |
| Status | Draft for product, architecture, and QA sign-off |

---

## 1. Purpose and Scope

This specification translates the AI Interview Application BRD v3.0 into numbered, testable functional requirements and formal use cases covering the complete hiring lifecycle: candidate self-registration through final offer or rejection. It serves as the authoritative input for architecture design, UI wireframes, data modelling, and test planning.

**In scope:**
- Candidate registration, authentication, and profile management
- Job search, application submission, and resume ingestion
- AI-powered resume screening with explainability
- HR review, shortlist/reject decisions, and path classification
- Interview orchestration for fresher and experienced paths
- Assessment integration, scorecard capture, and HR round
- Final decision governance, offer approval chain, and communication
- Internal tooling: admin panel, audit log, analytics, notification centre
- DevOps pipeline, security controls, and observability

**Out of scope:**
- Provider-side (external assessment vendor) platform development
- Payment or payroll integrations
- Physical or on-site check-in systems
- Family profile or dependent management features

---

## 2. Stakeholder Roles

| Role | Description |
| --- | --- |
| Applicant | External candidate who registers, applies, and completes assessments |
| Recruiter | Internal staff who manage interview plans, communications, and routing overrides |
| HR Reviewer | Internal staff who validate AI screening output and submit shortlist/reject decisions |
| Technical Interviewer | Internal staff who conduct technical interviews and submit rubric scorecards |
| HR Manager | Internal staff who conduct HR rounds and make final hiring decisions |
| System Admin | Internal staff who manage users, policies, thresholds, and integrations |
| System | Automated processes including AI workers, job queues, and event handlers |

---

## 3. Full Workflow

### 3.1 Workflow Diagram

```
WF-01 Applicant Registration
        │
        ▼
WF-02 Login
        │
        ▼
WF-03 Apply for Job
        │
        ▼
WF-04 Upload Resume
        │
        ▼
WF-05 AI Resume Screening
        │
        ▼
WF-06 HR Review
        │
        ▼
WF-07 Shortlisted?
    ┌──────────────┐
No  │              │  Yes
    ▼              ▼
WF-08 Rejection  WF-09 Interview Process
Mail             Initiation
                     │
                     ▼
             WF-10 Experience Check
                     │
          ┌──────────┴──────────┐
          │                     │
WF-11 Fresher Path       WF-12 Experienced Path
          │                     │
          ▼                     ▼
WF-13 Aptitude Test   WF-14 Technical Interview
          │                     │
          ▼                     ▼
WF-15 Programming Assessment (both paths)
          │
          ▼
WF-16 Technical Interview (post-assessment)
          │
          ▼
WF-17 HR Round
          │
          ▼
WF-18 Final Decision
          │
    ┌─────┴──────┐
    │            │
    ▼            ▼
WF-19 Offer   WF-20 Rejection Mail
Mail
```

### 3.2 Workflow Step Definitions

| ID | Step | Actor | Trigger | Output | SLA |
| --- | --- | --- | --- | --- | --- |
| WF-01 | Applicant Registration | Applicant | Candidate opens hiring portal | Verified candidate account | Instant |
| WF-02 | Login | All roles | Registered user submits credentials | Role-specific dashboard | Instant |
| WF-03 | Apply for Job | Applicant | Candidate selects open requisition | Draft or submitted application | Instant |
| WF-04 | Upload Resume | Applicant | Application in draft or submitted state | Resume stored, parse queued | < 30 s |
| WF-05 | AI Resume Screening | System | Resume parsing complete | Screening score and recommendation | < 3 min |
| WF-06 | HR Review | HR Reviewer | AI result available in queue | Shortlist or reject decision | 48 h SLA |
| WF-07 | Shortlist Decision Branch | HR Reviewer | Review decision submitted | Workflow status updated | Instant |
| WF-08 | Rejection Communication | System | Not shortlisted | Communication log entry dispatched | < 5 min |
| WF-09 | Interview Process Initiation | Recruiter | Shortlisted candidate | Interview plan shell created | 24 h SLA |
| WF-10 | Experience Check | Recruiter | Interview process initiated | Path assignment: fresher or experienced | Instant |
| WF-11 | Fresher Path Assignment | System | Path set to fresher | Aptitude test invite queued | < 5 min |
| WF-12 | Experienced Path Assignment | System | Path set to experienced | Technical interview scheduled | < 5 min |
| WF-13 | Aptitude Test | Applicant | Path assigned as fresher | Aptitude score ingested from provider | Per schedule |
| WF-14 | Experienced Technical Interview | Technical Interviewer | Path assigned as experienced | Technical recommendation recorded | Per schedule |
| WF-15 | Programming Assessment | Applicant | Aptitude or initial technical gate complete | Programming score ingested | Per schedule |
| WF-16 | Technical Interview (post-assessment) | Technical Interviewer | Programming score available | Technical panel recommendation | Per schedule |
| WF-17 | HR Round | HR Manager | Technical recommendation available | HR recommendation and policy checks | 24 h SLA |
| WF-18 | Final Decision | HR Manager | All mandatory stages complete | Final decision record created | 24 h SLA |
| WF-19 | Offer Mail | System and Recruiter | Final decision is offer | Offer letter dispatched; response tracking started | < 10 min |
| WF-20 | Rejection Mail | System | Final decision is reject | Rejection communication dispatched; workflow closed | < 10 min |

---

## 4. Functional Requirements

### FR-001 to FR-010 — Registration, Login, and Candidate Identity

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-001 | System shall support candidate self-registration with email or phone OTP verification. | High | User receives verified status and can log in after OTP confirmation. | FR-REG-01, WF-01 |
| FR-002 | System shall enforce configurable password policy (minimum 10 characters, 1 uppercase, 1 number, 1 special character) and account lockout after 5 failed attempts. | High | After 5 failures within 15 minutes, account is locked; recovery email is sent; lockout event is logged. | FR-REG-02, BR-08 |
| FR-003 | System shall capture and version-stamp consent for privacy policy and AI processing notices at registration. | High | Consent version and timestamp appear in candidate audit timeline. | FR-REG-03 |
| FR-004 | System shall support role-based login routing for applicant, recruiter, technical interviewer, HR reviewer, HR manager, and system admin. | High | Each role lands on their designated dashboard; cross-role navigation and API resources are denied. | FR-REG-04, WF-02 |
| FR-005 | System shall support optional SSO authentication for internal users via OAuth2 / OIDC (Google, GitHub). | Medium | SSO users authenticate without a local password; domain restriction enforced. | FR-REG-05 |
| FR-006 | System shall generate a unique, immutable candidate profile ID at registration, referenced by all subsequent application events. | High | All application, screening, assessment, and decision records reference the canonical candidate ID. | FR-REG-06 |
| FR-007 | System shall display a visual onboarding checklist to first-time candidates showing pending profile completion steps. | Medium | Checklist items update in real time as each step is completed; checklist is dismissed after full completion. | FR-REG-07 |
| FR-008 | System shall support OTP verification resend with rate limiting of maximum 3 resends per hour. | Medium | Resend button is disabled after the rate limit is reached; next allowed resend timestamp is displayed. | FR-REG-08 |
| FR-009 | Session tokens shall expire after 30 minutes of inactivity with a visible 5-minute warning modal before forced logout. | High | Token refresh succeeds if user acts within the warning window; session is terminated and redirected to login otherwise. | FR-REG-09 |
| FR-010 | System shall log all authentication events — login, logout, failed attempt, lockout, and SSO — to the immutable audit service with timestamp and originating IP. | High | Every authentication event appears in the audit log within 10 seconds of occurrence. | FR-REG-10 |

### FR-011 to FR-020 — Job Search, Application, and Resume Capture

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-011 | System shall display open requisitions with title, department, location, job type, eligibility criteria, and status. | High | Candidate can filter by department, location, experience level, and job type; only open requisitions are displayed. | FR-APP-01, WF-03 |
| FR-012 | System shall prevent duplicate applications for the same requisition within a configurable cooling period. | High | Duplicate submission attempt shows blocking message with reason and cooling period end date. | FR-APP-02, BR-03 |
| FR-013 | System shall accept resume uploads in PDF and DOCX formats and submit each upload to malware scanning before persisting to storage. | High | Upload returns accepted status; malware scan result and completion timestamp are stored with the resume record. | FR-APP-03, BR-01 |
| FR-014 | System shall parse uploaded resumes using the AI worker and map extracted fields — name, email, phone, experience years, skills, education, and previous employers — to the candidate profile. | High | Parsed fields are populated in the candidate profile preview within 3 minutes of upload confirmation. | FR-APP-04, WF-04 |
| FR-015 | System shall allow candidates to review and edit AI-extracted profile fields before final submission; edits shall be audit-tracked separately from the original parser output. | Medium | Manual edits are preserved with an edited-by and edited-at record; original parse payload is immutable. | FR-APP-05 |
| FR-016 | System shall auto-save application form progress every 60 seconds and on field blur, persisting across browser refreshes. | High | Progress survives browser refresh; last-saved timestamp is displayed to the candidate. | FR-APP-06 |
| FR-017 | System shall display real-time character count and inline validation feedback for all text fields; submission shall be blocked until all required fields pass validation. | Medium | Validation feedback appears on blur; field-level error messages describe the specific constraint violated. | FR-APP-07 |
| FR-018 | System shall display a section-level progress bar and dynamic estimated completion time on the application form. | Medium | Progress bar reflects completed vs. remaining sections; estimated time updates as sections are completed. | FR-APP-08 |
| FR-019 | System shall send a confirmation email with application ID, requisition name, and next-step guidance within 5 minutes of application submission. | High | Confirmation email is delivered within the SLA; delivery status is logged. | FR-APP-09 |
| FR-020 | System shall allow candidates to withdraw an active application before HR review begins; withdrawal creates an audit entry and releases the requisition slot. | Medium | Withdrawn application status updates immediately; slot is decremented; withdrawal acknowledgement email is sent. | FR-APP-10, BR-13 |

### FR-021 to FR-028 — AI Screening and Explainability

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-021 | System shall compute a candidate match score using required skills, experience years, and role fit heuristics; score and model version shall be stored with evaluation timestamp. | High | Score, model version ID, and evaluation timestamp are persisted for every screening event. | FR-AI-01, WF-05 |
| FR-022 | System shall store the top positive contributing factors and skill gaps alongside every screening result for display in the HR explainability panel. | High | HR reviewer sees at least 3 positive factors and up to 5 skill gaps; confidence level is displayed. | FR-AI-02 |
| FR-023 | System shall flag screening results with confidence below the configured threshold for mandatory HR manual review; flagged candidates are routed to a separate manual queue. | High | Low-confidence candidates appear in the manual queue with a flag indicator; auto-advance is blocked. | FR-AI-03, BR-02 |
| FR-024 | System shall support configurable match score thresholds per job family, with threshold changes versioned and logged with effective date and author. | High | Old threshold remains frozen on in-flight evaluations; new threshold applies to evaluations after the effective date. | FR-AI-04 |
| FR-025 | System shall enter AI fallback mode when the AI worker is degraded or unavailable; resumes are queued for batch processing and operations are notified. | Medium | Fallback state is visible on the admin health dashboard; no new auto-advances occur during fallback. | FR-AI-05, BR-16 |
| FR-026 | System shall re-evaluate a candidate's screening score when a recruiter updates the job family threshold, creating a new score version and preserving the previous version. | Medium | Re-evaluation creates a new versioned score record; HR can compare old and new versions. | FR-AI-06 |
| FR-027 | System shall render an AI confidence meter on each candidate card in the HR review queue, colour-coded at three bands: high (green), medium (amber), and low (red). | High | Confidence meter renders at correct colour band; colours are always paired with a text label for accessibility. | FR-AI-07 |
| FR-028 | System shall version all AI model outputs with model ID, model version, and evaluation timestamp, enabling HR to filter the candidate queue by model version for audits. | High | Queue filter by model version returns only candidates evaluated under the selected version. | FR-AI-08 |

### FR-029 to FR-036 — HR Review, Shortlist, and Routing

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-029 | System shall provide an HR review dashboard with a candidate queue, column-level filters (requisition, stage, SLA status, confidence band), and SLA aging indicators. | High | All filter combinations return correct results; SLA aging indicators update without page refresh. | FR-REV-01, WF-06 |
| FR-030 | System shall require a mandatory reason code selection for every shortlist or reject decision before the state transition is permitted. | High | Decision submission is blocked and an error message is shown when reason code is missing. | FR-REV-02, WF-07 |
| FR-031 | System shall automatically trigger rejection communication within 5 minutes of a reject decision being recorded. | High | Rejection email is dispatched; communication event appears in the candidate timeline and audit log. | FR-REV-03, WF-08 |
| FR-032 | System shall classify shortlisted candidates as fresher or experienced based on configurable experience year thresholds; classification is visible and overridable by authorised roles. | High | Classified path is shown on the candidate card; override requires justification and approval. | FR-REV-04, WF-10, BR-04, BR-05 |
| FR-033 | System shall support recruiter override of path classification with a justification note and second-approver workflow; all override fields are captured in the audit record. | Medium | Override request captures requester identity, justification text, and approver identity. | FR-REV-05, BR-11 |
| FR-034 | System shall display a per-card SLA countdown timer in the HR review queue; cards within 8 hours of the SLA deadline escalate to amber; breached cards escalate to red with an in-app alert. | High | Colour change and alert are triggered at correct thresholds; alert contains candidate name and deadline. | FR-REV-06 |
| FR-035 | System shall support bulk reject action for multiple candidates with a single reason code; each individual rejection is logged as a separate audit event. | Medium | Bulk action requires a confirmation modal; individual audit entries are created for each candidate. | FR-REV-07 |
| FR-036 | System shall notify the assigned HR reviewer by in-app badge and email within 2 minutes when a new candidate enters their review queue. | Medium | In-app badge count increments; email notification is delivered within the SLA. | FR-REV-08 |

### FR-037 to FR-048 — Assessments and Interviews

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-037 | System shall schedule aptitude, coding, and interview stages with timezone-aware slots; both candidate and panel receive independently localised schedule confirmations. | High | Each recipient's confirmation email displays the time in their local timezone with timezone label. | FR-INT-01, WF-13, WF-14 |
| FR-038 | System shall enforce the fresher hiring path by disabling the coding assessment link until the aptitude score is ingested and confirmed. | High | Coding assessment link is greyed out and displays a prerequisite notice until aptitude completion. | FR-INT-02, WF-13, BR-04 |
| FR-039 | System shall allow the experienced hiring path candidate to begin directly with the technical interview without completing an aptitude stage. | High | Experienced candidate can access the technical interview scheduling page without aptitude completion. | FR-INT-03, WF-14, BR-05 |
| FR-040 | System shall ingest aptitude and coding assessment scores from the external provider via signed HMAC callback; duplicate callbacks identified by callback token shall be rejected idempotently. | High | A duplicate callback with the same token returns a 200 acknowledgement without creating a new score row. | FR-INT-04 |
| FR-041 | System shall capture technical interviewer scorecards with mandatory rubric dimensions (minimum: problem solving, technical depth, communication, code quality, system design), per-dimension rating, and overall recommendation. | High | Scorecard submission is blocked when any mandatory rubric dimension is unanswered. | FR-INT-05, WF-16 |
| FR-042 | System shall record no-show, reschedule, and cancellation states with reason codes; all state changes are tracked with timestamp, actor, and reason and are visible in the candidate timeline. | Medium | State changes appear in the timeline within 30 seconds; reason code is required for each state change. | FR-INT-06 |
| FR-043 | System shall send automated interview reminders at 24 hours and 1 hour before the scheduled interview slot via email and in-app notification; delivery status is logged. | High | Both reminders are dispatched at the correct intervals; delivery statuses are visible in the communication log. | FR-INT-07 |
| FR-044 | System shall generate a live coding environment link for programming assessments with an idempotent session timer that persists across reconnects within the session window. | High | Repeated link generation returns the same link; timer state is restored on reconnect. | FR-INT-08 |
| FR-045 | System shall provide technical interviewers with a read-only panel showing the candidate's resume, AI screening score, confidence level, and top contributing factors during the interview. | Medium | Interviewer panel displays all elements; no write action is permitted from this view. | FR-INT-09 |
| FR-046 | System shall notify the recruiter via in-app notification within 5 minutes when any interview stage is completed and a scorecard is submitted. | Medium | Notification includes candidate name, stage name, and recommendation. | FR-INT-10 |
| FR-047 | System shall support interview scheduling conflict detection; conflicting slot selections are highlighted in the calendar grid before confirmation. | High | Conflict indicator appears on the slot cell; system prevents booking a confirmed conflict. | FR-INT-01 (extended) |
| FR-048 | System shall support interview panel member invitation with individual confirmation status tracking per panel member. | Medium | Each panel member's accept, decline, or pending status is visible on the interview plan. | FR-INT-01 (extended) |

### FR-049 to FR-056 — HR Round and Final Decision Governance

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-049 | System shall require completion of all mandatory stages before enabling the final decision controls; a checklist of incomplete prerequisites is displayed when the controls are locked. | High | Decision controls remain disabled and the prerequisite checklist is visible until all stages are complete. | FR-DEC-01, BR-06, WF-18 |
| FR-050 | System shall support final decision outcomes of offer, reject, hold, and withdraw; each outcome updates the candidate dashboard, requisition metrics, and triggers the corresponding communication event. | High | Outcome is reflected in all three surfaces within 30 seconds of submission. | FR-DEC-02 |
| FR-051 | System shall enforce a configurable approval matrix for offer release based on compensation band tier; offers requiring higher-tier approval cannot be dispatched until all approvers have signed off. | High | Offer dispatch is blocked until all required approvers in the matrix have submitted approval. | FR-DEC-03, BR-07, WF-19 |
| FR-052 | System shall produce an auditable decision summary PDF including stage scores, rationale notes, interviewer names, and final outcome, downloadable from the recruiter console. | High | PDF is generated within 10 seconds of decision submission; all stage scores and rationale are included. | FR-DEC-04 |
| FR-053 | System shall track candidate offer responses and send automated reminder emails at configurable intervals until the candidate responds or the offer expiry date is reached. | Medium | Reminder jobs run at configured intervals; offer status transitions to expired on the deadline without response. | FR-DEC-05, BR-12 |
| FR-054 | System shall link every offer or rejection communication event to the corresponding decision record in the audit trail, recording template version, delivery status, and timestamp. | High | Communication log entry references decision ID; template version is stored with each send. | FR-DEC-06 |
| FR-055 | System shall automatically decrement the requisition open slot count when an offer is accepted; if all slots are filled, requisition status transitions to closed. | High | Slot count is decremented within 30 seconds of acceptance; requisition status updates trigger immediately. | FR-DEC-07, BR-18 |
| FR-056 | System shall generate the offer letter by resolving dynamic token fields (candidate name, job title, salary, start date, offer deadline, company name) from candidate and decision records; token resolution failures block dispatch. | High | Letter generation fails with a descriptive error listing unresolved tokens; no partially-resolved letter is sent. | FR-DEC-08 |

### FR-057 to FR-062 — Communication and Notification System

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-057 | System shall provide tokenized email templates for: registration welcome, application confirmation, screening complete, rejection, shortlist notification, aptitude invite, technical interview invite, interview reminder, offer letter, final rejection, and offer reminder. | High | Each template renders correctly with sample data in the admin template preview before activation. | FR-COM-01 |
| FR-058 | System shall log all outbound communications with provider name, message ID, delivery status (queued, sent, delivered, bounced, failed), and timestamp; retry status is visible per attempt. | High | All statuses are visible in the communication log; each retry attempt creates a new log entry. | FR-COM-02 |
| FR-059 | System shall retry transient outbound communication failures using exponential backoff (30 s → 2 min → 8 min → 32 min → 128 min) for a maximum of 5 attempts; after maximum attempts a recruiter task is created and the communication is marked failed. | High | Retry count and intervals match the specification; recruiter task is created after the final failed attempt. | FR-COM-03, BR-10 |
| FR-060 | System shall deliver multi-channel in-app alerts and email notifications to internal users for critical SLA events, including SLA breach alerts, AI fallback state, and communication failure. | Medium | In-app badge and email are delivered within 2 minutes of the triggering event. | FR-COM-04 |
| FR-061 | System shall support localization-ready template content with a locale field and English fallback; template rendering falls back to English when a locale-specific version is not available. | Low | Fallback is silent; no error is thrown; English content is rendered when locale is absent. | FR-COM-05 |
| FR-062 | System shall provide a notification preference centre for candidates allowing opt-in and opt-out per channel (email, SMS); preference changes take effect within one send cycle. | Medium | Opt-out is honoured on the next queued send; preference change is logged. | FR-COM-06 |

### FR-063 to FR-068 — Administration and Configuration

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-063 | System shall provide an admin panel for user management (create, deactivate, assign role); role changes take effect on the user's next login. | High | Deactivated user cannot authenticate; role changes are reflected on next session. | FR-ADM-01 |
| FR-064 | System shall allow admin to manage job requisitions, job family definitions, and stage policy configuration; policy changes are versioned with effective date so in-flight applications continue under the previous version. | High | In-flight applications are unaffected by policy version change; new applications use the new version. | FR-ADM-02 |
| FR-065 | System shall provide a scoring threshold editor per job family with full audit trail recording author, timestamp, old value, and new value. | High | Audit trail is complete; old threshold is preserved in the version history. | FR-ADM-03 |
| FR-066 | System shall provide an audit log viewer with search by actor, event type, entity, and date range; export produces a CSV file within 30 seconds. | High | All searchable dimensions return correct results; CSV export includes all visible columns. | FR-ADM-04 |
| FR-067 | System shall provide a platform health dashboard showing BullMQ queue depth, AI worker service status, and email delivery rate; dashboard refreshes every 60 seconds and displays alerts for degraded services. | Medium | All three metrics are visible; degraded state triggers a visible alert without page refresh. | FR-ADM-05 |
| FR-068 | System shall support bulk import of requisitions from a CSV file; rows failing validation are rejected and listed in a downloadable error report; valid rows are imported atomically. | Medium | Error report identifies row number, field name, and error reason for each invalid row. | FR-ADM-06 |

### FR-069 to FR-073 — Analytics and Reporting

| ID | Requirement | Priority | Acceptance Criteria | BRD Traceability |
| --- | --- | --- | --- | --- |
| FR-069 | System shall provide a recruiter dashboard showing pipeline metrics — total applications, shortlist rate, and average time-to-hire — updated with a maximum 5-minute lag. | High | Metrics reflect confirmed data within the SLA; stale data is indicated with a last-updated timestamp. | FR-ANA-01 |
| FR-070 | System shall provide stage conversion funnel charts per requisition showing candidate count and drop-off rate at each stage; funnel is exportable as a PNG image or CSV data. | Medium | Funnel matches database counts at time of render; export is accurate to the rendered data. | FR-ANA-02 |
| FR-071 | System shall provide AI accuracy tracking per model version showing the human-AI agreement rate (percentage of AI recommendations confirmed by the HR reviewer's decision). | High | Agreement rate is calculated correctly; filter by model version returns version-specific accuracy. | FR-ANA-03 |
| FR-072 | System shall surface no-show and cancellation rate metrics by stage and requisition with a 30-day trend line on the interview planner view. | Medium | Trend line covers the correct 30-day rolling window; data matches the interview state log. | FR-ANA-04 |
| FR-073 | System shall generate and send a weekly hiring digest email to HR managers every Monday at 08:00 local time containing key pipeline metrics; digest can be toggled in notification preferences. | Low | Digest is sent within 5 minutes of the scheduled time; content matches dashboard metrics. | FR-ANA-05 |

---

## 5. Use Cases

### UC-001 — Candidate Self-Registration

| Field | Value |
| --- | --- |
| Use Case ID | UC-001 |
| Name | Candidate Self-Registration |
| Actors | Applicant |
| Trigger | Applicant navigates to the hiring portal registration page |
| Pre-conditions | No existing account exists for the provided email or phone number |
| Post-conditions | Verified candidate account is created; onboarding checklist is presented |
| Main Flow | 1. Applicant enters name, email or phone, password, and consent acknowledgement. 2. System validates input and sends OTP to the registered contact. 3. Applicant enters OTP within the session window. 4. System verifies OTP, creates account with canonical ID, records consent version, and routes to the candidate dashboard. |
| Alternate Flows | 3a. OTP expires — applicant requests resend (max 3 per hour); if limit reached, resend is blocked for the remaining period. |
| Exception Flows | 2a. Duplicate email or phone — system blocks registration and prompts applicant to log in or use a different contact. 3b. OTP fails 5 times — account is locked; recovery email is dispatched. |
| Requirements | FR-001, FR-002, FR-003, FR-006, FR-007, FR-008, FR-010 |

### UC-002 — Job Search and Application Submission

| Field | Value |
| --- | --- |
| Use Case ID | UC-002 |
| Name | Job Search and Application Submission |
| Actors | Applicant |
| Trigger | Authenticated applicant navigates to the job board |
| Pre-conditions | Applicant has a verified account and is authenticated |
| Post-conditions | Application is submitted; confirmation email is dispatched; resume parse is queued |
| Main Flow | 1. Applicant searches and filters requisitions by department, location, and experience level. 2. Applicant selects an open requisition and reviews eligibility criteria. 3. Applicant completes the application form with autosave active. 4. Applicant uploads resume (PDF or DOCX); system queues malware scan and parse. 5. Applicant reviews AI-parsed profile, edits if necessary, and confirms submission. 6. System sends confirmation email within 5 minutes. |
| Alternate Flows | 4a. Upload format not supported — system displays a supported-format error; candidate re-uploads. 5a. Candidate makes manual edits — edits are logged with audit trail separately from parser output. |
| Exception Flows | 3a. Duplicate application detected within cooling period — submission is blocked; cooling end date is displayed. 4b. Malware detected in upload — file is rejected; candidate is prompted to upload a clean file. |
| Requirements | FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019 |

### UC-003 — AI Screening and Queue Entry

| Field | Value |
| --- | --- |
| Use Case ID | UC-003 |
| Name | AI Screening and Queue Entry |
| Actors | System |
| Trigger | Resume parse job completes successfully |
| Pre-conditions | Resume is stored, malware scan passed, and parse is complete |
| Post-conditions | Screening score and explainability factors are stored; candidate appears in HR review queue |
| Main Flow | 1. AI worker receives parse payload and computes match score using skills, experience, and role fit model. 2. System stores score, model version, confidence level, positive factors, and skill gaps. 3. If confidence is above threshold and score is above auto-advance threshold, candidate is routed to the standard HR queue. 4. HR reviewer receives in-app and email notification of new queue entry. |
| Alternate Flows | 3a. Confidence below threshold — candidate is routed to the manual review queue with low-confidence flag. 3b. Score below auto-reject threshold — candidate is moved to reject queue (HR still reviews per policy). |
| Exception Flows | 1a. AI worker unavailable — system enters fallback mode; resume is queued for batch processing; operations are notified via health dashboard alert. |
| Requirements | FR-021, FR-022, FR-023, FR-025, FR-027, FR-028, FR-036 |

### UC-004 — HR Shortlist Decision

| Field | Value |
| --- | --- |
| Use Case ID | UC-004 |
| Name | HR Shortlist Decision |
| Actors | HR Reviewer |
| Trigger | HR Reviewer opens a candidate card in the review queue |
| Pre-conditions | Candidate is in the HR review queue with a screening result |
| Post-conditions | Candidate is shortlisted or rejected; audit event is created; downstream action is triggered |
| Main Flow | 1. HR Reviewer views candidate card with AI score, confidence meter, positive factors, and skill gaps. 2. HR Reviewer selects a reason code and submits a shortlist decision. 3. System updates workflow status; candidate path classification is determined and displayed. 4. Recruiter receives notification to initiate interview process. |
| Alternate Flows | 2a. Reject decision — system updates status; rejection email is dispatched within 5 minutes. 2b. Bulk reject — HR Reviewer selects multiple candidates, applies single reason code, confirms in modal; individual audit entries are created. |
| Exception Flows | 2c. Reason code missing — submission is blocked; error message specifies required field. 2d. SLA breach — candidate card turns red; in-app and email alert fired to HR Reviewer and queue manager. |
| Requirements | FR-029, FR-030, FR-031, FR-032, FR-034, FR-035, FR-036 |

### UC-005 — Interview Path Routing and Scheduling

| Field | Value |
| --- | --- |
| Use Case ID | UC-005 |
| Name | Interview Path Routing and Scheduling |
| Actors | Recruiter, Applicant |
| Trigger | Recruiter initiates interview process for a shortlisted candidate |
| Pre-conditions | Candidate status is shortlisted; interview plan shell is available |
| Post-conditions | Interview stage is scheduled; candidate and panel receive timezone-localised confirmations; assessment link is generated if applicable |
| Main Flow | 1. Recruiter assigns path (fresher or experienced) based on configured policy. 2. System enables corresponding stage controls. Fresher: aptitude test invite is queued. Experienced: technical interview scheduling is enabled. 3. Recruiter selects timezone-aware slots for each stage from the calendar grid. 4. System generates assessment links or calendar invites; panel members receive invitations with individual confirmation controls. 5. Candidate receives stage invite email with timeline and access link. |
| Alternate Flows | 1a. Override requested — Recruiter submits justification; second approver is required before path change is applied. 3a. Scheduling conflict detected — system highlights conflicting slot; booking is blocked. |
| Exception Flows | 5a. Email delivery fails — retry initiated; if max retries exceeded, recruiter task is created. |
| Requirements | FR-033, FR-037, FR-038, FR-039, FR-043, FR-044, FR-047, FR-048 |

### UC-006 — Assessment Completion and Score Ingestion

| Field | Value |
| --- | --- |
| Use Case ID | UC-006 |
| Name | Assessment Completion and Score Ingestion |
| Actors | Applicant, System |
| Trigger | Candidate opens the assessment console for their assigned stage |
| Pre-conditions | Assessment link has been generated; prerequisites for the path are met (aptitude complete before coding for freshers) |
| Post-conditions | Assessment score is ingested and stored; next stage access is enabled if applicable |
| Main Flow | 1. Applicant accesses assessment console via the unique link. 2. Applicant completes the assessment within the time window; autosave preserves answers per question. 3. External provider dispatches signed HMAC callback with score on completion. 4. System verifies callback signature and ingests score idempotently (duplicate callbacks rejected by token). 5. Recruiter is notified; next stage gate is evaluated and enabled if met. |
| Alternate Flows | 2a. Candidate disconnects — timer state is preserved; candidate can reconnect and resume within the session window. |
| Exception Flows | 1a. Fresher candidate attempts coding before aptitude — link is disabled with prerequisite notice. 3a. Invalid callback signature — callback is rejected; alert is sent to operations. |
| Requirements | FR-038, FR-039, FR-040, FR-044, FR-046 |

### UC-007 — Technical Scorecard Submission

| Field | Value |
| --- | --- |
| Use Case ID | UC-007 |
| Name | Technical Scorecard Submission |
| Actors | Technical Interviewer |
| Trigger | Technical Interviewer completes a scheduled interview |
| Pre-conditions | Interview is scheduled and the interviewer is assigned; candidate is in the technical interview stage |
| Post-conditions | Scorecard is submitted; recommendation is recorded; recruiter is notified; HR round is enabled if recommendation is to advance |
| Main Flow | 1. Technical Interviewer accesses the scorecard interface, with read-only candidate resume and AI screening rationale visible. 2. Interviewer completes all mandatory rubric dimensions (problem solving, technical depth, communication, code quality, system design) with per-dimension ratings. 3. Interviewer adds comments and selects overall recommendation. 4. System validates scorecard completeness and submits; audit event is created. 5. Recruiter is notified within 5 minutes. |
| Alternate Flows | 3a. Interviewer saves as draft — draft is stored; submission can be completed before the deadline. |
| Exception Flows | 2a. Mandatory rubric dimension missing — submission is blocked with field-level error. |
| Requirements | FR-041, FR-045, FR-046 |

### UC-008 — Final Decision and Offer Dispatch

| Field | Value |
| --- | --- |
| Use Case ID | UC-008 |
| Name | Final Decision and Offer Dispatch |
| Actors | HR Manager, Recruiter, System |
| Trigger | HR Manager opens the decision workbench for a candidate who has completed all mandatory stages |
| Pre-conditions | All mandatory stages are complete; HR round recommendation is recorded; approval matrix is configured |
| Post-conditions | Decision is recorded; offer or rejection communication is dispatched; requisition slot is updated; audit trail is closed |
| Main Flow | 1. HR Manager reviews stage summary (scores, recommendations) and compensation band check. 2. HR Manager selects outcome (offer, reject, hold, or withdraw), enters reason code, and submits. 3. System enforces approval matrix: if compensation band requires additional approvers, offer is held until all sign off. 4. On full approval, system generates the offer letter with resolved tokens and dispatches via email. 5. Offer response tracking starts; automated reminders are sent at configured intervals. 6. On candidate acceptance, requisition slot is decremented; if slots are full, requisition closes. |
| Alternate Flows | 2a. Reject decision — rejection email is dispatched immediately; workflow is closed. 2b. Hold decision — candidate status is placed on hold; no communication is dispatched until hold is resolved. 2c. Withdraw — application is withdrawn; acknowledgement email is sent; slot is released. |
| Exception Flows | 3a. Approver does not respond before deadline — escalation alert is sent to the HR Manager. 4a. Token resolution failure — offer letter generation fails; error lists unresolved tokens; no partial letter is sent. 6a. Offer expires without response — offer is auto-expired; HR Manager is notified; outcome is recorded as no-response. |
| Requirements | FR-049, FR-050, FR-051, FR-052, FR-053, FR-054, FR-055, FR-056 |

---

## 6. Business Rules

| Rule ID | Condition | Action | Requirements |
| --- | --- | --- | --- |
| BR-01 | Resume is missing or malware scan failed | Block AI screening; prompt candidate to re-upload with specific failure reason | FR-013, FR-021 |
| BR-02 | AI confidence score is below configured threshold | Force mandatory HR manual review; block auto-advance; route to manual queue with flag | FR-023 |
| BR-03 | Duplicate application submitted within cooling period | Block submission; display cooling period end date; log attempt | FR-012 |
| BR-04 | Candidate is classified as fresher | Aptitude test must be completed and score ingested before coding assessment link is active | FR-038, WF-13 |
| BR-05 | Candidate is classified as experienced | Candidate may proceed directly to technical interview; aptitude is optional | FR-039, WF-14 |
| BR-06 | Any mandatory stage is incomplete | Final decision controls remain disabled; incomplete stage checklist is displayed | FR-049 |
| BR-07 | Compensation band exceeds configured tier threshold | Require additional approver from finance or executive chain before offer dispatch | FR-051 |
| BR-08 | OTP verification fails 5 times within 15 minutes | Lock account; dispatch recovery email; log lockout event | FR-002, FR-010 |
| BR-09 | Interview no-show state recorded | Candidate is flagged; recruiter is prompted to reschedule or close the stage | FR-042 |
| BR-10 | Email delivery bounces after maximum retry attempts | Create open recruiter task; mark communication as failed; display status on candidate card | FR-059, FR-062 |
| BR-11 | Shortlist path override requested | Requires second approver at recruiter-manager level; justification is mandatory; all fields are captured in audit | FR-033 |
| BR-12 | Offer response deadline passes without candidate response | Auto-expire offer; notify HR Manager; record outcome as no-response | FR-053 |
| BR-13 | Candidate withdraws application before HR review | Release requisition slot; close workflow; send withdrawal acknowledgement email; create audit entry | FR-020 |
| BR-14 | Admin changes scoring threshold for a job family | Old threshold is frozen on existing evaluations; new threshold applies only to evaluations submitted after the effective date | FR-024, FR-065 |
| BR-15 | Data deletion request received from candidate | Anonymize all PII fields within 30 days; retain decision and audit records for the legal compliance period | FR-010 |
| BR-16 | AI worker service degraded or unavailable | Enter fallback mode; queue resumes for batch processing; block new auto-advances; notify operations team | FR-025 |
| BR-17 | Requisition is closed by admin | Block new applications; candidates already in the pipeline proceed to completion | FR-064 |
| BR-18 | Candidate accepts offer | Decrement requisition open slot count; if all slots filled, transition requisition status to closed | FR-055 |

---

## 7. API Surface

### 7.1 Core REST Endpoints

| Group | Method | Path | Description | Auth Required |
| --- | --- | --- | --- | --- |
| Auth | POST | `/auth/register` | Initiate registration; send OTP | No |
| Auth | POST | `/auth/verify-otp` | Verify OTP; create account | No |
| Auth | POST | `/auth/login` | Authenticate; return JWT | No |
| Auth | POST | `/auth/refresh` | Rotate refresh token | Bearer |
| Auth | POST | `/auth/logout` | Revoke session | Bearer |
| Candidates | GET | `/candidates/:id` | Retrieve candidate profile | Bearer |
| Candidates | PATCH | `/candidates/:id` | Update profile fields | Bearer (own) |
| Jobs | GET | `/jobs` | List and filter requisitions | Bearer |
| Jobs | GET | `/jobs/:id` | Requisition detail and eligibility | Bearer |
| Applications | POST | `/applications` | Submit application | Bearer (applicant) |
| Applications | PATCH | `/applications/:id/withdraw` | Withdraw application | Bearer (own) |
| Resumes | POST | `/resumes` | Upload resume; queue scan | Bearer (applicant) |
| Resumes | GET | `/resumes/:id/parse-status` | Poll parse completion | Bearer |
| Screening | GET | `/screening/:applicationId` | Retrieve screening result | Bearer (internal) |
| Screening | POST | `/screening/thresholds` | Create or update threshold | Bearer (admin) |
| Reviews | GET | `/reviews/queue` | HR review queue with filters | Bearer (hr-reviewer) |
| Reviews | POST | `/reviews/:applicationId/decide` | Submit shortlist or reject | Bearer (hr-reviewer) |
| Reviews | POST | `/reviews/:applicationId/override-path` | Submit path override request | Bearer (recruiter) |
| Interviews | POST | `/interviews/:applicationId/plan` | Create interview plan | Bearer (recruiter) |
| Interviews | POST | `/interviews/:applicationId/schedule` | Schedule a stage slot | Bearer (recruiter) |
| Interviews | POST | `/interviews/:stageId/scorecard` | Submit rubric scorecard | Bearer (tech-interviewer) |
| Interviews | PATCH | `/interviews/:stageId/state` | Record no-show, reschedule, cancel | Bearer (recruiter) |
| Decisions | GET | `/decisions/:applicationId/prerequisites` | Check decision gate readiness | Bearer (hr-manager) |
| Decisions | POST | `/decisions/:applicationId` | Submit final decision | Bearer (hr-manager) |
| Decisions | POST | `/decisions/:decisionId/approve` | Submit approver sign-off | Bearer (approver) |
| Communications | POST | `/communications/send` | Dispatch templated communication | Bearer (internal) |
| Communications | GET | `/communications/:applicationId` | View communication log | Bearer (internal) |
| Communications | POST | `/communications/:id/retry` | Manual retry of failed send | Bearer (recruiter) |
| Audit | GET | `/audit/events` | Search audit log with filters | Bearer (admin) |
| Audit | GET | `/audit/events/export` | Export audit log as CSV | Bearer (admin) |
| Admin | GET | `/admin/users` | List platform users | Bearer (admin) |
| Admin | POST | `/admin/users` | Create user with role | Bearer (admin) |
| Admin | PATCH | `/admin/users/:id` | Update role or deactivate | Bearer (admin) |
| Analytics | GET | `/analytics/pipeline` | Pipeline metrics summary | Bearer (internal) |
| Analytics | GET | `/analytics/funnel/:requisitionId` | Stage funnel data | Bearer (internal) |
| Analytics | GET | `/analytics/ai-accuracy` | AI agreement rate by model version | Bearer (internal) |
| Health | GET | `/health` | Liveness and readiness probe | No |

### 7.2 WebSocket Events

| Event | Direction | Trigger | Payload |
| --- | --- | --- | --- |
| `queue:candidate-added` | Server → HR Reviewer | Candidate enters HR review queue | `{ applicationId, candidateName, score, slaDeadline }` |
| `queue:status-changed` | Server → Internal | Candidate status transitions | `{ applicationId, oldStatus, newStatus }` |
| `screening:complete` | Server → HR Reviewer | AI screening job finishes | `{ applicationId, score, confidence }` |
| `notification:new` | Server → Authenticated user | Any alert event | `{ type, title, body, link, timestamp }` |
| `sla:breach-warning` | Server → HR Reviewer | Candidate card within 8 h of SLA | `{ applicationId, candidateName, slaDeadline }` |

---

## 8. Data Requirements

### 8.1 Core Data Entities

| Entity | Key Fields | Retention |
| --- | --- | --- |
| candidates | id, email, phone, consent_version, status, created_at | PII anonymized on deletion; record retained |
| profiles | candidate_id, full_name, experience_years, skills[], education[], raw_parse_json | Follows candidate retention |
| requisitions | id, title, department, job_family, slots, status, opened_at, closed_at | Retained indefinitely |
| applications | id, candidate_id, requisition_id, status, path, submitted_at | Retained for compliance period |
| resumes | id, application_id, storage_key, scan_status, uploaded_at | File deleted on PII deletion; record retained anonymised |
| screenings | id, application_id, model_version, score, confidence, factors_json, evaluated_at | Retained for audit horizon |
| hr_reviews | id, application_id, reviewer_id, decision, reason_code, decided_at | Retained for compliance period |
| assessments | id, application_id, type, provider_ref, score, completed_at | Retained for audit horizon |
| scorecards | id, application_id, interviewer_id, rubric_json, recommendation, submitted_at | Retained for audit horizon |
| decisions | id, application_id, outcome, reason_code, decided_at | Retained for legal compliance period |
| audit_events | id, actor_id, event_type, entity_id, payload_json, created_at | Append-only; 7-year retention |
| communications | id, application_id, template_id, status, sent_at | Retained for audit horizon |
| templates | id, name, type, locale, version, body_html, created_at | Versioned; previous versions retained |

### 8.2 Data Integrity Rules

- All foreign keys are enforced at the database layer via Prisma schema constraints.
- `audit_events` table permits INSERT only; UPDATE and DELETE are denied at the database role level.
- `screenings.score` is immutable after insert; re-evaluations create new rows with incremented version.
- `resumes.storage_key` is hashed before storage to prevent path enumeration.
- PII columns (email, phone, full_name) in `candidates` and `profiles` are masked to placeholder values on anonymization; decision and audit records retain hashed identifiers for legal reference.

---

## 9. Integration Requirements

| Integration | Purpose | Authentication | Data Exchange Pattern |
| --- | --- | --- | --- |
| Supabase Auth | JWT issuance, OTP, OAuth2/SSO | Service role key (server-side only) | SDK method calls; webhook for auth events |
| Supabase Storage | Resume and generated document storage | Service role key | Signed URL for upload; presigned URL for read |
| Resend | Transactional email dispatch | API key (env variable) | REST POST; webhook callback for delivery status |
| External Assessment Provider | Aptitude and coding test launch and score ingest | HMAC-signed API key | REST launch; signed HMAC webhook callback |
| Google OAuth | SSO for internal users | OAuth2 Authorization Code | Redirect flow; restricted to verified organisation domain |
| GitHub OAuth | SSO for internal users | OAuth2 Authorization Code | Redirect flow; restricted to verified organisation |
| Grafana Cloud | Distributed tracing and metrics | OTLP endpoint credentials | OpenTelemetry SDK push |
| GitHub Actions | CI/CD pipeline | Repository secrets | YAML workflow triggered on push/PR |

---

## 10. Non-Functional Requirements

| Category | Requirement | Target | Measurement |
| --- | --- | --- | --- |
| Latency | Core CRUD API P95 response time | < 2 s | OpenTelemetry trace percentile |
| AI Processing | Resume parse and screening score delivery | < 3 min from upload | Job completion timestamp delta |
| Availability | Monthly uptime | 99.9% | Railway and Vercel health check monitoring |
| Throughput | Concurrent active sessions supported | 200 | k6 load test before major release |
| Audit | Decision path traceability | 100% | Automated audit coverage test in CI |
| Security | Critical OWASP findings at release | Zero | OWASP ZAP CI-integrated scan |
| Recovery (RPO) | Maximum acceptable data loss | ≤ 15 min | Supabase point-in-time recovery validation |
| Recovery (RTO) | Maximum acceptable downtime | ≤ 2 h | DR runbook quarterly drill |
| Accessibility | WCAG conformance | 2.2 AA | axe-core automated scan + manual audit |
| Bundle Size | Initial page load (gzipped) | < 200 KB | Vite bundle analysis in CI |
| Time to Interactive | First interaction on 4G | < 2 s | Lighthouse CI score ≥ 90 |
| Session Timeout | Inactivity window before logout | 30 min | Session management E2E test |

---

## 11. Security Requirements

| Control | Requirement |
| --- | --- |
| Authentication | Supabase JWT with refresh token rotation on every use |
| Password policy | Minimum 10 characters; 1 uppercase, 1 number, 1 special character; configurable via admin |
| Account lockout | 5 failed attempts in 15 minutes → lockout → recovery email |
| MFA | OTP or TOTP required for all internal user accounts |
| RBAC | JWT claims carry role; every protected API route validates role before execution |
| Row-level security | Supabase RLS policies restrict candidate record access to the record owner |
| Rate limiting | Upstash Redis: 100 req/min per IP (public); 1000 req/min per authenticated session |
| Transport security | TLS 1.3 enforced on all service endpoints |
| PII masking | Name, email, phone masked in all log output; raw PII stored only in designated columns |
| Secret management | All secrets stored in Railway.app and Vercel environment vaults; never committed to repository |
| Dependency scanning | Dependabot automated updates; weekly vulnerability scan in CI |
| Input validation | Zod schema validation on every request body before processing |
| Injection prevention | Parameterised queries exclusively via Prisma ORM; no raw SQL with user input |

---

## 12. Traceability Matrix

| BRD Section | FR IDs | UC IDs | BR IDs | WF IDs |
| --- | --- | --- | --- | --- |
| FR-REG (Registration and Identity) | FR-001 to FR-010 | UC-001 | BR-08, BR-15 | WF-01, WF-02 |
| FR-APP (Job Search and Application) | FR-011 to FR-020 | UC-002 | BR-01, BR-03, BR-13 | WF-03, WF-04 |
| FR-AI (AI Screening) | FR-021 to FR-028 | UC-003 | BR-02, BR-16 | WF-05 |
| FR-REV (HR Review and Shortlist) | FR-029 to FR-036 | UC-004 | BR-04, BR-05, BR-11 | WF-06, WF-07, WF-08, WF-10 |
| FR-INT (Assessments and Interviews) | FR-037 to FR-048 | UC-005, UC-006, UC-007 | BR-04, BR-05, BR-09 | WF-11 to WF-16 |
| FR-DEC (Final Decision and Offer) | FR-049 to FR-056 | UC-008 | BR-06, BR-07, BR-12, BR-18 | WF-17, WF-18, WF-19, WF-20 |
| FR-COM (Communication) | FR-057 to FR-062 | UC-002, UC-004, UC-005, UC-008 | BR-10 | WF-08, WF-19, WF-20 |
| FR-ADM (Administration) | FR-063 to FR-068 | — | BR-14, BR-17 | — |
| FR-ANA (Analytics) | FR-069 to FR-073 | — | — | — |

---

## 13. Assumptions and Constraints

| # | Assumption or Constraint |
| --- | --- |
| A-01 | External assessment provider exposes a REST API for test launch and a signed HMAC webhook for score delivery. |
| A-02 | Supabase free tier capacity is sufficient for Phase 1 load; upgrade path is documented in the risk register. |
| A-03 | Resend is the sole email provider for Phase 1; a secondary provider is planned for Phase 2. |
| A-04 | All hosting and infrastructure services must remain within the no-paid-cloud-infrastructure constraint; Railway.app, Vercel, Supabase, and Upstash are all within scope. |
| A-05 | Fresher vs. experienced classification threshold (experience years) is a configurable policy value to be confirmed by HR Operations before M2. |
| A-06 | Compensation band tier boundaries and approval matrix levels are to be confirmed by Finance and HR before M4. |
| A-07 | Offer letter template language is subject to legal review and approval before M4. |
| A-08 | SMS channel requires a third-party SMS gateway not selected for Phase 1; SMS opt-in preference is captured but delivery is not guaranteed until Phase 2. |
| A-09 | AI model accuracy targets (>90% human-AI agreement rate) are aspirational and will be tuned against real HR decisions after M2. |
| A-10 | All internal users must authenticate using a verified organisational domain for OAuth SSO. |

---

## 14. Business Rules

This section consolidates all business rules governing system behavior, decision gates, and workflow transitions.

| Rule ID | Condition | Action | Priority | Traceability |
| --- | --- | --- | --- | --- |
| BR-01 | Resume is missing or scan failed | Block AI screening; prompt candidate to re-upload | High | FR-013, WF-04 |
| BR-02 | AI confidence score is below threshold | Force mandatory HR manual review; cannot auto-advance | High | FR-023, WF-05 |
| BR-03 | Duplicate application within cooling period | Block submission; show cooling period end date | High | FR-012, WF-03 |
| BR-04 | Candidate classified as fresher | Aptitude test must be completed before coding assessment link is active | High | FR-032, FR-038, WF-11, WF-13 |
| BR-05 | Candidate classified as experienced | Can proceed directly to technical interview; aptitude is optional | High | FR-032, FR-039, WF-12, WF-14 |
| BR-06 | Any mandatory stage is incomplete | Final decision button remains disabled; missing stages listed | High | FR-049, WF-18 |
| BR-07 | Compensation band exceeds tier threshold | Require additional approver from finance or executive chain | High | FR-051, WF-19 |
| BR-08 | OTP verification fails 5 times in 15 minutes | Lock account; send recovery email; log lockout event | High | FR-002, WF-01 |
| BR-09 | Interview no-show recorded | Candidate flagged; recruiter prompted to reschedule or close | Medium | FR-042, WF-16 |
| BR-10 | Email delivery bounce after max retries | Create open recruiter task; candidate status shown as communication-failed | High | FR-059, WF-08, WF-19, WF-20 |
| BR-11 | Shortlist override requested | Requires second approver at recruiter-manager level; captured in audit | Medium | FR-033, WF-07 |
| BR-12 | Offer response deadline passes without response | Auto-expire offer; notify HR manager; record outcome as no-response | Medium | FR-053, WF-19 |
| BR-13 | Candidate withdraws application | Release slot; close workflow; send acknowledgement | Medium | FR-020, WF-03 |
| BR-14 | Admin changes scoring threshold | Old threshold frozen on existing evaluations; new threshold applies to new submits only | High | FR-024, FR-026 |
| BR-15 | Data deletion request received | Anonymize PII with legal retention of decision records per compliance period | Critical | Section 12 (Security) |
| BR-16 | AI service degraded | Enter fallback mode; queue resumes; notify operations; block new auto-advances | High | FR-025, WF-05 |
| BR-17 | Requisition is closed | Block new applications; candidates in pipeline proceed to completion | Medium | FR-063, FR-064 |
| BR-18 | Offer accepted | Decrement requisition slot; close other open applications for same requisition if seats full | High | FR-055, WF-19 |

---

## 15. API Design Standards

This section defines the REST API conventions, endpoint structure, and WebSocket event specifications for integration and development consistency.

### 15.1 REST API Conventions

| Aspect | Standard | Example |
| --- | --- | --- |
| **Base URL** | `https://api.aiinterview.app/v1` | — |
| **Authentication** | Bearer JWT in `Authorization` header | `Authorization: Bearer eyJhbGc...` |
| **Content Type** | `application/json` for request and response | `Content-Type: application/json` |
| **HTTP Methods** | GET (read), POST (create), PATCH (update), DELETE (delete) | `POST /applications` |
| **Error Response** | `{ "error": { "code": string, "message": string, "details"?: object } }` | `{ "error": { "code": "VALIDATION_FAILED", "message": "Email is required" } }` |
| **Pagination** | Cursor-based using `?after=<cursor>&limit=<n>` (max limit 100) | `/jobs?after=abc123&limit=50` |
| **Timestamps** | ISO 8601 UTC format | `2026-07-22T14:30:00.000Z` |
| **ID Format** | UUID v4 for all entity identifiers | `550e8400-e29b-41d4-a716-446655440000` |

### 15.2 Endpoint Groups

| Group | Base Path | Purpose | Key Endpoints |
| --- | --- | --- | --- |
| **Auth** | `/auth` | Registration, login, OTP verification, refresh tokens, logout | POST `/auth/register`<br>POST `/auth/login`<br>POST `/auth/verify-otp`<br>POST `/auth/refresh`<br>POST `/auth/logout` |
| **Candidates** | `/candidates` | Profile management, consent updates, notification preferences | GET `/candidates/me`<br>PATCH `/candidates/me`<br>GET `/candidates/me/preferences`<br>PATCH `/candidates/me/preferences` |
| **Jobs** | `/jobs` | Requisition listing, search, eligibility check | GET `/jobs`<br>GET `/jobs/:id`<br>POST `/jobs/:id/check-eligibility` |
| **Applications** | `/applications` | Submit, withdraw, status tracking | POST `/applications`<br>GET `/applications/:id`<br>PATCH `/applications/:id/withdraw` |
| **Resumes** | `/resumes` | Upload URL generation, confirmation, parsing status | POST `/resumes/upload-url`<br>POST `/resumes/:id/confirm`<br>GET `/resumes/:id/status` |
| **Screening** | `/screening` | AI score retrieval, threshold configuration (admin) | GET `/screening/:applicationId`<br>GET `/screening/thresholds/:jobFamily`<br>PATCH `/screening/thresholds/:jobFamily` (admin) |
| **Reviews** | `/reviews` | HR queue retrieval, decision submission, bulk actions | GET `/reviews/queue`<br>POST `/reviews/:applicationId/decide`<br>POST `/reviews/bulk-reject` |
| **Interviews** | `/interviews` | Schedule, scorecard submission, state changes | POST `/interviews/:applicationId/schedule`<br>POST `/interviews/:stageId/scorecard`<br>PATCH `/interviews/:stageId/state` |
| **Decisions** | `/decisions` | Final decision, approval chain, offer generation | POST `/decisions/:applicationId`<br>POST `/decisions/:id/approve`<br>POST `/decisions/:id/respond` (candidate) |
| **Communications** | `/communications` | Status log, template preview, resend | GET `/communications/:applicationId`<br>GET `/communications/templates/:id/preview`<br>POST `/communications/:id/resend` |
| **Audit** | `/audit` | Event log search, CSV export | GET `/audit`<br>GET `/audit/export` |
| **Admin** | `/admin` | User management, roles, policies, requisitions | GET `/admin/users`<br>POST `/admin/users`<br>PATCH `/admin/users/:id`<br>GET `/admin/requisitions`<br>POST `/admin/requisitions` |
| **Analytics** | `/analytics` | Pipeline metrics, funnel, AI accuracy, no-show rates | GET `/analytics/pipeline`<br>GET `/analytics/funnel/:requisitionId`<br>GET `/analytics/ai-accuracy` |
| **Health** | `/health` | Liveness and readiness probes | GET `/health`<br>GET `/ready` |

### 15.3 WebSocket Events

WebSocket server endpoint: `wss://api.aiinterview.app/ws`

Authentication: JWT passed during connection handshake via query parameter `?token=<jwt>`

| Event | Direction | Payload | Purpose |
| --- | --- | --- | --- |
| `queue:candidate-added` | Server → Client | `{ applicationId: string, candidateName: string, score: number, slaDeadline: ISO8601 }` | Notify HR reviewer when a new candidate enters their review queue |
| `queue:status-changed` | Server → Client | `{ applicationId: string, oldStatus: string, newStatus: string, timestamp: ISO8601 }` | Real-time status update for applications in the queue |
| `notification:new` | Server → Client | `{ type: string, title: string, body: string, link: string, timestamp: ISO8601 }` | In-app notification delivery (SLA alerts, communication failures, etc.) |
| `screening:complete` | Server → Client | `{ applicationId: string, score: number, confidence: number, timestamp: ISO8601 }` | Notify recruiter when AI screening completes |
| `interview:reminder` | Server → Client | `{ applicationId: string, candidateName: string, interviewDate: ISO8601, stage: string }` | Automated interview reminder delivery |
| `sla:breach` | Server → Client | `{ applicationId: string, stage: string, slaDeadline: ISO8601, breachTime: ISO8601 }` | Alert when SLA deadline is breached |

**Room Structure:**
- `requisition:<requisitionId>` — All recruiters and HR reviewers assigned to a specific requisition
- `user:<userId>` — Personal notification room for each authenticated user

---

## 16. Delivery Roadmap

This section outlines the phased delivery plan with milestones, scope, and success criteria.

| Milestone | Scope | Key Deliverables | Success Criteria | Timeline |
| --- | --- | --- | --- | --- |
| **M1 — Identity and Application** | Registration, Login, SSO, Apply, Resume Upload, Parse | - Candidate registration with OTP verification<br>- OAuth SSO for internal users<br>- Job search and application submission<br>- Resume upload with malware scanning<br>- AI resume parsing | Candidate can register, browse jobs, and submit an application with resume; resume is parsed within 3 minutes | Weeks 1–4 |
| **M2 — AI Screening and HR Review** | AI scoring, explainability, HR review queue, shortlist/reject, path classification | - AI match score computation<br>- Explainability factors and skill gaps<br>- HR review dashboard with queue and filters<br>- Shortlist/reject decisions with reason codes<br>- Fresher vs. experienced path classification | Recruiters can review candidates with AI explainability; shortlist and reject decisions trigger correct workflow transitions | Weeks 5–8 |
| **M3 — Interview Orchestration** | Experience routing, aptitude, programming assessment, technical interview, scorecard | - Experience-based path enforcement<br>- External assessment provider integration<br>- Timezone-aware interview scheduling<br>- Technical scorecard capture with rubric validation<br>- No-show, reschedule, and cancellation tracking | Full interview pipeline functional for both fresher and experienced paths; assessments integrate correctly; scorecards captured | Weeks 9–14 |
| **M4 — Decision and Offer Governance** | HR Round, final decision, approval chain, offer letter, response tracking | - HR round scorecard capture<br>- Final decision workflow with prerequisite gates<br>- Compensation band-based approval matrix<br>- Offer letter generation with token resolution<br>- Offer response tracking with reminders | End-to-end decision workflow from HR round to offer dispatch; approval chain enforces band policies; offers tracked to acceptance/expiry | Weeks 15–18 |
| **M5 — Communications and Notifications** | Full template system, multi-channel delivery, retry, preference centre | - Tokenized email templates for all communications<br>- Multi-channel notifications (in-app + email)<br>- Retry with exponential backoff<br>- Notification preference centre<br>- WebSocket real-time updates | All outbound communications automated and audited; delivery failures handled with retries; real-time notifications functional | Weeks 19–20 |
| **M6 — Analytics, Admin, and Go-Live** | Pipeline metrics, admin panel, threshold editor, audit viewer, load testing, security scan | - Recruiter analytics dashboard<br>- Admin panel for users, roles, policies<br>- Audit log viewer with search and export<br>- Platform health dashboard<br>- Load testing (200 concurrent sessions)<br>- Security scan (OWASP ZAP)<br>- Production deployment with monitoring | Production-ready platform with full observability, compliance, and operational tools; load tested and security validated; go-live readiness confirmed | Weeks 21–24 |

**Total Duration:** 24 weeks (6 months)

---

## 17. Glossary and Open Issues

### 17.1 Glossary

| Term | Definition |
| --- | --- |
| **ATS** | Applicant Tracking System — the broader category of software this platform partially replaces |
| **RBAC** | Role-Based Access Control — permission model where access rights are assigned to roles |
| **RLS** | Row-Level Security — PostgreSQL / Supabase feature restricting row access by policy |
| **JWT** | JSON Web Token — signed token used for stateless authentication and claims |
| **SLA** | Service Level Agreement — the agreed time window within which a stage action must be completed |
| **RPO** | Recovery Point Objective — maximum acceptable data loss measured in time |
| **RTO** | Recovery Time Objective — maximum acceptable system downtime after an incident |
| **Idempotent** | An operation that produces the same result when executed multiple times |
| **BullMQ** | Redis-backed job queue library for Node.js used for background processing |
| **Fresher Path** | Hiring track for candidates with limited experience: Aptitude → Programming → Technical |
| **Experienced Path** | Hiring track for experienced candidates: Technical Interview → Programming → Technical |
| **Confidence Band** | Categorical classification of AI score reliability: High (>80%), Medium (50–80%), Low (<50%) |
| **Stage Guard** | Server-side rule that prevents a state transition until all preconditions are met |
| **Approval Matrix** | Configuration defining which approvers are required based on compensation band level |
| **Tokenized Template** | Email template with placeholder tokens (e.g., `{{candidate.firstName}}`) resolved at send time |
| **Fallback Mode** | Degraded-service state when AI worker is unavailable; resumes queue for batch processing |
| **Audit Event** | Immutable record of every meaningful system or user action, written to an append-only log |
| **Canonical ID** | The single, permanent identifier for an entity that persists across all systems and stages |
| **WebSocket Room** | Logical grouping of connected clients for targeted real-time event delivery |
| **HMAC** | Hash-based Message Authentication Code — used to verify webhook callback authenticity |
| **Presigned URL** | Time-limited URL for direct file upload to object storage without backend proxy |

### 17.2 Open Issues

| Issue ID | Description | Owner | Target Resolution | Priority |
| --- | --- | --- | --- | --- |
| OI-001 | Define exact experience year threshold for fresher vs. experienced classification | HR Operations | M2 | High |
| OI-002 | Define compensation band tier boundaries and approval matrix levels | Finance + HR | M4 | High |
| OI-003 | Complete vendor evaluation and selection for external assessment provider | Engineering + Procurement | M1 | Critical |
| OI-004 | Legal review and approval of offer letter template language | Legal | M4 | High |
| OI-005 | Determine which locales are required for go-live (beyond English) | Product | M5 | Medium |
| OI-006 | Evaluate whether Grafana Cloud or dedicated BI tool is needed for analytics post-launch | Engineering | M6 | Low |
| OI-007 | Confirm Supabase free tier capacity limits and upgrade trigger thresholds | Engineering + Operations | M2 | High |
| OI-008 | Define SMS gateway provider for Phase 2 multi-channel notifications | Engineering + Procurement | Post M6 | Low |
| OI-009 | Establish quarterly disaster recovery drill schedule and runbook ownership | Operations | M6 | Medium |
| OI-010 | Finalize accessibility audit scope and schedule with external auditor | QA + Product | M5 | Medium |

---

**End of Specification Document**

**Approval Sign-Off:**

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Product Owner | _______________ | _______________ | _______________ |
| Lead Architect | _______________ | _______________ | _______________ |
| QA Lead | _______________ | _______________ | _______________ |
| Engineering Manager | _______________ | _______________ | _______________ |
