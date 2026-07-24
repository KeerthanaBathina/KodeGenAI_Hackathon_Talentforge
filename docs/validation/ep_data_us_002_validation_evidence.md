# EP-DATA / US-002 Validation Evidence

Date: 2026-07-24
Environment: Supabase staging
Validator: GitHub Copilot

## Migration and setup

### prisma migrate status

```text
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "postgres", schema "public" at "aws-1-ap-northeast-2.pooler.supabase.com:5432"

3 migrations found in prisma/migrations

Database schema is up to date!
```

### prisma db seed

```text
Running seed command `tsx prisma/seed.ts` ...
Seeding reason_codes ...
  12 reason codes upserted.
Seeding approval_policies ...
  6 approval policies seeded.
Seeding templates ...
  11 templates upserted.

The seed command has been executed.
```

## Scenario 1 - Threshold effective-date isolation

```text
Threshold at today: 0.7000
Threshold at tomorrow: 0.7500
```

Result: PASS. Old threshold applies for current day, future threshold activates on effective date.

## Scenario 2 - Reason code seed and FK restrict

```text
Reason code counts by category: [
  {
    "category": "interview_cancellation",
    "cnt": 2
  },
  {
    "category": "rejection",
    "cnt": 8
  },
  {
    "category": "withdrawal",
    "cnt": 2
  }
]
PASS: reason code delete blocked by FK RESTRICT (P2003)
```

Result: PASS. Seeded total reason codes = 12 (>= 10), and FK restriction is enforced.

## Scenario 3 - Offer template token rendering

```text
Missing tokens: []
Rendered subject: Congratulations Jane Smith - Offer for Senior Engineer
Contains unresolved token pattern: false
```

Result: PASS. Offer template resolves required tokens and leaves no raw token placeholders.

## Scenario 4 - Approval chain for L5

```text
Active policy rows: 6
L5 policy approvers: ["hiring_manager","hr_manager","finance_director"]
```

Result: PASS. L5 chain returns the expected 3-tier approver list.

## Test and type-check summary

```text
npm test -> 8 passed files, 42 passed tests, 0 failed
npm run type-check -> exit 0
```

## Final status

All US-002 acceptance criteria scenarios passed with evidence.
