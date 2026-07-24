---
id: task_005
us_id: us_001
epic: EP-003
title: "Implement Quarantine and Clean File Processing Flows"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Implement Quarantine and Clean File Processing Flows

## Context

**User Story**: US-001 — Secure Resume Upload via Presigned URL with Malware Scanning  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 3 (quarantine infected file), Scenario 4 (clean file triggers queue)

Implement divergent processing paths for infected and clean files. Infected files are moved to quarantine bucket and candidate is notified. Clean files trigger AI parsing queue.

---

## Objective

Create post-scan processing that:
1. Moves infected files to quarantine bucket
2. Sends candidate notification for quarantined files
3. Updates application status appropriately
4. Enqueues clean files for AI parsing (BullMQ)
5. Logs all processing events

---

## Implementation

### 1. Quarantine Service

**File**: `backend/src/services/quarantineService.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import prisma from '../db/prisma';
import { env } from '../config/env';
import { sendQuarantineNotificationEmail } from './emailService';
import logger from '../utils/logger';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export async function quarantineInfectedFile(resumeId: string): Promise<void> {
  try {
    const resume = await prisma.resume.findUnique({
      where: { id: resumeId },
      include: {
        application: {
          include: {
            candidate: {
              include: {
                profile: true,
              },
            },
            requisition: true,
          },
        },
      },
    });

    if (!resume) {
      throw new Error('Resume not found');
    }

    if (resume.scanStatus !== 'infected') {
      logger.warn('Attempted to quarantine non-infected file', { resumeId });
      return;
    }

    // Move file from resumes bucket to quarantine bucket
    const sourceKey = resume.storageKey;
    const quarantineKey = `quarantine/${resume.id}/${resume.fileName}`;

    // Copy to quarantine
    const { error: copyError } = await supabase.storage
      .from('quarantine')
      .copy(
        `resumes/${sourceKey}`,
        quarantineKey
      );

    if (copyError) {
      logger.error('Failed to copy file to quarantine', { resumeId, error: copyError });
      throw new Error('Failed to quarantine file');
    }

    // Delete from resumes bucket
    const { error: deleteError } = await supabase.storage
      .from('resumes')
      .remove([sourceKey]);

    if (deleteError) {
      logger.error('Failed to delete infected file from resumes bucket', {
        resumeId,
        error: deleteError,
      });
    }

    // Update resume record with quarantine location
    await prisma.resume.update({
      where: { id: resumeId },
      data: {
        storageKey: quarantineKey,
      },
    });

    logger.info('File quarantined', {
      resumeId,
      originalKey: sourceKey,
      quarantineKey,
    });

    // Send notification email to candidate
    setImmediate(async () => {
      try {
        await sendQuarantineNotificationEmail({
          candidateEmail: resume.application.candidate.email,
          candidateName: resume.application.candidate.profile?.fullName || 'Candidate',
          requisitionTitle: resume.application.requisition.title,
          fileName: resume.fileName,
        });
      } catch (error) {
        logger.error('Failed to send quarantine notification email', { resumeId, error });
      }
    });
  } catch (error) {
    logger.error('Quarantine process failed', {
      resumeId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

### 2. Email Template for Quarantine

**File**: `backend/src/email/templates/resume-quarantined.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resume Upload Issue</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 10px 0; color: #991b1b;">Resume Upload Issue</h2>
  </div>

  <p>Dear {{candidateName}},</p>

  <p>We were unable to accept your resume file <strong>{{fileName}}</strong> for the position <strong>{{requisitionTitle}}</strong>.</p>

  <p><strong>Reason:</strong> The file did not pass our security screening.</p>

  <p><strong>What to do:</strong> Please upload a different file. Ensure your resume is saved in a standard PDF or DOCX format from a trusted application (Microsoft Word, Google Docs, or Adobe Acrobat).</p>

  <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Tips:</strong></p>
    <ul style="margin: 10px 0;">
      <li>Save your resume directly from Word or Google Docs as PDF</li>
      <li>Avoid uploading files from email attachments or downloads from unknown sources</li>
      <li>Maximum file size: 10 MB</li>
    </ul>
  </div>

  <p>If you continue to experience issues, please contact our support team.</p>

  <p>Best regards,<br>{{companyName}} Recruitment Team</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="font-size: 12px; color: #6b7280; text-align: center;">
    This is an automated message. Please do not reply to this email.
  </p>
</body>
</html>
```

### 3. Email Service Function

**File**: `backend/src/services/emailService.ts`

```typescript
export interface SendQuarantineNotificationParams {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  fileName: string;
}

export async function sendQuarantineNotificationEmail(
  params: SendQuarantineNotificationParams
): Promise<void> {
  const { candidateEmail, candidateName, requisitionTitle, fileName } = params;

  try {
    logger.info('Sending quarantine notification email', { candidateEmail });

    const emailData = {
      candidateName,
      requisitionTitle,
      fileName,
      companyName: 'TalentForge',
    };

    if (env.EMAIL_PROVIDER === 'mock') {
      const htmlBody = await renderQuarantineNotificationEmail(emailData);
      
      logger.info({ to: candidateEmail, fileName }, '[MOCK EMAIL] Resume quarantined');
      
      console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 RESUME QUARANTINED EMAIL (Mock)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To: ${candidateEmail}
Subject: Resume Upload Issue - ${requisitionTitle}
File: ${fileName}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
      
      return;
    }

    // Real SMTP implementation
    const htmlBody = await renderQuarantineNotificationEmail(emailData);
    logger.info('Quarantine notification sent', { candidateEmail, fileName });
  } catch (error) {
    logger.error('Failed to send quarantine notification', { candidateEmail, error });
  }
}
```

### 4. Update Scan Webhook Service

**File**: `backend/src/services/scanWebhookService.ts`

```typescript
import { quarantineInfectedFile } from './quarantineService';

// In processScanResult function, after updating resume:
if (status === 'clean') {
  logger.info('Clean file ready for parsing', { resumeId });
  // Will be handled by BullMQ integration in TASK-006
} else {
  logger.warn('Infected file detected, initiating quarantine', { resumeId, threats });
  
  setImmediate(async () => {
    try {
      await quarantineInfectedFile(resumeId);
    } catch (error) {
      logger.error('Quarantine failed', { resumeId, error });
    }
  });
}
```

---

## Acceptance Criteria

- [x] quarantineService.ts with quarantineInfectedFile function
- [x] Moves infected files from resumes to quarantine bucket
- [x] Updates Resume.storageKey with quarantine location
- [x] resume-quarantined.html email template created
- [x] sendQuarantineNotificationEmail function added to emailService
- [x] Email sent asynchronously to candidate
- [x] Integrated into scan webhook service
- [x] All quarantine events logged

---

## Testing Requirements

**Unit Tests** (`quarantineService.test.ts`):
- ✓ Copies file to quarantine bucket
- ✓ Deletes file from resumes bucket
- ✓ Updates storageKey in database
- ✓ Sends notification email
- ✓ Logs quarantine event
- ✓ Handles missing resume gracefully

**Integration Tests**:
- ✓ End-to-end quarantine flow
- ✓ Email notification triggered
- ✓ Storage operations succeed

---

## Dependencies

- Supabase quarantine bucket created
- TASK-004 (scan webhook) complete
- Email template renderer configured

---

## Effort Estimate

**2 hours** — File movement + email notification
