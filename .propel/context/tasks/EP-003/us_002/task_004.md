---
id: task_004
us_id: us_002
epic: EP-003
title: "Create Parse Result Webhook Handler in Node.js Backend"
status: done
layer: backend
effort: 1.5h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Create Parse Result Webhook Handler in Node.js Backend

## Context

**User Story**: US-002 — AI Resume Parsing Worker with BullMQ and spaCy NER  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (parsed result written to database), Scenario 2 (verify extracted fields)

Create Node.js endpoint that receives parsed resume data from Python worker and stores it in the `resumes.parsed_data` JSONB column.

---

## Objective

Implement webhook handler that:
1. Validates worker authentication token
2. Receives parsed resume data payload
3. Stores data in `resumes.parsed_data` JSONB
4. Updates resume status to `parsed` or `parse_failed`
5. Triggers audit log event

---

## Implementation Steps

### Step 1 — Create Parse Result Service

Create `backend/src/services/parseResultService.ts`:

```typescript
import prisma from '../db/prisma';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface ParsedResumeData {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience_years: number;
  employers: Array<{
    name: string;
    title: string;
    duration?: string;
  }>;
  education: Array<{
    degree: string;
    field: string;
    institution: string;
  }>;
  raw_text?: string;
  extracted_at: string;
}

export interface ParseResultPayload {
  resumeId: string;
  status: 'success' | 'failed';
  parsedData?: ParsedResumeData;
  error?: string;
}

export class ParseResultError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = 'ParseResultError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function processParseResult(
  payload: ParseResultPayload
): Promise<void> {
  const { resumeId, status, parsedData, error } = payload;

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
      throw new ParseResultError('Resume not found', 'RESUME_NOT_FOUND', 404);
    }

    if (status === 'success' && parsedData) {
      // Store parsed data
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          parsedData: parsedData as any,
          scanStatus: 'parsed' as any, // Assuming you extend the enum
          updatedAt: new Date(),
        },
      });

      // Log audit event
      await auditEvent({
        action: 'resume.parsed',
        userId: resume.application.candidateId,
        resourceType: 'resume',
        resourceId: resumeId,
        metadata: {
          skillsCount: parsedData.skills.length,
          experienceYears: parsedData.experience_years,
          employersCount: parsedData.employers.length,
        },
      });

      logger.info('Resume parsed successfully', {
        resumeId,
        candidateId: resume.application.candidateId,
        skillsCount: parsedData.skills.length,
      });
    } else if (status === 'failed') {
      // Update status to parse_failed
      await prisma.resume.update({
        where: { id: resumeId },
        data: {
          scanStatus: 'parse_failed' as any,
          scanResult: {
            ...(resume.scanResult as object),
            parseError: error,
            parseFailedAt: new Date().toISOString(),
          },
        },
      });

      logger.error('Resume parsing failed', {
        resumeId,
        error,
      });
    }
  } catch (error) {
    logger.error('Failed to process parse result', {
      resumeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

### Step 2 — Create Webhook Route

Create or update `backend/src/routes/webhooks.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { processParseResult } from '../services/parseResultService';
import logger from '../utils/logger';

const router = Router();

// Validation schema
const ParseResultSchema = z.object({
  resumeId: z.string().uuid(),
  status: z.enum(['success', 'failed']),
  parsedData: z
    .object({
      name: z.string(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      skills: z.array(z.string()),
      experience_years: z.number().int().min(0),
      employers: z.array(
        z.object({
          name: z.string(),
          title: z.string(),
          duration: z.string().optional(),
        })
      ),
      education: z.array(
        z.object({
          degree: z.string(),
          field: z.string(),
          institution: z.string(),
        })
      ),
      raw_text: z.string().optional(),
      extracted_at: z.string(),
    })
    .optional(),
  error: z.string().optional(),
});

// POST /api/webhooks/parse-result
router.post('/parse-result', async (req, res) => {
  try {
    // Validate worker token
    const token = req.headers['x-worker-token'];
    if (!token || token !== env.WORKER_TOKEN) {
      logger.warn('Unauthorized parse result webhook attempt', {
        ip: req.ip,
      });
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Unauthorized',
        },
      });
    }

    // Validate payload
    const validationResult = ParseResultSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload',
          details: validationResult.error.errors,
        },
      });
    }

    const payload = validationResult.data;

    // Process parse result
    await processParseResult(payload);

    res.status(200).json({
      success: true,
      message: 'Parse result processed successfully',
    });
  } catch (error) {
    logger.error('Parse result webhook error', {
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process parse result',
      },
    });
  }
});

export default router;
```

### Step 3 — Update Environment Config

Update `backend/src/config/env.ts`:

```typescript
// Add to envSchema
WORKER_TOKEN: z.string().min(32, 'WORKER_TOKEN must be at least 32 characters'),
```

Update `backend/.env`:

```bash
WORKER_TOKEN=<generate-32-char-token>
```

### Step 4 — Update Prisma Schema (if needed)

Update `backend/prisma/schema.prisma`:

```prisma
enum ScanStatus {
  pending
  clean
  infected
  parsed        // Add this
  parse_failed  // Add this
}

model Resume {
  // ... existing fields
  parsedData   Json?  // JSONB column for parsed resume data
}
```

Run migration:
```bash
npx prisma migrate dev --name add_resume_parsed_status
```

---

## Acceptance Criteria

- [ ] Webhook validates worker token
- [ ] Successful parse stores data in `parsedData` JSONB
- [ ] Failed parse updates status to `parse_failed`
- [ ] Audit event logged for successful parse
- [ ] Invalid payloads return 400 with validation errors
- [ ] Unauthorized requests return 401

---

## Testing Checklist

- [ ] Unit test: `processParseResult` stores data correctly
- [ ] Unit test: Failed parse updates status
- [ ] Integration test: POST with valid token succeeds
- [ ] Integration test: POST without token returns 401
- [ ] Integration test: Invalid payload returns 400
- [ ] Integration test: Parsed data queryable from database

---

## Dependencies

- Prisma schema updated with `parsed` and `parse_failed` statuses
- WORKER_TOKEN environment variable configured
- Webhook route registered in app.ts

---

## Definition of Done

- [ ] Webhook endpoint created and registered
- [ ] Token authentication implemented
- [ ] Payload validation with Zod schema
- [ ] Database update logic tested
- [ ] Audit logging verified
- [ ] All tests passing
