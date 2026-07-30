# EP-001 / US-001 Validation Evidence

Date: 2026-07-24
Environment: Backend (Supabase staging DB + local test execution), Frontend (local Next.js + Playwright)
Validator: GitHub Copilot

## Migration and schema readiness

### Prisma generate

```text
npx prisma generate
Generated Prisma Client (v5.19.1)
```

### Migration deployment

```text
npm run migrate:deploy
Applying migration `202607240003_add_candidate_registration_otp`
All migrations have been successfully applied.
```

### Migration status

```text
npm run migrate:status
5 migrations found in prisma/migrations
Database schema is up to date!
```

## Backend quality checks

### Type check

```text
npm run type-check
exit 0
```

### Unit and route tests

```text
npm test
Test Files 11 passed (11)
Tests 63 passed (63)
```

Coverage highlights:
- `src/services/__tests__/authService.test.ts`
  - registration creates pending account and OTP challenge
  - duplicate email returns generic response
  - weak password rejected
  - verify OTP activates candidate and assigns public ID
  - expired OTP returns OTP_EXPIRED
  - resend OTP behavior validated
- `src/routes/__tests__/auth.test.ts`
  - register/verify/resend endpoint contracts validated
  - expired OTP route returns required UX message payload

## Frontend quality checks

### Type check

```text
cd frontend && npm run type-check
exit 0
```

### Unit tests

```text
cd frontend && npm test
Test Files 3 passed (3)
Tests 6 passed (6)
```

Validated UI behaviors:
- register form password policy validation
- register success redirects to `/verify-otp`
- verify OTP success redirects to `/onboarding/profile`
- expired OTP shows `Code expired - please request a new one` and resend option

## Playwright E2E

```text
cd frontend && npm run test:e2e
2 passed
```

Scenarios covered:
1. Happy path: register -> verify OTP -> onboarding redirect
2. Expired OTP: required error message + resend action visible

## Acceptance criteria trace

| Scenario | Evidence | Result |
|----------|----------|--------|
| 1. Successful registration and OTP delivery | Auth service + route tests; Playwright happy path | PASS |
| 2. Correct OTP activates account | Auth service test verifies status transition and candidate ID assignment | PASS |
| 3. Expired OTP shows resend flow | Route tests + frontend unit + Playwright expired path | PASS |
| 4. Duplicate email is non-enumerating | Auth service + route contract (generic message) | PASS |

## Notes

- The migration initially failed due PostgreSQL enum transaction safety; it was corrected and applied successfully.
- Playwright browsers were installed with `npx playwright install chromium` before E2E execution.
