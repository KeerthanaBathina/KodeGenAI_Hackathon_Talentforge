---
id: task_003
us_id: us_005
epic: EP-003
title: "Manual Review Queue Service and API Endpoints"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Manual Review Queue Service and API Endpoints

## Context

**User Story**: US-005 — Low-Confidence Escalation to Manual Review and AI Fallback Mode  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: All scenarios (manual review queue operations)

Create service and API endpoints for managing the manual review queue with filtering, pagination, and batch operations.

---

## Objective

Build manual review queue management:
1. Service layer for queue queries and updates
2. REST API for fetching manual review applications
3. Filtering by review reason (low_confidence, fallback, etc.)
4. Pagination for large queues
5. Batch assignment to reviewers

---

## Implementation Steps

### Step 1 — Create Manual Review Queue Service

Create `backend/src/services/manualReviewQueueService.ts`:

```typescript
import { prisma } from '@/db/prisma';
import { Prisma } from '@prisma/client';

export interface ManualReviewFilters {
  reason?: 'low_confidence' | 'screening_failed' | 'flagged';
  requisitionId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ManualReviewQueueItem {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  requisitionId: string;
  requisitionTitle: string;
  status: string;
  manualReviewReason: string | null;
  createdAt: Date;
  resumeId?: string;
  screening?: {
    score: number;
    confidence: number | null;
    recommendation: string;
  };
}

/**
 * Fetch manual review queue with filters and pagination
 */
export async function getManualReviewQueue(
  filters: ManualReviewFilters,
  pagination: { page: number; pageSize: number }
): Promise<{ items: ManualReviewQueueItem[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = pagination;
  const skip = (page - 1) * pageSize;
  
  // Build where clause
  const where: Prisma.ApplicationWhereInput = {
    status: 'pending_manual_review',
  };
  
  if (filters.reason) {
    where.manualReviewReason = filters.reason;
  }
  
  if (filters.requisitionId) {
    where.requisitionId = filters.requisitionId;
  }
  
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom;
    if (filters.dateTo) where.createdAt.lte = filters.dateTo;
  }
  
  // Fetch applications with related data
  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'asc' }, // FIFO order
      include: {
        candidate: {
          select: { id: true, name: true, email: true },
        },
        requisition: {
          select: { id: true, title: true },
        },
        resumes: {
          where: { status: { not: 'quarantined' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
        screenings: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { score: true, confidence: true, recommendation: true },
        },
      },
    }),
    prisma.application.count({ where }),
  ]);
  
  // Transform to queue items
  const items: ManualReviewQueueItem[] = applications.map((app) => ({
    id: app.id,
    candidateId: app.candidate.id,
    candidateName: app.candidate.name,
    candidateEmail: app.candidate.email,
    requisitionId: app.requisition.id,
    requisitionTitle: app.requisition.title,
    status: app.status,
    manualReviewReason: app.manualReviewReason,
    createdAt: app.createdAt,
    resumeId: app.resumes[0]?.id,
    screening: app.screenings[0] || undefined,
  }));
  
  return { items, total, page, pageSize };
}

/**
 * Get queue statistics
 */
export async function getManualReviewQueueStats(): Promise<{
  total: number;
  byReason: Record<string, number>;
  oldestApplicationAge: number | null; // hours
}> {
  // Total count
  const total = await prisma.application.count({
    where: { status: 'pending_manual_review' },
  });
  
  // Count by reason
  const groupedByReason = await prisma.application.groupBy({
    by: ['manualReviewReason'],
    where: { status: 'pending_manual_review' },
    _count: true,
  });
  
  const byReason: Record<string, number> = {};
  groupedByReason.forEach((group) => {
    const reason = group.manualReviewReason || 'unknown';
    byReason[reason] = group._count;
  });
  
  // Oldest application
  const oldest = await prisma.application.findFirst({
    where: { status: 'pending_manual_review' },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });
  
  const oldestApplicationAge = oldest
    ? Math.floor((Date.now() - oldest.createdAt.getTime()) / (1000 * 60 * 60))
    : null;
  
  return { total, byReason, oldestApplicationAge };
}

/**
 * Mark application as reviewed
 */
export async function markAsReviewed(
  applicationId: string,
  reviewerId: string,
  decision: 'shortlisted' | 'rejected',
  notes?: string
): Promise<void> {
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: decision === 'shortlisted' ? 'shortlisted' : 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });
}
```

### Step 2 — Create Manual Review Queue API Routes

Create `backend/src/routes/manualReviewQueue.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '@/middleware/authenticate';
import {
  getManualReviewQueue,
  getManualReviewQueueStats,
  markAsReviewed,
} from '@/services/manualReviewQueueService';
import { z } from 'zod';

const router = Router();

// Validation schemas
const queueFiltersSchema = z.object({
  reason: z.enum(['low_confidence', 'screening_failed', 'flagged']).optional(),
  requisitionId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const markReviewedSchema = z.object({
  decision: z.enum(['shortlisted', 'rejected']),
  notes: z.string().optional(),
});

/**
 * GET /api/manual-review-queue
 * Fetch manual review queue with filters and pagination
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const params = queueFiltersSchema.parse(req.query);
    
    const filters = {
      reason: params.reason,
      requisitionId: params.requisitionId,
      dateFrom: params.dateFrom ? new Date(params.dateFrom) : undefined,
      dateTo: params.dateTo ? new Date(params.dateTo) : undefined,
    };
    
    const result = await getManualReviewQueue(filters, {
      page: params.page,
      pageSize: params.pageSize,
    });
    
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
    }
    console.error('[ManualReviewQueue] Failed to fetch queue:', error);
    res.status(500).json({ error: 'Failed to fetch manual review queue' });
  }
});

/**
 * GET /api/manual-review-queue/stats
 * Get queue statistics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const stats = await getManualReviewQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('[ManualReviewQueue] Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue statistics' });
  }
});

/**
 * POST /api/manual-review-queue/:applicationId/review
 * Mark application as reviewed
 */
router.post('/:applicationId/review', authenticate, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const body = markReviewedSchema.parse(req.body);
    const reviewerId = req.user.id; // From authenticate middleware
    
    await markAsReviewed(applicationId, reviewerId, body.decision, body.notes);
    
    res.json({ success: true, message: 'Application marked as reviewed' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request body', details: error.errors });
    }
    console.error('[ManualReviewQueue] Failed to mark as reviewed:', error);
    res.status(500).json({ error: 'Failed to mark application as reviewed' });
  }
});

export default router;
```

### Step 3 — Register Routes in App

Update `backend/src/app.ts`:

```typescript
import manualReviewQueueRouter from './routes/manualReviewQueue';
import systemStatusRouter from './routes/admin/systemStatus';

// ... existing routes ...

app.use('/api/manual-review-queue', manualReviewQueueRouter);
app.use('/api/admin/system-status', systemStatusRouter);
```

---

## Acceptance Criteria

- [ ] Service fetches manual review queue with pagination
- [ ] Service filters by reason, requisition, date range
- [ ] Service returns queue statistics (total, by reason, oldest age)
- [ ] API endpoint returns paginated queue items
- [ ] API endpoint returns queue stats
- [ ] API endpoint marks application as reviewed

---

## Testing Checklist

- [ ] Unit test: Fetch queue with no filters
- [ ] Unit test: Filter by low_confidence reason
- [ ] Unit test: Pagination works correctly
- [ ] Unit test: Queue stats calculation
- [ ] Integration test: API returns queue items
- [ ] Integration test: Mark as reviewed updates status

---

## Dependencies

- Prisma application model with manualReviewReason field (TASK-001)
- Authentication middleware

---

## Definition of Done

- [ ] Manual review queue service implemented
- [ ] API routes created
- [ ] Pagination implemented
- [ ] Filtering implemented
- [ ] Unit tests passing (6+ tests)
- [ ] Integration tests passing
- [ ] Routes registered in app.ts
