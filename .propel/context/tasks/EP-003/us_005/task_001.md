---
id: task_001
us_id: us_005
epic: EP-003
title: "Add Confidence Field and Low-Confidence Routing Logic"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Add Confidence Field and Low-Confidence Routing Logic

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (low-confidence application escalated to manual queue)

Add a confidence score to screening results and implement automatic routing to manual review when confidence is below threshold.

---

## Objective

Implement confidence scoring and routing logic:
1. Add `confidence` field to screening results
2. Calculate confidence based on score distribution and data quality
3. Route low-confidence applications to manual review queue
4. Add "Low AI Confidence" badge to application metadata

---

## Implementation Steps

### Step 1 — Update Database Schema

Create migration `backend/prisma/migrations/202607250001_add_confidence_and_manual_review/migration.sql`:

```sql
-- Add confidence field to screenings table
ALTER TABLE "screenings" ADD COLUMN "confidence" DOUBLE PRECISION;

-- Add manual_review_reason to applications
ALTER TABLE "applications" ADD COLUMN "manual_review_reason" TEXT;

-- Add index for manual review queue queries
CREATE INDEX "idx_applications_manual_review" ON "applications"("status", "created_at")
WHERE "status" = 'pending_manual_review';
```

### Step 2 — Update Prisma Schema

Update `backend/prisma/schema.prisma`:

```prisma
model Screening {
  id                String   @id @default(cuid())
  applicationId     String   @unique
  score             Int
  confidence        Float?   // 0.0 to 1.0, null if not calculated
  recommendation    ScreeningRecommendation
  factors           Json?
  thresholdVersion  Int
  screenedAt        DateTime
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  application       Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
  @@map("screenings")
}

model Application {
  // ... existing fields ...
  status                  ApplicationStatus
  manualReviewReason      String?           // "low_confidence" | "screening_failed" | "flagged"
  
  // ... relations ...
}
```

### Step 3 — Implement Confidence Calculation

Create `backend/src/services/confidenceService.ts`:

```typescript
import { Prisma } from '@prisma/client';

export interface ConfidenceFactors {
  scoreStability: number; // 0-1: How close score is to thresholds
  dataQuality: number; // 0-1: Completeness of resume data
  matchClarity: number; // 0-1: Clear skill matches vs. ambiguous
}

/**
 * Calculate confidence score (0.0 to 1.0) based on screening factors
 */
export function calculateConfidence(
  score: number,
  thresholds: { shortlistThreshold: number; rejectThreshold: number },
  factors: {
    parsedData?: {
      skills?: string[];
      experience?: any[];
      education?: any[];
    };
    positiveFactors?: string[];
    skillGaps?: string[];
  }
): { confidence: number; factors: ConfidenceFactors } {
  // 1. Score Stability (0-1): Distance from threshold boundaries
  const shortlistBuffer = thresholds.shortlistThreshold - score;
  const rejectBuffer = score - thresholds.rejectThreshold;
  const minBuffer = Math.min(Math.abs(shortlistBuffer), Math.abs(rejectBuffer));
  const maxBuffer = Math.abs(thresholds.shortlistThreshold - thresholds.rejectThreshold) / 2;
  const scoreStability = Math.min(minBuffer / maxBuffer, 1.0);

  // 2. Data Quality (0-1): Completeness of parsed resume
  let dataQualityScore = 0;
  const parsedData = factors.parsedData || {};
  
  if (parsedData.skills && parsedData.skills.length > 0) dataQualityScore += 0.4;
  if (parsedData.experience && parsedData.experience.length > 0) dataQualityScore += 0.3;
  if (parsedData.education && parsedData.education.length > 0) dataQualityScore += 0.3;
  
  const dataQuality = dataQualityScore;

  // 3. Match Clarity (0-1): Clear skill matches
  const positiveCount = (factors.positiveFactors || []).length;
  const gapCount = (factors.skillGaps || []).length;
  const totalFactors = positiveCount + gapCount;
  
  let matchClarity = 0.5; // Default for no factors
  if (totalFactors > 0) {
    // Higher clarity when we have clear positive or negative signals
    matchClarity = Math.min(totalFactors / 10, 1.0); // Up to 10 factors = full clarity
  }

  // Overall confidence: Weighted average
  const confidence = (
    scoreStability * 0.4 +
    dataQuality * 0.4 +
    matchClarity * 0.2
  );

  return {
    confidence: Math.max(0, Math.min(1, confidence)), // Clamp to 0-1
    factors: { scoreStability, dataQuality, matchClarity },
  };
}

/**
 * Threshold for low confidence (route to manual review)
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Check if screening should be escalated to manual review
 */
export function shouldEscalateToManualReview(confidence: number): boolean {
  return confidence < LOW_CONFIDENCE_THRESHOLD;
}
```

### Step 4 — Update Screening Service

Update `backend/src/services/screeningService.ts`:

```typescript
import { calculateConfidence, shouldEscalateToManualReview } from './confidenceService';

export async function performScreening(applicationId: string) {
  // ... existing code to fetch application, resume, requisition ...

  // Compute score
  const scoringResult = computeScreeningScore(resume.parsedData, requisition);
  
  // Fetch thresholds
  const thresholds = await getActiveThresholds();
  
  // Calculate confidence
  const { confidence, factors: confidenceFactors } = calculateConfidence(
    scoringResult.totalScore,
    { shortlistThreshold: thresholds.shortlistThreshold, rejectThreshold: thresholds.rejectThreshold },
    {
      parsedData: resume.parsedData as any,
      positiveFactors: scoringResult.factors.positiveFactors,
      skillGaps: scoringResult.factors.skillGaps,
    }
  );

  // Get recommendation
  const recommendation = getRecommendation(scoringResult.totalScore, thresholds);

  // Store screening with confidence
  const screening = await prisma.screening.create({
    data: {
      applicationId,
      score: scoringResult.totalScore,
      confidence,
      recommendation,
      factors: scoringResult.factors as Prisma.InputJsonValue,
      thresholdVersion: thresholds.version,
      screenedAt: new Date(),
    },
  });

  // Check if should escalate to manual review
  if (shouldEscalateToManualReview(confidence)) {
    // Update application to manual review status
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'pending_manual_review',
        manualReviewReason: 'low_confidence',
      },
    });

    await auditService.logEvent({
      entity: 'application',
      entityId: applicationId,
      action: 'escalated_to_manual_review',
      metadata: { confidence, reason: 'low_confidence' },
    });
  } else {
    // Apply normal recommendation routing
    await updateApplicationStatus(applicationId, recommendation);
  }

  return screening;
}
```

---

## Acceptance Criteria

- [ ] `confidence` field added to `screenings` table
- [ ] `manualReviewReason` field added to `applications` table
- [ ] Confidence calculated based on score stability, data quality, match clarity
- [ ] Applications with confidence < 0.5 routed to `pending_manual_review` status
- [ ] Manual review reason set to "low_confidence"
- [ ] Audit event logged for escalation

---

## Testing Checklist

- [ ] Unit test: Confidence calculation with high stability score
- [ ] Unit test: Confidence calculation with low data quality
- [ ] Unit test: Confidence calculation near threshold boundaries
- [ ] Integration test: Low confidence (0.4) routes to manual review
- [ ] Integration test: High confidence (0.8) applies normal routing
- [ ] Integration test: Manual review reason set correctly

---

## Dependencies

- Existing screening service (US-003)
- Prisma schema and migrations
- Audit service

---

## Definition of Done

- [ ] Database migration created and tested
- [ ] Confidence calculation implemented
- [ ] Low-confidence routing implemented
- [ ] Unit tests passing (6+ tests)
- [ ] Integration tests passing
- [ ] Prisma schema updated
