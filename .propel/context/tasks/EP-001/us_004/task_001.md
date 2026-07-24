---
id: task_001
us_id: us_004
epic: EP-001
title: "Create Password Reset Token Schema and Migration"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create Password Reset Token Schema and Migration

## Context

**User Story**: US-004 — Forgot Password with Time-Limited Reset Link  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 3 (60-minute expiry), Scenario 4 (single-use token)

To implement secure password reset functionality, the system needs to store time-limited, single-use tokens that can be invalidated after consumption. This schema change enables tracking of reset requests with proper expiry and usage state.

---

## Objective

Create a database table to store password reset tokens with:
- Unique token identifier (UUID or signed token hash)
- Associated user/candidate reference
- Expiry timestamp (60 minutes from creation)
- Usage status flag
- Creation and consumption timestamps
- IP address and user agent for security auditing

---

## Technical Specifications

| Field | Type | Constraint | Purpose |
|-------|------|------------|---------|
| `id` | UUID | Primary key | Unique token identifier |
| `candidate_id` | UUID | Foreign key, indexed | Links to candidate/user |
| `token` | String | Unique, indexed | Signed token or hash for URL |
| `expires_at` | Timestamp | Not null, indexed | 60-minute expiry from creation |
| `used_at` | Timestamp | Nullable | Marks token as consumed |
| `ip_address` | String | Nullable | Request origin for audit |
| `user_agent` | String | Nullable | Browser/client for audit |
| `created_at` | Timestamp | Default now() | Token generation time |

**Indexes**:
- `token` (unique) — Fast token lookup during validation
- `candidate_id, expires_at` — Query active tokens per user
- `expires_at` — Cleanup expired tokens via cron job

**Constraints**:
- Token must be unique across all rows
- `expires_at` must be > `created_at`
- Foreign key cascade: delete tokens when candidate deleted

---

## Implementation Steps

### Step 1 — Update Prisma Schema

Edit `backend/prisma/schema.prisma`:

```prisma
model PasswordResetToken {
  id           String    @id @default(uuid())
  candidateId  String    @map("candidate_id")
  token        String    @unique // Signed JWT or HMAC hash
  expiresAt    DateTime  @map("expires_at")
  usedAt       DateTime? @map("used_at")
  ipAddress    String?   @map("ip_address")
  userAgent    String?   @map("user_agent")
  createdAt    DateTime  @default(now()) @map("created_at")

  // Relations
  candidate    Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@index([candidateId, expiresAt])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}

// Add to Candidate model
model Candidate {
  // ... existing fields ...
  
  passwordResetTokens PasswordResetToken[]
  
  // ... existing relations ...
}
```

### Step 2 — Generate Migration

```bash
cd backend
npx prisma migrate dev --name add_password_reset_tokens
npx prisma generate
```

### Step 3 — Verify Migration SQL

Review generated SQL to ensure:
- Table created with correct columns and types
- Indexes created for `token`, `candidateId + expiresAt`, `expiresAt`
- Foreign key constraint to `candidates` table
- Default values and nullability correct

### Step 4 — Create Cleanup Script (Optional)

Create `backend/scripts/cleanup-expired-tokens.ts` for scheduled cleanup:

```typescript
import prisma from '../src/db/prisma';

async function cleanupExpiredTokens() {
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });
  
  console.log(`Deleted ${result.count} expired reset tokens`);
}

cleanupExpiredTokens()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Add to package.json scripts:
```json
{
  "scripts": {
    "cleanup:tokens": "tsx scripts/cleanup-expired-tokens.ts"
  }
}
```

---

## Acceptance Criteria

- [x] `password_reset_tokens` table created with all specified fields
- [x] Indexes on `token`, `candidate_id + expires_at`, `expires_at`
- [x] Foreign key relationship to `candidates` table
- [x] Migration applies without errors
- [x] Prisma Client regenerated with new model types
- [x] Type-safe access to `candidate.passwordResetTokens` relation

---

## Dependencies

- Prisma schema must include `Candidate` model
- Database must support cascading deletes

---

## Testing

```typescript
// Verify schema in tests
import prisma from '../src/db/prisma';

describe('PasswordResetToken Schema', () => {
  it('should create token with 60-minute expiry', async () => {
    const candidate = await prisma.candidate.create({
      data: { email: 'test@example.com', /* ... */ },
    });

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const token = await prisma.passwordResetToken.create({
      data: {
        candidateId: candidate.id,
        token: 'unique-token-hash',
        expiresAt,
      },
    });

    expect(token.id).toBeDefined();
    expect(token.usedAt).toBeNull();
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});
```

---

## Notes

- Token field stores a signed JWT or HMAC-SHA256 hash of UUID + secret
- Consider adding `revoked_at` field for manual token invalidation
- Implement periodic cleanup job in production (daily cron)
