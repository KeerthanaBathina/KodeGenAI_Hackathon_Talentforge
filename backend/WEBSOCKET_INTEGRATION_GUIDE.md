# WebSocket Prerequisite Event Integration Guide

This document provides instructions for integrating stage and assessment completion WebSocket events into future scorecard submission and assessment ingestion flows.

## Overview

The WebSocket prerequisite event system broadcasts real-time updates when:
- Interview stages are completed (after scorecard submission)
- Assessments are completed (after score ingestion)

Events are scoped to application-specific rooms, ensuring only relevant clients receive updates.

---

## Architecture

### Event Types

Located in `backend/src/types/websocketEvents.ts`:

- **`stage:completed`** - Emitted when an interview stage transitions to 'completed' state
- **`assessment:completed`** - Emitted when assessment score is successfully ingested

### Event Emitters

Located in `backend/src/socket/prerequisiteEvents.ts`:

- `emitStageCompleted(payload)` - Broadcast stage completion
- `emitAssessmentCompleted(payload)` - Broadcast assessment completion
- `isSocketServerReady()` - Check if WebSocket server is available

### Room Management

Clients join application-specific rooms using:
```typescript
socket.emit('join:application', applicationId);
```

Server broadcasts to rooms using:
```typescript
io.to(`application:${applicationId}`).emit('stage:completed', payload);
```

---

## Integration: Scorecard Submission

When implementing scorecard submission routes (e.g., `POST /api/scorecards`), follow this pattern:

### Step 1: Save Scorecard

```typescript
// POST /api/scorecards
router.post('/', authenticate, async (req, res) => {
  const { interviewStageId, recommendation, rubricJson, comments } = req.body;
  
  // Save scorecard
  const scorecard = await prisma.scorecard.create({
    data: {
      interviewStageId,
      interviewerId: req.user!.id,
      recommendation,
      rubricJson,
      comments
    }
  });
  
  // ... continue to Step 2
});
```

### Step 2: Check Stage Completion

After saving the scorecard, check if all required scorecards are now submitted:

```typescript
// Fetch the interview stage with all scorecards
const stage = await prisma.interviewStage.findUnique({
  where: { id: interviewStageId },
  include: {
    scorecards: true,
    application: {
      select: { id: true }
    }
  }
});

if (!stage) {
  res.status(404).json({ error: 'Interview stage not found' });
  return;
}

// Check if all required scorecards are submitted
// Logic depends on business rules (e.g., 1 scorecard per stage, or multiple panel members)
const requiredScorecardCount = getRequiredScorecardCount(stage.type);
const isStageComplete = stage.scorecards.length >= requiredScorecardCount;
```

### Step 3: Update Stage State and Emit Event

If stage is complete, update its state and emit WebSocket event:

```typescript
import { emitStageCompleted } from '../socket/prerequisiteEvents';

if (isStageComplete && stage.state !== 'completed') {
  // Update stage to completed
  await prisma.interviewStage.update({
    where: { id: interviewStageId },
    data: {
      state: 'completed',
      completedAt: new Date()
    }
  });
  
  // Emit WebSocket event (non-blocking, errors are logged)
  await emitStageCompleted({
    applicationId: stage.application.id,
    stageId: stage.id,
    stageType: stage.type,
    completedAt: new Date(),
    completedBy: req.user!.id
  });
  
  logger.info('Interview stage completed', {
    stageId: stage.id,
    applicationId: stage.application.id,
    stageType: stage.type
  });
}
```

### Helper Function: getRequiredScorecardCount

You may need to define business rules for how many scorecards are required:

```typescript
function getRequiredScorecardCount(stageType: InterviewStageType): number {
  // Simple rule: 1 scorecard per stage
  return 1;
  
  // OR more complex rules:
  // switch (stageType) {
  //   case 'technical':
  //   case 'coding':
  //     return 2; // Requires 2 technical interviewers
  //   case 'hr':
  //   case 'aptitude':
  //     return 1;
  //   default:
  //     return 1;
  // }
}
```

---

## Integration: Assessment Score Ingestion

When implementing assessment webhook handlers (e.g., `POST /webhooks/assessment-score`), follow this pattern:

### Step 1: Validate and Save Score

```typescript
// POST /webhooks/assessment-score
router.post('/assessment-score', validateWebhookSignature, async (req, res) => {
  const { sessionToken, score, completedAt } = req.body;
  
  // Find assessment session
  const session = await prisma.assessmentSession.findUnique({
    where: { sessionToken },
    include: {
      application: {
        select: { id: true }
      }
    }
  });
  
  if (!session) {
    res.status(404).json({ error: 'Assessment session not found' });
    return;
  }
  
  // Update with score
  await prisma.assessmentSession.update({
    where: { id: session.id },
    data: {
      status: 'completed',
      score,
      completedAt: new Date(completedAt)
    }
  });
  
  // ... continue to Step 2
});
```

### Step 2: Emit WebSocket Event

```typescript
import { emitAssessmentCompleted } from '../socket/prerequisiteEvents';

// Emit completion event
await emitAssessmentCompleted({
  applicationId: session.application.id,
  assessmentId: session.id,
  score,
  completedAt: new Date(completedAt)
});

logger.info('Assessment completed', {
  assessmentId: session.id,
  applicationId: session.application.id,
  score
});

res.status(200).json({ success: true });
```

---

## Error Handling

The `emitStageCompleted` and `emitAssessmentCompleted` functions are designed to **never throw errors**. All errors are logged but do not disrupt the main flow.

This ensures that:
- Scorecard submission succeeds even if WebSocket is unavailable
- Assessment ingestion completes even if event emission fails
- Frontend can still poll for updates as fallback

---

## Testing Integration

When testing scorecard/assessment routes, mock the WebSocket emitters:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock WebSocket emitters
const mockEmitStageCompleted = vi.fn();
const mockEmitAssessmentCompleted = vi.fn();

vi.mock('../socket/prerequisiteEvents', () => ({
  emitStageCompleted: mockEmitStageCompleted,
  emitAssessmentCompleted: mockEmitAssessmentCompleted
}));

describe('Scorecard Submission', () => {
  beforeEach(() => {
    mockEmitStageCompleted.mockClear();
  });
  
  it('should emit stage:completed when final scorecard is submitted', async () => {
    // Submit scorecard...
    
    // Verify event emitted
    expect(mockEmitStageCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'app-123',
        stageId: 'stage-1',
        stageType: 'technical'
      })
    );
  });
});
```

---

## Frontend Integration

Frontend clients should:

1. **Join application room** when viewing decision panel:
   ```typescript
   socket.emit('join:application', applicationId);
   ```

2. **Listen for events**:
   ```typescript
   socket.on('stage:completed', (payload) => {
     // Update prerequisite checklist UI
     updateChecklistItem(payload.stageId, 'completed');
   });
   
   socket.on('assessment:completed', (payload) => {
     // Update assessment status
     updateAssessmentStatus('completed', payload.score);
   });
   ```

3. **Leave room** when navigating away:
   ```typescript
   socket.on('leave:application', applicationId);
   ```

---

## Example: Complete Scorecard Submission Route

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { emitStageCompleted } from '../socket/prerequisiteEvents';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

const CreateScorecardSchema = z.object({
  interviewStageId: z.string().uuid(),
  recommendation: z.enum(['strong_yes', 'yes', 'no', 'strong_no']),
  rubricJson: z.record(z.unknown()),
  comments: z.string().optional()
});

router.post(
  '/',
  authenticate,
  authorize(['interviewer', 'hr_manager']),
  async (req, res) => {
    try {
      // Validate request
      const data = CreateScorecardSchema.parse(req.body);
      
      // Create scorecard
      const scorecard = await prisma.scorecard.create({
        data: {
          ...data,
          interviewerId: req.user!.id,
          submittedAt: new Date()
        }
      });
      
      // Check stage completion
      const stage = await prisma.interviewStage.findUnique({
        where: { id: data.interviewStageId },
        include: {
          scorecards: true,
          application: { select: { id: true } }
        }
      });
      
      if (stage) {
        const requiredCount = 1; // Adjust based on business rules
        const isComplete = stage.scorecards.length >= requiredCount;
        
        if (isComplete && stage.state !== 'completed') {
          // Update stage
          await prisma.interviewStage.update({
            where: { id: stage.id },
            data: {
              state: 'completed',
              completedAt: new Date()
            }
          });
          
          // Emit WebSocket event
          await emitStageCompleted({
            applicationId: stage.application.id,
            stageId: stage.id,
            stageType: stage.type,
            completedAt: new Date(),
            completedBy: req.user!.id
          });
        }
      }
      
      res.status(201).json({
        success: true,
        data: scorecard
      });
      
    } catch (error) {
      logger.error({ err: error }, 'Failed to create scorecard');
      res.status(500).json({
        success: false,
        error: 'Failed to create scorecard'
      });
    }
  }
);

export default router;
```

---

## Security Considerations

1. **Authentication**: Application room subscriptions don't require authentication at the Socket.IO level, but the frontend should only request joins for applications the user has access to.

2. **Authorization**: The prerequisite validation service (TASK-001) already checks database permissions, so WebSocket events are informational only.

3. **Event payload**: Events contain only IDs and basic metadata, not sensitive application data.

4. **Rate limiting**: Consider adding rate limits on `join:application` events to prevent abuse.

---

## Monitoring and Logging

All WebSocket events are logged with:
- Event name (`stage:completed`, `assessment:completed`)
- Application ID
- Stage/Assessment ID
- Room name

Check logs for patterns:
```bash
grep "WebSocket event emitted" logs/app.log | jq
```

---

## Future Enhancements

Potential improvements when implementing scorecard/assessment routes:

1. **Event batching**: If multiple stages complete simultaneously, batch events
2. **Event queuing**: Use Redis pub/sub for horizontally scaled deployments
3. **Client acknowledgment**: Require clients to acknowledge event receipt
4. **Event history**: Store recent events for clients that reconnect
5. **Progress events**: Emit `stage:in_progress` when interviews begin
