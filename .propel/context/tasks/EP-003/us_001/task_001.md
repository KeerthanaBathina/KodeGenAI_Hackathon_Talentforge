---
id: task_001
us_id: us_001
epic: EP-003
title: "Create Presigned URL Generation Endpoint for Resume Upload"
status: done
layer: backend
effort: 2h
priority: critical
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create Presigned URL Generation Endpoint for Resume Upload

## Context

**User Story**: US-001 — Secure Resume Upload via Presigned URL with Malware Scanning  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 1 (presigned URL issued), Scenario 2 (file validation)

Create API endpoint that generates Supabase Storage presigned URLs for secure direct-to-storage resume uploads. The endpoint validates file metadata before issuing the URL.

---

## Objective

Implement secure presigned URL generation that:
1. Validates file type (PDF, DOCX only) and size (≤ 10 MB)
2. Generates unique storage key with candidate ID scope
3. Issues Supabase presigned URL with 5-minute expiry
4. Creates pending Resume record in database
5. Returns upload URL and metadata to client

---

## Implementation

### 1. Resume Service

**File**: `backend/src/services/resumeService.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import prisma from '../db/prisma';
import { env } from '../config/env';
import logger from '../utils/logger';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_MIME_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

export interface GeneratePresignedUrlParams {
  candidateId: string;
  applicationId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface GeneratePresignedUrlResult {
  uploadUrl: string;
  storageKey: string;
  resumeId: string;
  expiresIn: number;
}

export class ResumeUploadError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ResumeUploadError';
  }
}

export async function generatePresignedUrl(
  params: GeneratePresignedUrlParams
): Promise<GeneratePresignedUrlResult> {
  const { candidateId, applicationId, fileName, fileSize, mimeType } = params;

  // Validate file type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new ResumeUploadError(
      'INVALID_FILE_TYPE',
      'Only PDF and DOCX files are accepted'
    );
  }

  // Validate file size
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new ResumeUploadError(
      'FILE_TOO_LARGE',
      `File size must not exceed ${MAX_FILE_SIZE_MB} MB`
    );
  }

  // Generate unique storage key
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 15);
  const fileExtension = fileName.split('.').pop();
  const storageKey = `resumes/${candidateId}/${timestamp}-${randomSuffix}.${fileExtension}`;

  // Create pending Resume record
  const resume = await prisma.resume.create({
    data: {
      applicationId,
      storageKey,
      fileName,
      fileSize,
      mimeType,
      scanStatus: 'pending',
    },
  });

  // Generate presigned URL for upload
  const { data: uploadData, error } = await supabase.storage
    .from('resumes')
    .createSignedUploadUrl(storageKey, {
      upsert: false,
    });

  if (error || !uploadData) {
    logger.error('Failed to generate presigned URL', { error, storageKey });
    throw new ResumeUploadError('PRESIGNED_URL_FAILED', 'Failed to generate upload URL');
  }

  logger.info('Presigned URL generated', {
    resumeId: resume.id,
    candidateId,
    applicationId,
    storageKey,
  });

  return {
    uploadUrl: uploadData.signedUrl,
    storageKey,
    resumeId: resume.id,
    expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
  };
}
```

### 2. API Route

**File**: `backend/src/routes/resumes.ts`

```typescript
import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import {
  generatePresignedUrl,
  ResumeUploadError,
} from '../services/resumeService';
import logger from '../utils/logger';

const router = express.Router();

const GenerateUploadUrlSchema = z.object({
  applicationId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
});

/**
 * POST /api/resumes/presigned-url
 * Generate presigned URL for resume upload
 */
router.post('/presigned-url', authenticate, async (req, res) => {
  try {
    const validation = GenerateUploadUrlSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Invalid request payload',
          details: validation.error.errors,
        },
      });
    }

    const { applicationId, fileName, fileSize, mimeType } = validation.data;
    const candidateId = req.user!.id;

    // Verify candidate owns the application
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application || application.candidateId !== candidateId) {
      return res.status(403).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to upload a resume for this application',
        },
      });
    }

    const result = await generatePresignedUrl({
      candidateId,
      applicationId,
      fileName,
      fileSize,
      mimeType,
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof ResumeUploadError) {
      const statusCode = error.code === 'INVALID_FILE_TYPE' || error.code === 'FILE_TOO_LARGE' ? 400 : 500;
      return res.status(statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    logger.error('Error generating presigned URL', {
      error: error instanceof Error ? error.message : String(error),
      candidateId: req.user?.id,
    });

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to generate upload URL',
      },
    });
  }
});

export default router;
```

### 3. Register Route in App

**File**: `backend/src/app.ts`

```typescript
import resumesRouter from './routes/resumes';

// ... existing routes
app.use('/api/resumes', resumesRouter);
```

---

## Acceptance Criteria

- [x] resumeService.ts with generatePresignedUrl function
- [x] File type validation (PDF, DOCX only)
- [x] File size validation (≤ 10 MB)
- [x] Unique storage key generation with candidate ID scope
- [x] Pending Resume record created in database
- [x] Supabase presigned URL generated with 5-min expiry
- [x] POST /api/resumes/presigned-url endpoint
- [x] Ownership verification (candidate owns application)
- [x] Error handling (INVALID_FILE_TYPE, FILE_TOO_LARGE)
- [x] Logging for presigned URL generation

---

## Testing Requirements

**Unit Tests** (`resumeService.test.ts`):
- ✓ Validates file type (PDF, DOCX allowed)
- ✓ Rejects invalid file types (.exe, .zip)
- ✓ Validates file size (≤ 10 MB)
- ✓ Rejects oversized files
- ✓ Generates unique storage keys
- ✓ Creates pending Resume record

**Integration Tests** (`resumes.integration.test.ts`):
- ✓ POST /presigned-url returns 200 with valid input
- ✓ Returns 400 for invalid file type
- ✓ Returns 400 for oversized file
- ✓ Returns 403 when candidate doesn't own application
- ✓ Returns 401 when unauthenticated

---

## Dependencies

- Supabase Storage bucket `resumes` created
- env.SUPABASE_URL and env.SUPABASE_SERVICE_ROLE_KEY configured
- Resume model exists in Prisma schema

---

## Effort Estimate

**2 hours** — Standard presigned URL generation pattern with validation
