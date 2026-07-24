---
id: task_004
us_id: us_001
epic: EP-003
title: "Implement Malware Scan Webhook Handler"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Implement Malware Scan Webhook Handler

## Context

**User Story**: US-001 — Secure Resume Upload via Presigned URL with Malware Scanning  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 3 (malware scan), Scenario 4 (clean file triggers parsing)

Create webhook endpoint that receives malware scan results from ClamAV/antivirus service. Updates Resume status based on scan outcome.

---

## Objective

Implement scan webhook that:
1. Receives scan results via POST webhook
2. Validates webhook signature/token
3. Updates Resume.scanStatus (clean, infected)
4. Stores scan results in Resume.scanResult JSONB
5. Routes to quarantine flow or parsing queue
6. Logs all scan events

---

## Implementation

### 1. Scan Webhook Service

**File**: `backend/src/services/scanWebhookService.ts`

```typescript
import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface ScanResult {
  resumeId: string;
  status: 'clean' | 'infected';
  threats?: string[];
  scannerVersion?: string;
  scanTime?: Date;
}

export class ScanWebhookError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ScanWebhookError';
  }
}

export async function processScanResult(result: ScanResult): Promise<void> {
  const { resumeId, status, threats, scannerVersion, scanTime } = result;

  try {
    // Find resume
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      include: {
        application: {
          include: {
            candidate: true,
          },
        },
      },
    });

    if (!resume) {
      throw new ScanWebhookError('RESUME_NOT_FOUND', 'Resume not found');
    }

    if (resume.scanStatus !== 'pending') {
      logger.warn('Scan result received for already-scanned resume', {
        resumeId,
        currentStatus: resume.scanStatus,
      });
      return;
    }

    // Update resume with scan results
    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        scanStatus: status,
        scanResult: {
          status,
          threats: threats || [],
          scannerVersion,
          scanTime: scanTime || new Date(),
        },
      },
    });

    // Log audit event
    await auditEvent({
      entityType: 'resume',
      entityId: resumeId,
      action: `resume.scan.${status}`,
      actorId: 'system',
      metadata: {
        status,
        threats: threats || [],
        applicationId: resume.applicationId,
      },
    });

    logger.info('Resume scan completed', {
      resumeId,
      status,
      threats: threats?.length || 0,
      applicationId: resume.applicationId,
    });

    if (status === 'clean') {
      logger.info('Clean file ready for parsing', { resumeId });
      // Next task will handle BullMQ enqueue
    } else {
      logger.warn('Infected file quarantined', { resumeId, threats });
      // Next task will handle candidate notification
    }
  } catch (error) {
    logger.error('Failed to process scan result', {
      resumeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

### 2. Webhook API Route

**File**: `backend/src/routes/webhooks.ts`

```typescript
import express from 'express';
import { z } from 'zod';
import { processScanResult, ScanWebhookError } from '../services/scanWebhookService';
import { env } from '../config/env';
import logger from '../utils/logger';

const router = express.Router();

const ScanResultSchema = z.object({
  resumeId: z.string().uuid(),
  status: z.enum(['clean', 'infected']),
  threats: z.array(z.string()).optional(),
  scannerVersion: z.string().optional(),
  scanTime: z.string().datetime().optional(),
});

/**
 * POST /api/webhooks/scan-result
 * Receive malware scan results from antivirus service
 */
router.post('/scan-result', async (req, res) => {
  try {
    // Validate webhook signature/token
    const webhookToken = req.headers['x-webhook-token'];
    if (webhookToken !== env.SCAN_WEBHOOK_SECRET) {
      logger.warn('Invalid webhook token', {
        ip: req.ip,
        headers: req.headers,
      });
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid webhook token',
        },
      });
    }

    // Validate payload
    const validation = ScanResultSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Invalid scan result payload',
          details: validation.error.errors,
        },
      });
    }

    const scanResult = validation.data;

    await processScanResult({
      ...scanResult,
      scanTime: scanResult.scanTime ? new Date(scanResult.scanTime) : undefined,
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    if (error instanceof ScanWebhookError) {
      return res.status(404).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error('Webhook processing error', {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to process scan result',
      },
    });
  }
});

export default router;
```

### 3. Add to App

**File**: `backend/src/app.ts`

```typescript
import webhooksRouter from './routes/webhooks';

// ... existing routes
app.use('/api/webhooks', webhooksRouter);
```

### 4. Environment Variable

**File**: `backend/src/config/env.ts`

```typescript
const envSchema = z.object({
  // ... existing vars
  SCAN_WEBHOOK_SECRET: z.string().min(32, 'SCAN_WEBHOOK_SECRET must be at least 32 characters'),
});
```

---

## Acceptance Criteria

- [x] scanWebhookService.ts with processScanResult function
- [x] Validates scan result payload (resumeId, status, threats)
- [x] Updates Resume.scanStatus (clean, infected)
- [x] Stores scanResult JSONB with threats, version, timestamp
- [x] Logs audit event for scan completion
- [x] POST /api/webhooks/scan-result endpoint
- [x] Webhook signature validation via X-Webhook-Token header
- [x] Returns 401 for invalid token
- [x] Returns 400 for invalid payload
- [x] Returns 404 for resume not found
- [x] Logs all scan events

---

## Testing Requirements

**Unit Tests** (`scanWebhookService.test.ts`):
- ✓ Updates resume status to 'clean'
- ✓ Updates resume status to 'infected'
- ✓ Stores scan results in JSONB
- ✓ Logs audit event
- ✓ Throws error for non-existent resume
- ✓ Ignores duplicate scan results

**Integration Tests** (`webhooks.integration.test.ts`):
- ✓ POST /scan-result returns 200 with valid token
- ✓ Returns 401 with invalid token
- ✓ Returns 400 with invalid payload
- ✓ Returns 404 for non-existent resume
- ✓ Updates database correctly

---

## Dependencies

- env.SCAN_WEBHOOK_SECRET configured
- ClamAV/antivirus service configured to call webhook
- Resume model with scanStatus and scanResult fields

---

## Effort Estimate

**2 hours** — Standard webhook handler with validation
