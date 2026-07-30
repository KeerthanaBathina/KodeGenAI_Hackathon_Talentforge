---
id: task_004
us_id: us_004
epic: EP-002
title: "Update Application Success Page with Reference ID and Tracking Link"
status: done
layer: frontend
effort: 1h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-004 — Update Application Success Page with Reference ID and Tracking Link

## Context

**User Story**: US-004 — Application Submission Confirmation and Pre-Review Withdrawal  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 2 (submission confirmation screen)

Update the application success page to display:
1. Application reference ID prominently
2. "Track My Application" button/link
3. Expected timeline information
4. Email confirmation notice

---

## Objective

Enhance the existing success page (already created in US-002) to include reference ID and tracking functionality.

---

## Implementation

**File**: `frontend/src/app/jobs/[id]/application-success/page.tsx` (update existing)

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Application {
  id: string;
  requisitionId: string;
  status: string;
  submittedAt: string;
}

interface Requisition {
  id: string;
  title: string;
  department: string;
}

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

export default function ApplicationSuccessPage() {
  const params = useParams();
  const router = useRouter();
  const requisitionId = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch submitted application for this requisition
        const appResponse = await fetch(
          getApiUrl(`/api/applications/by-requisition/${requisitionId}`),
          { credentials: 'include' }
        );

        if (appResponse.ok) {
          const appData = await appResponse.json();
          setApplication(appData);
        }

        // Fetch requisition details
        const reqResponse = await fetch(getApiUrl(`/api/requisitions/${requisitionId}`));

        if (reqResponse.ok) {
          const reqData = await reqResponse.json();
          setRequisition(reqData);
        }
      } catch (error) {
        console.error('Error loading application data:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [requisitionId]);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        {/* Success Card */}
        <div style={{ backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '3rem', textAlign: 'center' }}>
          {/* Success Icon */}
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              backgroundColor: '#d1fae5',
              margin: '0 auto 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              style={{ width: '48px', height: '48px', color: '#10b981' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>
            Application Submitted Successfully
          </h1>

          {/* Job Title */}
          {requisition && (
            <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '2rem' }}>
              {requisition.title} — {requisition.department}
            </p>
          )}

          {/* Reference ID */}
          {application && (
            <div
              style={{
                backgroundColor: '#f3f4f6',
                borderRadius: '8px',
                padding: '1.5rem',
                marginBottom: '2rem',
              }}
            >
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '500' }}>
                Application Reference ID
              </p>
              <p
                style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: '#3b82f6',
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em',
                }}
              >
                {application.id.toUpperCase().slice(0, 8)}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                Save this ID to track your application
              </p>
            </div>
          )}

          {/* Email Confirmation Notice */}
          <div
            style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px',
              padding: '1rem',
              marginBottom: '2rem',
              textAlign: 'left',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#1e40af', margin: 0 }}>
              📧 <strong>Confirmation email sent!</strong>
              <br />
              Check your inbox for application details and next steps.
            </p>
          </div>

          {/* What's Next Section */}
          <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
              What Happens Next?
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span style={{ color: '#10b981', marginRight: '0.75rem', fontSize: '1.25rem' }}>1.</span>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Our team will review your application within <strong>5 business days</strong>
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <span style={{ color: '#10b981', marginRight: '0.75rem', fontSize: '1.25rem' }}>2.</span>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  You'll receive an email update when your application moves to the next stage
                </span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ color: '#10b981', marginRight: '0.75rem', fontSize: '1.25rem' }}>3.</span>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  Track your application status anytime using the button below
                </span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {application && (
              <Link
                href={`/applications/track/${application.id}`}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontWeight: '500',
                  fontSize: '1rem',
                  textAlign: 'center',
                }}
              >
                📊 Track My Application
              </Link>
            )}

            <Link
              href="/jobs"
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'white',
                color: '#3b82f6',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                textDecoration: 'none',
                fontWeight: '500',
                fontSize: '1rem',
                textAlign: 'center',
              }}
            >
              Browse More Positions
            </Link>
          </div>
        </div>

        {/* Additional Help */}
        <p style={{ textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', marginTop: '2rem' }}>
          Need to make changes?{' '}
          {application && application.status === 'submitted' && (
            <Link href={`/applications/track/${application.id}`} style={{ color: '#3b82f6', textDecoration: 'underline' }}>
              You can withdraw your application
            </Link>
          )}
          {' '}before HR review begins.
        </p>
      </div>
    </div>
  );
}
```

### Add Backend Endpoint to Fetch Application by Requisition

**File**: `backend/src/routes/applications.ts`

```typescript
/**
 * GET /api/applications/by-requisition/:requisitionId
 * Get candidate's application for a specific requisition
 */
router.get('/by-requisition/:requisitionId', authenticate, async (req, res) => {
  try {
    const requisitionId = req.params.requisitionId;
    const candidateId = req.user!.id;

    const application = await prisma.application.findFirst({
      where: {
        candidateId,
        requisitionId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!application) {
      return res.status(404).json({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: 'No application found for this requisition',
        },
      });
    }

    return res.status(200).json(application);
  } catch (error) {
    logger.error('Error fetching application by requisition', {
      error: error instanceof Error ? error.message : String(error),
      candidateId: req.user?.id,
      requisitionId: req.params.requisitionId,
    });

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An error occurred while fetching the application',
      },
    });
  }
});
```

---

## Acceptance Criteria

- [ ] Success page displays application reference ID (first 8 characters uppercase)
- [ ] "Track My Application" button navigates to `/applications/track/:id`
- [ ] Email confirmation notice displayed ("Check your inbox")
- [ ] "What Happens Next?" section with 3-step timeline
- [ ] "Browse More Positions" link back to jobs page
- [ ] Withdrawal hint shown for submitted applications
- [ ] Reference ID styled with monospace font for easy copying
- [ ] Success icon (green checkmark) displayed prominently
- [ ] Backend endpoint GET `/api/applications/by-requisition/:requisitionId` created

---

## Testing

**E2E Test**:
```typescript
test('should display reference ID and tracking link on success page', async ({ page }) => {
  // Submit application
  await page.goto('/jobs/123/apply');
  // ... complete and submit form

  // Verify success page
  await expect(page).toHaveURL(/\/application-success$/);
  
  // Verify reference ID displayed
  await expect(page.locator('text=Application Reference ID')).toBeVisible();
  await expect(page.locator('[style*="monospace"]')).toBeVisible();
  
  // Verify tracking button
  const trackButton = page.locator('a:has-text("Track My Application")');
  await expect(trackButton).toBeVisible();
  await expect(trackButton).toHaveAttribute('href', /\/applications\/track\//);
  
  // Verify email notice
  await expect(page.locator('text=Confirmation email sent')).toBeVisible();
});
```

---

## Dependencies

- US-002 success page (existing)
- Application ID returned from submission API

---

## Effort

**Estimated**: 1 hour
- Update success page component: 0.5h
- Add backend endpoint: 0.25h
- Testing: 0.25h
