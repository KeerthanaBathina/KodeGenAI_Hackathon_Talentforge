---
id: TASK-002
user_story: US-001
title: "Backend - Onboarding Email Notification Service"
status: completed
priority: high
assigned_to: backend-team
estimated_hours: 4
layer: backend
dependencies: [TASK-001]
completed_date: 2026-07-28
---

# TASK-002 — Backend - Onboarding Email Notification Service

## Objective

Implement onboarding email notification service that sends temporary password and onboarding instructions to newly created users.

## Scope

Extend existing email service to support user onboarding emails with temporary password delivery.

## Technical Requirements

### 1. Email Template

Create new template type for user onboarding in existing template system:

- **Template Type:** `user_onboarding` (add to TemplateType enum if needed)
- **Subject:** "Welcome to AI Interview Platform - Your Account Details"
- **Content Variables:**
  - `{{fullName}}` - User's full name
  - `{{email}}` - User's email address
  - `{{temporaryPassword}}` - Generated temporary password
  - `{{role}}` - User's assigned role
  - `{{loginUrl}}` - Link to login page (from FRONTEND_URL env)
  - `{{platformName}}` - "AI Interview Platform"

### 2. Email Service Extension

Update `/backend/src/services/emailService.ts` or `/backend/src/email/`:

- Add `sendOnboardingEmail(user: User, temporaryPassword: string): Promise<void>` function
- Use existing email provider configuration (EMAIL_PROVIDER env)
- Queue email via BullMQ emailDeliveryQueue for async delivery
- Set priority to high for onboarding emails
- Handle both 'mock' and 'smtp' providers

### 3. Email Queue Integration

Update `/backend/src/queues/emailDeliveryQueue.ts`:

- Support 'user_onboarding' email type
- Implement retry logic (3 attempts with exponential backoff)
- Log email delivery status
- Handle bounce/failure notifications

### 4. User Creation Flow Integration

Update `userManagementService.ts` from TASK-001:

- After user is created in database, queue onboarding email
- Email should be sent asynchronously (within 2 minutes per AC)
- Don't block user creation response on email delivery
- Log email queued event

### 5. Email Content

**Plain Text Version:**

```
Hello {{fullName}},

Welcome to AI Interview Platform!

Your account has been created with the following details:
- Email: {{email}}
- Role: {{role}}
- Temporary Password: {{temporaryPassword}}

Please log in at {{loginUrl}} and change your password immediately after your first login.

For security reasons, this temporary password will expire in 24 hours.

Best regards,
AI Interview Platform Team
```

**HTML Version:**

- Professional HTML template with branding
- Clear call-to-action button for login
- Highlighted temporary password
- Security notice about password expiration
- Responsive design for mobile devices

### 6. Environment Configuration

Ensure these environment variables are properly configured:

- `EMAIL_FROM` - Sender email address
- `EMAIL_PROVIDER` - 'mock' or 'smtp'
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (if SMTP)
- `FRONTEND_URL` - For login link

## Acceptance Criteria

- [ ] Onboarding email template created and stored in template system
- [ ] Email contains temporary password, role, and login URL
- [ ] Email is queued asynchronously after user creation
- [ ] Email delivery doesn't block user creation response
- [ ] Email sent within 2 minutes (queue processing)
- [ ] Failed email deliveries are retried (3 attempts)
- [ ] Email delivery status logged in audit events
- [ ] Works with both mock and SMTP providers
- [ ] HTML and plain text versions available

## Testing Requirements

- Unit test for sendOnboardingEmail function
- Integration test for email queue processing
- Test email content rendering with template variables
- Test email delivery failure and retry logic
- Test both mock and SMTP provider modes
- Verify email sent within 2-minute SLA

## Files to Modify/Create

- `/backend/src/services/emailService.ts` or `/backend/src/email/sendOnboarding.ts`
- `/backend/src/services/userManagementService.ts` (update createUser)
- `/backend/src/queues/emailDeliveryQueue.ts` (if needed)
- `/backend/src/email/templates/user-onboarding.html`
- `/backend/src/email/templates/user-onboarding.txt`
- `/backend/src/__tests__/services/emailService.test.ts`
- `/backend/src/__tests__/queues/emailDeliveryQueue.test.ts`

## Database Schema

Check if TemplateType enum needs to include `user_onboarding`:

```prisma
enum TemplateType {
  // ... existing types
  user_onboarding
}
```

## Security Considerations

- **Do NOT log temporary password in plain text**
- Email should be sent over TLS/SSL
- Temporary password should expire after 24 hours
- Consider marking user as requiring password change on first login

## Related User Story

**US-001 Acceptance Criteria:**

- ✅ Scenario 1: New user created and receives onboarding email (This task)

## Dependencies

- TASK-001 (User creation API must be complete)
- Existing email queue infrastructure (BullMQ)
- Template system from existing codebase

## Notes

- Use existing email infrastructure from the application
- Leverage BullMQ for reliable async email delivery
- Email timing: The 2-minute requirement allows for queue processing time
- Consider adding email delivery status check endpoint for debugging
