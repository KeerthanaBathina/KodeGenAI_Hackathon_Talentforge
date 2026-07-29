---
id: TASK-005
user_story: US-002
title: "Database Migration - Policy Version Tracking Schema Updates"
status: todo
priority: high
assigned_to: backend-team
estimated_hours: 4
layer: database
dependencies: [TASK-001]
---

# TASK-005 — Database Migration - Policy Version Tracking Schema Updates

## Objective

Create database migration to add policy version tracking columns and indexes for effective-date isolation.

## Scope

Update schema to link applications with specific policy versions used at screening time, ensuring in-flight isolation.

## Technical Requirements

### 1. Add Policy Version References to Applications

Update Application table to track which policy versions were used:

```prisma
model Application {
  // ... existing fields

  // Policy version tracking for in-flight isolation
  screeningThresholdId  String?             @db.Uuid
  scoringThresholdId    String?             @db.Uuid
  approvalPolicyId      String?             @db.Uuid

  screeningThreshold    ScreeningThreshold? @relation(fields: [screeningThresholdId], references: [id])
  scoringThreshold      ScoringThreshold?   @relation(fields: [scoringThresholdId], references: [id])
  approvalPolicy        ApprovalPolicy?     @relation(fields: [approvalPolicyId], references: [id])

  @@index([screeningThresholdId], name: "idx_application_screening_threshold")
  @@index([scoringThresholdId], name: "idx_application_scoring_threshold")
  @@index([approvalPolicyId], name: "idx_application_approval_policy")
}
```

### 2. Update Existing Models

Ensure all policy models have proper indexes:

```prisma
model ScreeningThreshold {
  // Add back-reference for applications using this threshold
  applications Application[]

  // Existing indexes are sufficient
  @@index([effectiveFrom(sort: Desc)], name: "idx_screening_thresholds_effective")
}

model ScoringThreshold {
  // Add back-reference
  applications Application[]

  // Existing indexes are sufficient
  @@index([jobFamilyId, effectiveFrom(sort: Desc)], name: "idx_scoring_thresholds_jf_effective")
}

model ApprovalPolicy {
  // Add back-reference
  applications Application[]

  // Existing indexes are sufficient
  @@index([compensationBandMin, compensationBandMax, effectiveFrom(sort: Desc)], name: "idx_approval_policies_band_effective")
}
```

### 3. Add Audit Fields to ScreeningThreshold

Currently ScreeningThreshold doesn't track who created versions:

```prisma
model ScreeningThreshold {
  id                 String   @id @default(uuid()) @db.Uuid
  shortlistThreshold Int
  borderlineMin      Int
  borderlineMax      Int
  rejectThreshold    Int
  version            Int      @default(1)
  effectiveFrom      DateTime @default(now()) @db.Timestamptz
  createdAt          DateTime @default(now()) @db.Timestamptz

  // Add creator tracking
  createdById        String?  @db.Uuid
  createdBy          User?    @relation("ScreeningThresholdAuthor", fields: [createdById], references: [id], onDelete: SetNull)

  applications       Application[]

  @@index([effectiveFrom(sort: Desc)], name: "idx_screening_thresholds_effective")
  @@map("screening_thresholds")
}

model User {
  // ... existing fields
  screeningThresholdsCreated ScreeningThreshold[] @relation("ScreeningThresholdAuthor")
}
```

### 4. Migration Steps

**File:** `/backend/prisma/migrations/YYYYMMDDHHMMSS_add_policy_version_tracking/migration.sql`

```sql
-- Step 1: Add policy version reference columns to applications table
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "screening_threshold_id" UUID;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "scoring_threshold_id" UUID;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "approval_policy_id" UUID;

-- Step 2: Add creator tracking to screening_thresholds
ALTER TABLE "screening_thresholds" ADD COLUMN IF NOT EXISTS "created_by_id" UUID;

-- Step 3: Add foreign key constraints
ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_screening_threshold"
  FOREIGN KEY ("screening_threshold_id")
  REFERENCES "screening_thresholds"("id")
  ON DELETE SET NULL;

ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_scoring_threshold"
  FOREIGN KEY ("scoring_threshold_id")
  REFERENCES "scoring_thresholds"("id")
  ON DELETE SET NULL;

ALTER TABLE "applications"
  ADD CONSTRAINT "fk_application_approval_policy"
  FOREIGN KEY ("approval_policy_id")
  REFERENCES "approval_policies"("id")
  ON DELETE SET NULL;

ALTER TABLE "screening_thresholds"
  ADD CONSTRAINT "fk_screening_threshold_creator"
  FOREIGN KEY ("created_by_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_application_screening_threshold"
  ON "applications"("screening_threshold_id");

CREATE INDEX IF NOT EXISTS "idx_application_scoring_threshold"
  ON "applications"("scoring_threshold_id");

CREATE INDEX IF NOT EXISTS "idx_application_approval_policy"
  ON "applications"("approval_policy_id");

CREATE INDEX IF NOT EXISTS "idx_screening_threshold_creator"
  ON "screening_thresholds"("created_by_id");

-- Step 5: Backfill existing applications with current thresholds
-- (For existing applications without policy version tracking)
UPDATE "applications" a
SET "screening_threshold_id" = (
  SELECT st.id
  FROM "screening_thresholds" st
  WHERE st.effective_from <= a.submitted_at
  ORDER BY st.effective_from DESC
  LIMIT 1
)
WHERE a.submitted_at IS NOT NULL
  AND a.screening_threshold_id IS NULL;

-- Backfill scoring thresholds (requires job family lookup)
UPDATE "applications" a
SET "scoring_threshold_id" = (
  SELECT sct.id
  FROM "scoring_thresholds" sct
  JOIN "requisitions" r ON r.job_family_id = sct.job_family_id
  WHERE a.requisition_id = r.id
    AND sct.effective_from <= a.submitted_at
  ORDER BY sct.effective_from DESC
  LIMIT 1
)
WHERE a.submitted_at IS NOT NULL
  AND a.scoring_threshold_id IS NULL;

-- Step 6: Add comment documentation
COMMENT ON COLUMN "applications"."screening_threshold_id" IS 'References the screening threshold version used when this application was screened. Ensures in-flight applications are not affected by policy changes.';
COMMENT ON COLUMN "applications"."scoring_threshold_id" IS 'References the scoring threshold version used when this application was scored. Ensures in-flight applications are not affected by policy changes.';
COMMENT ON COLUMN "applications"."approval_policy_id" IS 'References the approval policy version used when this application reached the approval stage. Ensures in-flight applications are not affected by policy changes.';
```

### 5. Rollback Migration

**File:** `/backend/prisma/migrations/YYYYMMDDHHMMSS_add_policy_version_tracking/rollback.sql`

```sql
-- Remove foreign key constraints
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "fk_application_screening_threshold";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "fk_application_scoring_threshold";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "fk_application_approval_policy";
ALTER TABLE "screening_thresholds" DROP CONSTRAINT IF EXISTS "fk_screening_threshold_creator";

-- Remove indexes
DROP INDEX IF EXISTS "idx_application_screening_threshold";
DROP INDEX IF EXISTS "idx_application_scoring_threshold";
DROP INDEX IF EXISTS "idx_application_approval_policy";
DROP INDEX IF EXISTS "idx_screening_threshold_creator";

-- Remove columns
ALTER TABLE "applications" DROP COLUMN IF EXISTS "screening_threshold_id";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "scoring_threshold_id";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "approval_policy_id";
ALTER TABLE "screening_thresholds" DROP COLUMN IF EXISTS "created_by_id";
```

### 6. Post-Migration Validation Script

**File:** `/backend/scripts/validate-policy-version-migration.ts`

```typescript
import prisma from "../src/db/prisma";

async function validateMigration() {
  console.log("Validating policy version tracking migration...");

  // Check columns exist
  const applicationSchema = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'applications' 
      AND column_name IN ('screening_threshold_id', 'scoring_threshold_id', 'approval_policy_id')
  `;

  console.log("✓ Application columns exist:", applicationSchema);

  // Check indexes exist
  const indexes = await prisma.$queryRaw`
    SELECT indexname 
    FROM pg_indexes 
    WHERE tablename = 'applications' 
      AND indexname LIKE 'idx_application_%threshold'
  `;

  console.log("✓ Indexes created:", indexes);

  // Check backfill completeness
  const applicationsWithoutThreshold = await prisma.application.count({
    where: {
      submittedAt: { not: null },
      screeningThresholdId: null,
    },
  });

  console.log(
    `Applications without threshold: ${applicationsWithoutThreshold}`,
  );

  if (applicationsWithoutThreshold > 0) {
    console.warn(
      `⚠️  ${applicationsWithoutThreshold} submitted applications missing threshold reference`,
    );
  } else {
    console.log("✓ All submitted applications have threshold references");
  }

  console.log("\nMigration validation complete!");
}

validateMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Validation failed:", error);
    process.exit(1);
  });
```

## Acceptance Criteria

- [ ] Migration adds policy version columns to applications table
- [ ] Foreign key constraints properly configured with ON DELETE SET NULL
- [ ] Indexes created for all new foreign key columns
- [ ] Existing applications backfilled with correct policy versions
- [ ] Rollback migration tested and works correctly
- [ ] Validation script confirms migration success
- [ ] No data loss during migration
- [ ] Performance impact tested on large tables

## Testing Requirements

- Test migration on development database
- Test migration on staging database with production data volume
- Test rollback migration
- Verify backfill logic with test data
- Performance test queries using new indexes
- Verify foreign key constraints work correctly

## Files to Create

- Migration file with up and down migrations
- Validation script
- Documentation on backfill logic

## Deployment Plan

1. **Pre-deployment:**
   - Backup production database
   - Test migration on staging with production-like data
   - Run validation script on staging
   - Verify query performance

2. **Deployment:**
   - Run migration during maintenance window
   - Run validation script
   - Monitor query performance
   - Verify application behavior

3. **Post-deployment:**
   - Monitor for missing threshold references
   - Check slow query log for performance issues
   - Verify audit logs for policy changes

4. **Rollback Plan:**
   - If issues detected, run rollback migration
   - Restore from backup if necessary
   - Policy version tracking will be disabled but applications continue working

## Related User Story

**US-002 Acceptance Criteria:**

- ✅ Scenario 1: In-flight isolation enabled by policy version tracking
- ✅ Scenario 4: Approval policy change applies to new decisions only

## Dependencies

- TASK-001 (Service layer must be ready to use new columns)
- Prisma Client regeneration after schema update

## Performance Considerations

- Index all foreign key columns
- Backfill during low-traffic period
- Monitor query performance after migration
- Consider partitioning if application table is very large

## Notes

- ON DELETE SET NULL preserves application data even if policy deleted
- Backfill uses submission date to determine correct policy version
- Existing applications continue working if backfill incomplete
- Future applications will always have policy version set
