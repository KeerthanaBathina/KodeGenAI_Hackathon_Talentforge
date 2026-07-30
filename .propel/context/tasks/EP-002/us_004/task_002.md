---
id: task_002
us_id: us_004
epic: EP-002
title: "Send Confirmation Email on Application Submission"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-002 — Send Confirmation Email on Application Submission

## Context

**User Story**: US-004 — Application Submission Confirmation and Pre-Review Withdrawal  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 1 (confirmation email within 60s)

Integrate email sending into the application submission flow. Send confirmation email immediately after successful submission with application reference ID and tracking link.

---

## Objective

Trigger confirmation email send when:
1. Application status transitions from 'draft' to 'submitted'
2. Email includes all required data (reference ID, role title, timeline)
3. Email is queued/sent within 60 seconds

---

## Implementation

### 1. Email Service Integration

**File**: `backend/src/services/emailService.ts`

```typescript
import { renderApplicationReceivedEmail, renderApplicationWithdrawnEmail } from '../email/templateRenderer';
import logger from '../utils/logger';
import { env } from '../config/env';

// Assuming existing email infrastructure (Resend, SendGrid, etc.)
import { sendEmail } from '../integrations/emailProvider';

export interface SendApplicationReceivedEmailParams {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  requisitionDepartment: string;
  applicationId: string;
  submittedAt: Date;
}

export interface SendApplicationWithdrawnEmailParams {
  candidateEmail: string;
  candidateName: string;
  requisitionTitle: string;
  applicationId: string;
  withdrawnAt: Date;
}

const COMPANY_NAME = 'TalentForge';
const REVIEW_TIMELINE_DAYS = 5;

export async function sendApplicationReceivedEmail(
  params: SendApplicationReceivedEmailParams
): Promise<void> {
  const {
    candidateEmail,
    candidateName,
    requisitionTitle,
    requisitionDepartment,
    applicationId,
    submittedAt,
  } = params;

  try {
    logger.info('Sending application received email', { candidateEmail, applicationId });

    const trackApplicationUrl = `${env.FRONTEND_URL}/applications/track/${applicationId}`;

    const htmlBody = await renderApplicationReceivedEmail({
      candidateName,
      requisitionTitle,
      companyName: COMPANY_NAME,
      applicationId,
      department: requisitionDepartment,
      submittedAt: submittedAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      reviewTimelineDays: REVIEW_TIMELINE_DAYS,
      trackApplicationUrl,
    });

    await sendEmail({
      to: candidateEmail,
      subject: `Application Received: ${requisitionTitle}`,
      html: htmlBody,
    });

    logger.info('Application received email sent successfully', { candidateEmail, applicationId });
  } catch (error) {
    logger.error('Failed to send application received email', {
      candidateEmail,
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - email failure shouldn't block submission
  }
}

export async function sendApplicationWithdrawnEmail(
  params: SendApplicationWithdrawnEmailParams
): Promise<void> {
  const { candidateEmail, candidateName, requisitionTitle, applicationId, withdrawnAt } = params;

  try {
    logger.info('Sending application withdrawn email', { candidateEmail, applicationId });

    const browseJobsUrl = `${env.FRONTEND_URL}/jobs`;

    const htmlBody = await renderApplicationWithdrawnEmail({
      candidateName,
      requisitionTitle,
      companyName: COMPANY_NAME,
      applicationId,
      withdrawnAt: withdrawnAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      browseJobsUrl,
    });

    await sendEmail({
      to: candidateEmail,
      subject: `Application Withdrawn: ${requisitionTitle}`,
      html: htmlBody,
    });

    logger.info('Application withdrawn email sent successfully', { candidateEmail, applicationId });
  } catch (error) {
    logger.error('Failed to send application withdrawn email', {
      candidateEmail,
      applicationId,
      error: error instanceof Error ? error.message : String(error),
    });
    // Don't throw - email failure shouldn't block withdrawal
  }
}
```

### 2. Update Application Submission to Send Email

**File**: `backend/src/services/applicationDraftService.ts` (modify `submitDraft` function)

```typescript
import { sendApplicationReceivedEmail } from './emailService';

export async function submitDraft(params: SubmitDraftParams): Promise<Application> {
  // ... existing eligibility checks

  // Update to submitted status
  const submittedApplication = await prisma.application.update({
    where: { id: draft.id },
    data: {
      status: 'submitted',
      submittedAt: new Date(),
      draftData: null,
      draftSavedAt: null,
      updatedAt: new Date(),
    },
    include: {
      requisition: true,
      candidate: {
        include: {
          profile: true,
        },
      },
    },
  });

  // Audit event
  await auditEvent({
    entityType: 'application',
    entityId: submittedApplication.id,
    action: 'draft.submitted',
    actorId: candidateId,
    metadata: {
      requisitionId,
      submittedAt: submittedApplication.submittedAt,
    },
  });

  // Send confirmation email (async, don't block response)
  setImmediate(async () => {
    try {
      await sendApplicationReceivedEmail({
        candidateEmail: submittedApplication.candidate.email,
        candidateName: submittedApplication.candidate.profile?.fullName || 'Candidate',
        requisitionTitle: submittedApplication.requisition.title,
        requisitionDepartment: submittedApplication.requisition.department,
        applicationId: submittedApplication.id,
        submittedAt: submittedApplication.submittedAt!,
      });
    } catch (error) {
      logger.error('Email sending failed but submission succeeded', {
        applicationId: submittedApplication.id,
        error,
      });
    }
  });

  logger.info('Draft submitted successfully', {
    applicationId: submittedApplication.id,
    candidateId,
    requisitionId,
    submittedAt: submittedApplication.submittedAt,
  });

  return submittedApplication;
}
```

### 3. Environment Variables

**File**: `backend/src/config/env.ts` (add if not exists)

```typescript
export const env = {
  // ... existing vars
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  EMAIL_FROM: process.env.EMAIL_FROM || 'noreply@talentforge.app',
};
```

---

## Acceptance Criteria

- [ ] `sendApplicationReceivedEmail()` function created in emailService
- [ ] Email includes all required fields (reference ID, role, timeline, tracking URL)
- [ ] Email sent asynchronously (doesn't block API response)
- [ ] Email sent within 60 seconds of submission
- [ ] Email failure logged but doesn't block submission
- [ ] `submitDraft()` calls email service after successful submission
- [ ] Email includes clickable "Track My Application" link
- [ ] FRONTEND_URL environment variable configured

---

## Testing

**Unit Test**:
```typescript
describe('emailService', () => {
  it('should send application received email with correct data', async () => {
    const params = {
      candidateEmail: 'test@example.com',
      candidateName: 'John Doe',
      requisitionTitle: 'Software Engineer',
      requisitionDepartment: 'Engineering',
      applicationId: '123e4567-e89b-12d3-a456-426614174000',
      submittedAt: new Date(),
    };

    await sendApplicationReceivedEmail(params);

    // Verify email was sent (mock email provider)
    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'test@example.com',
      subject: 'Application Received: Software Engineer',
      html: expect.stringContaining('123e4567-e89b-12d3-a456-426614174000'),
    });
  });
});
```

**Integration Test**:
```typescript
it('should send confirmation email after successful submission', async () => {
  // Submit draft
  const response = await request(app)
    .post(`/api/applications/drafts/${requisitionId}/submit`)
    .set('Cookie', [`token=${candidateToken}`]);

  expect(response.status).toBe(200);

  // Wait for email to be sent (async)
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify email was sent
  expect(mockSendEmail).toHaveBeenCalled();
});
```

---

## Dependencies

- TASK-001 (email templates)
- Existing email infrastructure (Resend, SendGrid, etc.)
- Environment variable: FRONTEND_URL

---

## Effort

**Estimated**: 2 hours
- Email service functions: 1h
- Integration into submission flow: 0.5h
- Testing: 0.5h
