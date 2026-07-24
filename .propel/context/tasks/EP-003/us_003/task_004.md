---
id: task_004
us_id: us_003
epic: EP-003
title: "Implement Auto-Rejection Flow with Email Notification"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Implement Auto-Rejection Flow with Email Notification

## Context

**User Story**: US-003 — AI Screening Score Computation with Configurable Thresholds  
**Epic**: EP-003 — AI Resume Parsing  
**Addresses**: Scenario 3 (auto-rejection for below-threshold scores)

Implement automated rejection workflow for applications that score below the reject threshold. Sends professional rejection email to candidates and updates application status.

---

## Objective

Create auto-rejection flow that:
1. Triggers when screening recommendation is 'reject'
2. Sends professional rejection email to candidate
3. Updates application status to 'rejected'
4. Logs rejection for compliance/audit trail
5. Provides opt-out for auto-rejection (admin override)

---

## Implementation Steps

### Step 1 — Create Rejection Email Template

Create `backend/src/email/templates/application-rejected.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Update</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; border-left: 4px solid #6c757d; padding: 15px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 10px 0; color: #495057;">Application Status Update</h2>
  </div>

  <p>Dear {{candidateName}},</p>

  <p>Thank you for your interest in the <strong>{{requisitionTitle}}</strong> position at {{companyName}}.</p>

  <p>After careful review of your application, we have decided to move forward with other candidates whose qualifications more closely match our current requirements.</p>

  <p>We appreciate the time you invested in applying and encourage you to explore other opportunities that may be a better fit for your skills and experience.</p>

  <div style="background-color: #e7f3ff; padding: 15px; border-radius: 6px; margin: 20px 0;">
    <p style="margin: 0;"><strong>Stay Connected:</strong></p>
    <p style="margin: 10px 0 0 0;">
      Visit our <a href="{{careersUrl}}" style="color: #0066cc;">careers page</a> to view other open positions that might interest you.
    </p>
  </div>

  <p>We wish you the best in your job search and future endeavors.</p>

  <p>Sincerely,<br>
  {{companyName}} Talent Acquisition Team</p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

  <p style="font-size: 12px; color: #6b7280; text-align: center;">
    This is an automated message regarding your application (ID: {{applicationId}}).
  </p>
</body>
</html>
```

### Step 2 — Add Template Renderer Function

Update `backend/src/email/templateRenderer.ts`:

```typescript
export interface ApplicationRejectedData {
  candidateName: string;
  requisitionTitle: string;
  companyName: string;
  applicationId: string;
  careersUrl: string;
}

export async function renderApplicationRejectedEmail(
  data: ApplicationRejectedData
): Promise<string> {
  try {
    const templatePath = path.join(__dirname, 'templates', 'application-rejected.html');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = Handlebars.compile(templateContent);
    return template(data);
  } catch (error) {
    logger.error('Failed to render rejection email template', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

### Step 3 — Create Rejection Service

Create `backend/src/services/rejectionService.ts`:

```typescript
import prisma from '../db/prisma';
import { sendEmail } from './emailService';
import { renderApplicationRejectedEmail } from '../email/templateRenderer';
import { auditEvent } from './auditService';
import { env } from '../config/env';
import logger from '../utils/logger';

export interface RejectionParams {
  applicationId: string;
  reason: 'screening' | 'manual';
  screeningScore?: number;
}

export async function processRejection(params: RejectionParams): Promise<void> {
  const { applicationId, reason, screeningScore } = params;

  try {
    // Fetch application with candidate and requisition
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: {
          include: {
            profile: true,
          },
        },
        requisition: true,
      },
    });

    if (!application) {
      throw new Error('Application not found');
    }

    // Update application status
    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'rejected',
        rejectedAt: new Date(),
      },
    });

    // Send rejection email
    const candidateName = application.candidate.profile?.fullName || 'Candidate';
    const careersUrl = `${env.FRONTEND_URL}/careers`;

    const emailData = {
      candidateName,
      requisitionTitle: application.requisition.title,
      companyName: 'TalentForge',
      applicationId: applicationId.substring(0, 8).toUpperCase(),
      careersUrl,
    };

    const htmlBody = await renderApplicationRejectedEmail(emailData);

    setImmediate(async () => {
      try {
        await sendEmail({
          to: application.candidate.email,
          subject: `Application Status Update - ${application.requisition.title}`,
          html: htmlBody,
        });

        logger.info('Rejection email sent', {
          applicationId,
          candidateEmail: application.candidate.email,
        });
      } catch (emailError) {
        logger.error('Failed to send rejection email', {
          applicationId,
          error: emailError,
        });
      }
    });

    // Log audit event
    await auditEvent({
      entityType: 'application',
      entityId: applicationId,
      action: `application.rejected.${reason}`,
      actorId: 'system',
      metadata: {
        reason,
        screeningScore,
        candidateId: application.candidateId,
      },
    });

    logger.info('Application rejected', {
      applicationId,
      reason,
      score: screeningScore,
    });
  } catch (error) {
    logger.error('Rejection processing failed', {
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
```

### Step 4 — Integrate with Screening Service

Update `backend/src/services/screeningService.ts`:

```typescript
import { processRejection } from './rejectionService';

// In performScreening(), after creating screening:
if (recommendation === 'reject') {
  setImmediate(async () => {
    try {
      await processRejection({
        applicationId,
        reason: 'screening',
        screeningScore: score,
      });
    } catch (error) {
      logger.error('Auto-rejection failed', { applicationId, error });
    }
  });
}
```

---

## Acceptance Criteria

- [ ] Rejection triggered automatically when score ≤ reject threshold
- [ ] Professional rejection email sent to candidate
- [ ] Application status updated to 'rejected'
- [ ] Rejection audit event logged
- [ ] Email sent asynchronously (doesn't block screening)
- [ ] Rejection includes reference ID for candidate support

---

## Testing Checklist

- [ ] Unit test: Rejection updates application status
- [ ] Unit test: Rejection email rendered correctly
- [ ] Integration test: Full rejection flow end-to-end
- [ ] Integration test: Email sent to correct address
- [ ] Integration test: Audit event logged
- [ ] E2E test: Low score → auto-rejection

---

## Dependencies

- Email service and templates
- Application status enum includes 'rejected'
- Screening service (TASK-003)
- Audit service

---

## Definition of Done

- [ ] Rejection email template created
- [ ] Rejection service implemented
- [ ] Integration with screening service complete
- [ ] Email sending verified (mock mode)
- [ ] Audit logging working
- [ ] All tests passing
