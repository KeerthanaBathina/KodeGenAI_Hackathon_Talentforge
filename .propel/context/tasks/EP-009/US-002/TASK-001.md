---
id: TASK-001
user_story: US-002
title: "Backend - Policy Versioning Service Layer"
status: todo
priority: high
assigned_to: backend-team
estimated_hours: 10
layer: backend
dependencies: []
---

# TASK-001 — Backend - Policy Versioning Service Layer

## Objective

Implement comprehensive versioning service for AI screening thresholds, approval policies, and hiring rules with effective date isolation.

## Scope

Extend existing policy services to support full versioning, history tracking, and effective-date queries that prevent retroactive policy application.

## Technical Requirements

### 1. Enhanced Threshold Service

Update `/backend/src/services/thresholdService.ts`:

#### New Functions

**Create New Threshold Version:**

```typescript
export async function createScreeningThresholdVersion(
  data: {
    shortlistThreshold: number;
    borderlineMin: number;
    borderlineMax: number;
    rejectThreshold: number;
    effectiveFrom: Date;
  },
  createdBy: string,
): Promise<ScreeningThresholds> {
  // Validate thresholds
  validateThresholdRanges(data);

  // Get latest version
  const latestVersion = await prisma.screeningThreshold.findFirst({
    orderBy: { version: "desc" },
  });

  const newVersion = (latestVersion?.version || 0) + 1;

  // Create new version
  const threshold = await prisma.screeningThreshold.create({
    data: {
      ...data,
      version: newVersion,
    },
  });

  // Clear cache
  clearThresholdCache();

  // Log audit event
  await auditService.logEvent({
    action: "threshold.version_created",
    actorId: createdBy,
    resourceType: "ScreeningThreshold",
    resourceId: threshold.id,
    metadata: {
      version: newVersion,
      effectiveFrom: threshold.effectiveFrom,
      oldValues: latestVersion
        ? {
            shortlistThreshold: latestVersion.shortlistThreshold,
            borderlineMin: latestVersion.borderlineMin,
            borderlineMax: latestVersion.borderlineMax,
            rejectThreshold: latestVersion.rejectThreshold,
          }
        : null,
      newValues: {
        shortlistThreshold: data.shortlistThreshold,
        borderlineMin: data.borderlineMin,
        borderlineMax: data.borderlineMax,
        rejectThreshold: data.rejectThreshold,
      },
    },
  });

  return threshold;
}
```

**Get Effective Threshold at Specific Date:**

```typescript
export async function getEffectiveThreshold(
  asOfDate: Date = new Date(),
): Promise<ScreeningThresholds> {
  const threshold = await prisma.screeningThreshold.findFirst({
    where: {
      effectiveFrom: { lte: asOfDate },
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });

  if (!threshold) {
    throw new PolicyNotFoundError("No effective screening threshold found");
  }

  return threshold;
}
```

**Get Threshold History:**

```typescript
export async function getThresholdHistory(
  limit: number = 50,
): Promise<Array<ScreeningThresholds & { changedBy?: string }>> {
  return await prisma.screeningThreshold.findMany({
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
}
```

**Validation Function:**

```typescript
function validateThresholdRanges(data: {
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
}): void {
  const errors: string[] = [];

  // All values must be 0-100
  if (data.shortlistThreshold < 0 || data.shortlistThreshold > 100) {
    errors.push("Shortlist threshold must be between 0 and 100");
  }
  if (data.borderlineMin < 0 || data.borderlineMin > 100) {
    errors.push("Borderline min must be between 0 and 100");
  }
  if (data.borderlineMax < 0 || data.borderlineMax > 100) {
    errors.push("Borderline max must be between 0 and 100");
  }
  if (data.rejectThreshold < 0 || data.rejectThreshold > 100) {
    errors.push("Reject threshold must be between 0 and 100");
  }

  // Logical order: reject < borderlineMin < borderlineMax < shortlist
  if (data.rejectThreshold >= data.borderlineMin) {
    errors.push("Reject threshold must be less than borderline min");
  }
  if (data.borderlineMin >= data.borderlineMax) {
    errors.push("Borderline min must be less than borderline max");
  }
  if (data.borderlineMax >= data.shortlistThreshold) {
    errors.push("Borderline max must be less than shortlist threshold");
  }

  if (errors.length > 0) {
    throw new ValidationError("Invalid threshold values", errors);
  }
}
```

### 2. Enhanced Scoring Threshold Service

Create `/backend/src/services/scoringThresholdService.ts`:

```typescript
export async function createScoringThresholdVersion(
  data: {
    jobFamilyId: string;
    aiShortlistThreshold: number; // 0.0-1.0
    confidenceThreshold: number; // 0.0-1.0
    experienceThresholdYears: number;
    effectiveFrom: Date;
  },
  createdBy: string,
): Promise<ScoringThreshold> {
  // Validate ranges
  if (data.aiShortlistThreshold < 0 || data.aiShortlistThreshold > 1) {
    throw new ValidationError("AI shortlist threshold must be between 0 and 1");
  }
  if (data.confidenceThreshold < 0 || data.confidenceThreshold > 1) {
    throw new ValidationError("Confidence threshold must be between 0 and 1");
  }
  if (data.experienceThresholdYears < 0 || data.experienceThresholdYears > 50) {
    throw new ValidationError(
      "Experience threshold must be between 0 and 50 years",
    );
  }

  // Get existing threshold for comparison
  const existing = await getEffectiveScoringThreshold(
    data.jobFamilyId,
    new Date(),
  );

  // Create new version
  const threshold = await prisma.scoringThreshold.create({
    data: {
      ...data,
      createdById: createdBy,
    },
  });

  // Log audit event
  await auditService.logEvent({
    action: "scoring_threshold.version_created",
    actorId: createdBy,
    resourceType: "ScoringThreshold",
    resourceId: threshold.id,
    metadata: {
      jobFamilyId: data.jobFamilyId,
      effectiveFrom: threshold.effectiveFrom,
      oldValues: existing
        ? {
            aiShortlistThreshold: existing.aiShortlistThreshold.toString(),
            confidenceThreshold: existing.confidenceThreshold.toString(),
            experienceThresholdYears: existing.experienceThresholdYears,
          }
        : null,
      newValues: {
        aiShortlistThreshold: data.aiShortlistThreshold,
        confidenceThreshold: data.confidenceThreshold,
        experienceThresholdYears: data.experienceThresholdYears,
      },
    },
  });

  return threshold;
}

export async function getEffectiveScoringThreshold(
  jobFamilyId: string,
  asOfDate: Date = new Date(),
): Promise<ScoringThreshold | null> {
  return await prisma.scoringThreshold.findFirst({
    where: {
      jobFamilyId,
      effectiveFrom: { lte: asOfDate },
    },
    orderBy: {
      effectiveFrom: "desc",
    },
    include: {
      jobFamily: true,
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
}

export async function getScoringThresholdHistory(
  jobFamilyId: string,
  limit: number = 50,
): Promise<ScoringThreshold[]> {
  return await prisma.scoringThreshold.findMany({
    where: { jobFamilyId },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
}
```

### 3. Enhanced Approval Policy Service

Update `/backend/src/services/approvalPolicyService.ts`:

```typescript
export async function createApprovalPolicyVersion(
  data: {
    compensationBandMin: Decimal;
    compensationBandMax: Decimal;
    requiredApprovers: ApprovalTier[];
    effectiveFrom: Date;
  },
  createdBy: string,
): Promise<ApprovalPolicy> {
  // Validate compensation band
  if (data.compensationBandMin.gte(data.compensationBandMax)) {
    throw new ValidationError("Min compensation must be less than max");
  }

  // Validate approvers
  for (const approver of data.requiredApprovers) {
    const user = await prisma.user.findUnique({
      where: { id: approver.approverId },
    });
    if (!user || !user.active) {
      throw new ValidationError(
        `Approver ${approver.approverId} not found or inactive`,
      );
    }
  }

  // Get existing policy for comparison
  const existing = await getApprovalPolicy(data.compensationBandMin);

  // Create new version
  const policy = await prisma.approvalPolicy.create({
    data: {
      compensationBandMin: data.compensationBandMin,
      compensationBandMax: data.compensationBandMax,
      requiredApprovers: data.requiredApprovers as any,
      effectiveFrom: data.effectiveFrom,
      createdById: createdBy,
      active: true,
    },
  });

  // Log audit event with before/after
  await auditService.logEvent({
    action: "approval_policy.version_created",
    actorId: createdBy,
    resourceType: "ApprovalPolicy",
    resourceId: policy.id,
    metadata: {
      compensationBand: `${data.compensationBandMin}-${data.compensationBandMax}`,
      effectiveFrom: policy.effectiveFrom,
      oldApprovers: existing?.requiredApprovers || null,
      newApprovers: data.requiredApprovers,
    },
  });

  return policy;
}

export async function getApprovalPolicyHistory(
  options: {
    compensationBandMin?: Decimal;
    compensationBandMax?: Decimal;
    limit?: number;
  } = {},
): Promise<ApprovalPolicy[]> {
  const where: any = {};

  if (options.compensationBandMin && options.compensationBandMax) {
    where.OR = [
      {
        AND: [
          { compensationBandMin: { lte: options.compensationBandMax } },
          { compensationBandMax: { gte: options.compensationBandMin } },
        ],
      },
    ];
  }

  return await prisma.approvalPolicy.findMany({
    where,
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    take: options.limit || 50,
    include: {
      createdBy: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
}
```

### 4. In-Flight Application Isolation

Update application screening to capture policy version ID:

Add to screeningService:

```typescript
export async function screenApplication(applicationId: string): Promise<void> {
  // Get application submission date for effective policy lookup
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { submittedAt: true },
  });

  if (!application?.submittedAt) {
    throw new Error("Application not submitted");
  }

  // Get threshold effective at submission time
  const threshold = await getEffectiveThreshold(application.submittedAt);

  // Store threshold ID with screening result
  await prisma.screening.create({
    data: {
      applicationId,
      thresholdId: threshold.id, // Link to specific version
      // ... other screening data
    },
  });
}
```

## Database Schema Updates

### Add threshold reference to applications

```prisma
model Application {
  // ... existing fields
  screeningThresholdId  String?  @db.Uuid
  screeningThreshold    ScreeningThreshold? @relation(fields: [screeningThresholdId], references: [id])
}
```

### Add creator tracking

Already exists in schema, ensure all policy creates include createdById.

## Acceptance Criteria

- [ ] createScreeningThresholdVersion creates new version with incremented version number
- [ ] getEffectiveThreshold returns correct threshold based on asOfDate
- [ ] Threshold validation rejects out-of-range values (0-100)
- [ ] Threshold validation enforces logical order (reject < borderline < shortlist)
- [ ] createScoringThresholdVersion validates 0-1 range for decimal thresholds
- [ ] Approval policy creation validates approver existence and active status
- [ ] All policy creations log audit events with before/after values
- [ ] getThresholdHistory returns ordered list with change details
- [ ] In-flight applications use threshold from submission date, not current
- [ ] Cache invalidation works correctly on new version creation

## Testing Requirements

- Unit tests for all validation functions
- Unit tests for effective-date query logic
- Integration tests for version creation
- Test in-flight isolation with time-based scenarios
- Test cache invalidation
- Test audit event logging

## Files to Create/Modify

- `/backend/src/services/thresholdService.ts` (update)
- `/backend/src/services/scoringThresholdService.ts` (new)
- `/backend/src/services/approvalPolicyService.ts` (update)
- `/backend/src/services/screeningService.ts` (update for in-flight)
- `/backend/src/services/errors/PolicyErrors.ts` (new - policy-specific errors)
- `/backend/src/__tests__/services/thresholdService.test.ts`
- `/backend/src/__tests__/services/scoringThresholdService.test.ts`
- `/backend/src/__tests__/services/approvalPolicyService.test.ts`

## Related User Story

**US-002 Acceptance Criteria:**

- ✅ Scenario 1: New policy version with future effective date (This task)
- ✅ Scenario 2: Policy editor shows change history (TASK-002)
- ✅ Scenario 3: Invalid policy value rejected (This task)
- ✅ Scenario 4: Approval policy change applies to new offer decisions only (This task)

## Dependencies

- Existing threshold and policy infrastructure
- Audit service
- Prisma schema with effectiveFrom fields

## Notes

- Effective-date isolation is critical for fairness and compliance
- In-flight applications must NEVER be affected by new policy versions
- Cache invalidation must happen immediately on version creation
- All policy changes must be auditable with before/after values
