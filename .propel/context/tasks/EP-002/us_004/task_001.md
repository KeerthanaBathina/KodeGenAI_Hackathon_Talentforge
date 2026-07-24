---
id: task_001
us_id: us_004
epic: EP-002
title: "Create Email Templates for Application Confirmation and Withdrawal"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-001 — Create Email Templates for Application Confirmation and Withdrawal

## Context

**User Story**: US-004 — Application Submission Confirmation and Pre-Review Withdrawal  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 1 (confirmation email), Scenario 3 (withdrawal email)

Create professional email templates for:
1. Application received confirmation (sent immediately after submission)
2. Application withdrawal acknowledgement (sent after withdrawal)

---

## Objective

Design and implement HTML email templates that include:
- **Confirmation**: Role title, company name, reference ID, expected timeline
- **Withdrawal**: Confirmation of withdrawal, reference ID, encouragement to apply again

Templates should be responsive, branded, and include all required variables.

---

## Implementation

**Email Templates Directory**: `backend/src/email/templates/`

### 1. Application Received Template

**File**: `application-received.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Received</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #3b82f6; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">Application Received</h1>
  </div>
  
  <div style="padding: 30px; background-color: #f9fafb;">
    <p>Dear {{candidateName}},</p>
    
    <p>Thank you for applying to <strong>{{requisitionTitle}}</strong> at <strong>{{companyName}}</strong>.</p>
    
    <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2 style="margin-top: 0; color: #3b82f6;">Application Details</h2>
      <p><strong>Reference ID:</strong> {{applicationId}}</p>
      <p><strong>Position:</strong> {{requisitionTitle}}</p>
      <p><strong>Department:</strong> {{department}}</p>
      <p><strong>Submitted:</strong> {{submittedAt}}</p>
    </div>
    
    <h3 style="color: #3b82f6;">What Happens Next?</h3>
    <ul>
      <li>Our team will review your application within <strong>{{reviewTimelineDays}} business days</strong></li>
      <li>You'll receive an email update once your application moves to the next stage</li>
      <li>Track your application status anytime using your reference ID</li>
    </ul>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="{{trackApplicationUrl}}" 
         style="background-color: #3b82f6; color: white; padding: 12px 30px; 
                text-decoration: none; border-radius: 6px; display: inline-block;">
        Track My Application
      </a>
    </div>
    
    <p style="font-size: 0.9em; color: #6b7280; margin-top: 30px;">
      <strong>Need to make changes?</strong><br>
      You can withdraw your application before HR review begins by clicking "Track My Application" 
      and selecting "Withdraw Application".
    </p>
  </div>
  
  <div style="background-color: #e5e7eb; padding: 20px; text-align: center; font-size: 0.85em; color: #6b7280;">
    <p>This is an automated message. Please do not reply to this email.</p>
    <p>&copy; 2026 {{companyName}}. All rights reserved.</p>
  </div>
</body>
</html>
```

### 2. Application Withdrawn Template

**File**: `application-withdrawn.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Withdrawn</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #6b7280; color: white; padding: 20px; text-align: center;">
    <h1 style="margin: 0;">Application Withdrawn</h1>
  </div>
  
  <div style="padding: 30px; background-color: #f9fafb;">
    <p>Dear {{candidateName}},</p>
    
    <p>This confirms that you have withdrawn your application for <strong>{{requisitionTitle}}</strong> 
       at <strong>{{companyName}}</strong>.</p>
    
    <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2 style="margin-top: 0; color: #6b7280;">Withdrawal Confirmation</h2>
      <p><strong>Reference ID:</strong> {{applicationId}}</p>
      <p><strong>Position:</strong> {{requisitionTitle}}</p>
      <p><strong>Withdrawn:</strong> {{withdrawnAt}}</p>
    </div>
    
    <p>Your application has been removed from the review queue. This action cannot be undone.</p>
    
    <h3 style="color: #3b82f6;">We'd Love to See You Again</h3>
    <p>We appreciate your interest in joining our team. We encourage you to explore other 
       opportunities with us that may be a better fit.</p>
    
    <div style="margin: 30px 0; text-align: center;">
      <a href="{{browseJobsUrl}}" 
         style="background-color: #10b981; color: white; padding: 12px 30px; 
                text-decoration: none; border-radius: 6px; display: inline-block;">
        Browse Open Positions
      </a>
    </div>
  </div>
  
  <div style="background-color: #e5e7eb; padding: 20px; text-align: center; font-size: 0.85em; color: #6b7280;">
    <p>This is an automated message. Please do not reply to this email.</p>
    <p>&copy; 2026 {{companyName}}. All rights reserved.</p>
  </div>
</body>
</html>
```

### 3. Template Rendering Service

**File**: `backend/src/email/templateRenderer.ts`

```typescript
import fs from 'fs/promises';
import path from 'path';
import Handlebars from 'handlebars';

interface ApplicationReceivedData {
  candidateName: string;
  requisitionTitle: string;
  companyName: string;
  applicationId: string;
  department: string;
  submittedAt: string;
  reviewTimelineDays: number;
  trackApplicationUrl: string;
}

interface ApplicationWithdrawnData {
  candidateName: string;
  requisitionTitle: string;
  companyName: string;
  applicationId: string;
  withdrawnAt: string;
  browseJobsUrl: string;
}

export async function renderApplicationReceivedEmail(
  data: ApplicationReceivedData
): Promise<string> {
  const templatePath = path.join(__dirname, 'templates', 'application-received.html');
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const template = Handlebars.compile(templateContent);
  return template(data);
}

export async function renderApplicationWithdrawnEmail(
  data: ApplicationWithdrawnData
): Promise<string> {
  const templatePath = path.join(__dirname, 'templates', 'application-withdrawn.html');
  const templateContent = await fs.readFile(templatePath, 'utf-8');
  const template = Handlebars.compile(templateContent);
  return template(data);
}
```

---

## Acceptance Criteria

- [ ] `application-received.html` template created with all variables (candidateName, requisitionTitle, companyName, applicationId, department, submittedAt, reviewTimelineDays, trackApplicationUrl)
- [ ] `application-withdrawn.html` template created with all variables (candidateName, requisitionTitle, companyName, applicationId, withdrawnAt, browseJobsUrl)
- [ ] Templates are responsive (mobile-friendly)
- [ ] Templates include company branding colors (#3b82f6 primary, #10b981 success)
- [ ] Template renderer service created using Handlebars
- [ ] Renderer functions handle missing variables gracefully

---

## Testing

**Manual Test**:
```typescript
const html = await renderApplicationReceivedEmail({
  candidateName: 'John Doe',
  requisitionTitle: 'Senior Software Engineer',
  companyName: 'TalentForge',
  applicationId: 'APP-2026-001234',
  department: 'Engineering',
  submittedAt: 'July 24, 2026',
  reviewTimelineDays: 5,
  trackApplicationUrl: 'https://talentforge.app/applications/track/APP-2026-001234',
});

console.log(html); // Verify HTML renders correctly
```

---

## Dependencies

- Handlebars package: `npm install handlebars @types/handlebars`
- Email service infrastructure (existing)

---

## Effort

**Estimated**: 2 hours
- Template design: 1h
- Renderer service: 0.5h
- Testing: 0.5h
