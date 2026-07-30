# US-001 Manual Setup Checklist

## Goal

Complete required external setup for OTP email verification and validation capture.

## 1. Environment Variables

Add or confirm these values in the backend environment:

- [ ] `DATABASE_URL`
- [ ] `DIRECT_URL`
- [ ] `OTP_HASH_SALT`
- [ ] `OTP_EXPIRY_MINUTES` (default `15`)
- [ ] `EMAIL_PROVIDER` (for example: smtp/mock)
- [ ] `EMAIL_FROM`

## 2. SMTP / Email Provider Readiness

- [ ] Configure provider credentials in secrets manager or platform env vars.
- [ ] Verify sender identity/domain used by `EMAIL_FROM`.
- [ ] Confirm sandbox restrictions (if any) and approved recipient behavior.

## 3. Test Data and Database State

- [ ] Ensure migration for OTP schema is applied.
- [ ] Confirm test candidate email inbox is accessible for OTP retrieval.
- [ ] Clear stale OTP test records before E2E runs.

## 4. CI Secrets and Pipelines

- [ ] Add any OTP/email provider secrets needed by CI integration tests.
- [ ] Confirm CI pipeline executes backend + frontend + Playwright jobs.

## 5. Story Closure Checklist

- [ ] Evidence doc created at `docs/validation/ep_001_us_001_validation_evidence.md`.
- [ ] All US-001 DoD checkboxes checked in story file.
- [ ] `status` in US-001 set to `done` after all evidence is green.
- [ ] All task files in this folder marked `done` at closure.
