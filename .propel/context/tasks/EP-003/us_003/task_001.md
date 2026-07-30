---
id: task_001
us_id: us_003
epic: EP-003
title: "Create Threshold Configuration Service with Version Tracking"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create Threshold Configuration Service with Version Tracking

## Context

**User Story**: US-003 — AI Screening Score Computation with Configurable Thresholds  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 2, 3, 4, 5 (threshold-based recommendations, version tracking)

Create a service to manage screening threshold configurations with version tracking. Ensures new applications use current thresholds while preserving historical screening data integrity.

---

## Objective

Implement threshold management that:
1. Fetches active threshold configuration (shortlist, borderline, reject)
2. Tracks threshold versions for audit trail
3. Caches active thresholds to avoid database hits per screening
4. Provides threshold history for analytics

---

## Implementation Steps

### Step 1 — Create Threshold Service

Create `backend/src/services/thresholdService.ts`:

```typescript
import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface ScreeningThresholds {
  id: string;
  shortlistThreshold: number; // e.g., 75
  borderlineMin: number; // e.g., 40
  borderlineMax: number; // e.g., 74
  rejectThreshold: number; // e.g., 39
  version: number;
  effectiveFrom: Date;
  createdAt: Date;
}

export type RecommendationType = 'shortlist' | 'manual_review' | 'reject';

// In-memory cache for active thresholds
let cachedThresholds: ScreeningThresholds | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute

export async function getActiveThresholds(): Promise<ScreeningThresholds> {
  const now = Date.now();

  // Return cached if still valid
  if (cachedThresholds && now - cacheTimestamp < CACHE_TTL) {
    return cachedThresholds;
  }

  // Fetch from database
  const thresholds = await prisma.scoringThreshold.findFirst({
    where: {
      effectiveFrom: {
        lte: new Date(),
      },
    },
    orderBy: {
      effectiveFrom: 'desc',
    },
  });

  if (!thresholds) {
    throw new Error('No active scoring thresholds found');
  }

  cachedThresholds = thresholds as ScreeningThresholds;
  cacheTimestamp = now;

  logger.info('Loaded active thresholds', {
    version: thresholds.version,
    shortlist: thresholds.shortlistThreshold,
    borderline: `${thresholds.borderlineMin}-${thresholds.borderlineMax}`,
  });

  return cachedThresholds;
}

export function getRecommendation(
  score: number,
  thresholds: ScreeningThresholds
): RecommendationType {
  if (score >= thresholds.shortlistThreshold) {
    return 'shortlist';
  }

  if (score <= thresholds.rejectThreshold) {
    return 'reject';
  }

  // Between reject and shortlist = manual review
  return 'manual_review';
}

export async function createThresholdVersion(data: {
  shortlistThreshold: number;
  borderlineMin: number;
  borderlineMax: number;
  rejectThreshold: number;
  effectiveFrom?: Date;
}): Promise<ScreeningThresholds> {
  // Get current max version
  const latestThreshold = await prisma.scoringThreshold.findFirst({
    orderBy: { version: 'desc' },
  });

  const newVersion = (latestThreshold?.version || 0) + 1;

  const threshold = await prisma.scoringThreshold.create({
    data: {
      ...data,
      version: newVersion,
      effectiveFrom: data.effectiveFrom || new Date(),
    },
  });

  // Invalidate cache
  cachedThresholds = null;

  logger.info('Created new threshold version', {
    version: newVersion,
    effectiveFrom: threshold.effectiveFrom,
  });

  return threshold as ScreeningThresholds;
}

export async function getThresholdHistory(): Promise<ScreeningThresholds[]> {
  const history = await prisma.scoringThreshold.findMany({
    orderBy: { effectiveFrom: 'desc' },
    take: 10,
  });

  return history as ScreeningThresholds[];
}

export function clearThresholdCache(): void {
  cachedThresholds = null;
  cacheTimestamp = 0;
}
```

### Step 2 — Create Threshold Management API

Create `backend/src/routes/admin/thresholds.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import {
  getActiveThresholds,
  createThresholdVersion,
  getThresholdHistory,
} from '../../services/thresholdService';
import { authenticate } from '../../middleware/authenticate';
import logger from '../../utils/logger';

const router = Router();

const CreateThresholdSchema = z.object({
  shortlistThreshold: z.number().int().min(0).max(100),
  borderlineMin: z.number().int().min(0).max(100),
  borderlineMax: z.number().int().min(0).max(100),
  rejectThreshold: z.number().int().min(0).max(100),
  effectiveFrom: z.string().datetime().optional(),
}).refine(
  (data) => data.rejectThreshold < data.borderlineMin,
  { message: 'Reject threshold must be less than borderline min' }
).refine(
  (data) => data.borderlineMax < data.shortlistThreshold,
  { message: 'Borderline max must be less than shortlist threshold' }
);

// GET /api/admin/thresholds/active
router.get('/active', authenticate, async (req, res) => {
  try {
    const thresholds = await getActiveThresholds();
    res.json(thresholds);
  } catch (error) {
    logger.error('Failed to fetch active thresholds', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch thresholds',
      },
    });
  }
});

// GET /api/admin/thresholds/history
router.get('/history', authenticate, async (req, res) => {
  try {
    const history = await getThresholdHistory();
    res.json({ history, count: history.length });
  } catch (error) {
    logger.error('Failed to fetch threshold history', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch history',
      },
    });
  }
});

// POST /api/admin/thresholds
router.post('/', authenticate, async (req, res) => {
  try {
    const validation = CreateThresholdSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid threshold data',
          details: validation.error.errors,
        },
      });
    }

    const threshold = await createThresholdVersion({
      ...validation.data,
      effectiveFrom: validation.data.effectiveFrom
        ? new Date(validation.data.effectiveFrom)
        : undefined,
    });

    logger.info('Threshold version created', { version: threshold.version });

    res.status(201).json(threshold);
  } catch (error) {
    logger.error('Failed to create threshold', { error });
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create threshold',
      },
    });
  }
});

export default router;
```

### Step 3 — Seed Default Thresholds

Create `backend/prisma/seed.thresholds.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedThresholds() {
  console.log('Seeding default thresholds...');

  const existing = await prisma.scoringThreshold.findFirst();
  if (existing) {
    console.log('Thresholds already exist, skipping seed');
    return;
  }

  await prisma.scoringThreshold.create({
    data: {
      shortlistThreshold: 75,
      borderlineMin: 40,
      borderlineMax: 74,
      rejectThreshold: 39,
      version: 1,
      effectiveFrom: new Date(),
    },
  });

  console.log('Default thresholds created (v1)');
}
```

---

## Acceptance Criteria

- [ ] Service fetches active thresholds from database
- [ ] Thresholds cached for 1 minute to reduce DB load
- [ ] New threshold versions increment version number
- [ ] Recommendation logic uses correct threshold ranges
- [ ] Admin API allows viewing/creating thresholds
- [ ] Validation ensures logical threshold ordering (reject < borderline < shortlist)

---

## Testing Checklist

- [ ] Unit test: getRecommendation with boundary values (exactly at thresholds)
- [ ] Unit test: Cache returns same object within TTL
- [ ] Unit test: Cache refreshes after TTL expires
- [ ] Integration test: Create threshold increments version
- [ ] Integration test: Get active returns latest effective threshold
- [ ] API test: POST validates threshold ordering

---

## Dependencies

- Prisma schema with `scoringThreshold` model
- Admin authentication middleware
- Database migration for scoring_thresholds table

---

## Definition of Done

- [ ] Threshold service created with caching
- [ ] Admin API endpoints created
- [ ] Default thresholds seeded
- [ ] Cache invalidation working
- [ ] All validation tests passing
- [ ] API registered in app.ts
