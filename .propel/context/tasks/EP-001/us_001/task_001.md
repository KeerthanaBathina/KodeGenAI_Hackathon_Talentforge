---
id: task_001
us_id: us_001
epic: EP-001
title: "Design Candidate Registration and OTP Persistence Schema"
status: done
layer: backend
effort: 3h
priority: critical
created: 2026-07-24
---

# TASK-001 - Design Candidate Registration and OTP Persistence Schema

## Context

**User Story**: US-001 - Candidate Self-Registration with OTP Email Verification  
**Epic**: EP-001 - Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 1, Scenario 2, Scenario 3, Scenario 4

The current data model must support a pending-to-active registration lifecycle, OTP issuance and expiry, and secure verification auditing. This task establishes the canonical schema contract required by downstream API and UI tasks.

---

## Objective

Add Prisma schema fields and migration artefacts required for candidate self-registration with OTP verification:

- candidate account status lifecycle (`pending_verification`, `active`)
- unique public candidate identifier assignment after successful verification
- OTP challenge storage using hashed OTP values and strict expiry timestamps

---

## Technical Specifications

| Entity | Change | Constraint |
|--------|--------|------------|
| `candidates` | add `status` | enum-backed, default `pending_verification` |
| `candidates` | add `candidate_public_id` | nullable before verification, unique after assignment |
| `otp_challenges` | new table | one-time OTP hash, expiry, consumed timestamp |
| `otp_challenges` | foreign key | candidate relation with cascade delete |
| `otp_challenges` | index | query by candidate + purpose + latest created |

Recommended OTP storage policy:
- Never store OTP in plaintext.
- Store `otp_hash` using SHA-256 with application salt.
- Add `expires_at` and `consumed_at` columns.
- Use six-digit numeric OTP format (`000000` - `999999`).

---

## Implementation Steps

### Step 1 - Update Prisma schema

Edit `backend/prisma/schema.prisma`:

1. Add candidate registration status enum.
2. Extend `Candidate` model with verification lifecycle fields.
3. Create `OtpChallenge` model with relation to candidate.
4. Add supporting indexes and uniqueness constraints.

### Step 2 - Create migration

Create migration folder (timestamped) and `migration.sql` that:

1. creates new enum/type definitions if needed,
2. alters `candidates` table,
3. creates `otp_challenges` table,
4. adds indexes and FK constraints.

### Step 3 - Validate migration integrity

Run:

```bash
cd backend
npm run migrate:status
npm run migrate:diff
```

Expected:
- Migration chain remains consistent.
- Drift check is clean after applying migration in test/staging environment.

---

## Validation

| Check | Method | Expected Result |
|-------|--------|-----------------|
| Candidate status default | insert candidate without status | stored as `pending_verification` |
| Public ID uniqueness | assign same public ID twice | second write fails unique constraint |
| OTP record creation | insert OTP challenge row | row persisted with expiry and hash |
| OTP one-time use support | set `consumed_at` | subsequent verification path can reject |

---

## Dependencies

- EP-DATA baseline candidate model already present.
- Prisma migration framework from EP-DATA US-004 is available.

## Security Constraints

- **OWASP A02 (Cryptographic Failures)**: OTP values must never be stored plaintext.
- **OWASP A01 (Broken Access Control)**: direct table writes should be limited to backend service role.

---

## Definition of Done

- [ ] Candidate status lifecycle fields added in schema
- [ ] Candidate public ID field added with uniqueness guarantees
- [ ] OTP challenge table created with hash + expiry + consumed lifecycle
- [ ] Migration SQL committed and applies cleanly
- [ ] `npm run migrate:status` and `npm run migrate:diff` pass

## Traceability

| Artefact | ID |
|----------|----|
| User Story | US-001 |
| Epic | EP-001 |
| Scenario | 1, 2, 3, 4 |
| FR | FR-001, FR-003, FR-006 |
