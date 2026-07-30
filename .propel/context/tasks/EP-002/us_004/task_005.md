---
id: task_005
us_id: us_004
epic: EP-002
title: "Create Application Tracking Page with Withdrawal Button"
status: done
layer: frontend
effort: 3h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-005 — Create Application Tracking Page with Withdrawal Button

## Context

**User Story**: US-004 — Application Submission Confirmation and Pre-Review Withdrawal  
**Epic**: EP-002 — Job Application Submission  
**Addresses**: Scenario 3 (withdrawal CTA), Scenario 4 (withdrawal blocked after review)

Create application tracking page where candidates can:
1. View current application status
2. Withdraw application if status is 'submitted'
3. See blocking message if status is beyond 'submitted'

---

## Objective

Build tracking page with:
- Application status display (timeline/stepper)
- Conditional withdrawal button (only for 'submitted' status)
- Withdrawal confirmation dialog
- Status-based messaging

---

## Implementation

### 1. Application Tracking Page

**File**: `frontend/src/app/applications/track/[id]/page.tsx`

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Toast from '@/components/Toast';

interface Application {
  id: string;
  requisitionId: string;
  candidateId: string;
  status: string;
  submittedAt: string;
  updatedAt: string;
}

interface Requisition {
  id: string;
  title: string;
  department: string;
  location: string;
}

interface CanWithdrawResponse {
  canWithdraw: boolean;
  reason?: string;
}

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }
  return `${base}${pathname}`;
}

const statusSteps = [
  { key: 'submitted', label: 'Submitted', description: 'Application received' },
  { key: 'screening', label: 'Screening', description: 'Initial review' },
  { key: 'pending_review', label: 'HR Review', description: 'Under evaluation' },
  { key: 'interviewing', label: 'Interview', description: 'Interview scheduled' },
  { key: 'offered', label: 'Offer', description: 'Offer extended' },
];

export default function ApplicationTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [canWithdraw, setCanWithdraw] = useState<boolean>(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch application
        const appResponse = await fetch(getApiUrl(`/api/applications/${applicationId}`), {
          credentials: 'include',
        });

        if (appResponse.ok) {
          const appData = await appResponse.json();
          setApplication(appData);

          // Fetch requisition
          const reqResponse = await fetch(getApiUrl(`/api/requisitions/${appData.requisitionId}`));
          if (reqResponse.ok) {
            const reqData = await reqResponse.json();
            setRequisition(reqData);
          }

          // Check withdrawal eligibility
          const withdrawResponse = await fetch(
            getApiUrl(`/api/applications/${applicationId}/can-withdraw`),
            { credentials: 'include' }
          );

          if (withdrawResponse.ok) {
            const withdrawData: CanWithdrawResponse = await withdrawResponse.json();
            setCanWithdraw(withdrawData.canWithdraw);
          }
        } else if (appResponse.status === 404) {
          setToast({ message: 'Application not found', type: 'error' });
        }
      } catch (error) {
        console.error('Error loading application:', error);
        setToast({ message: 'Failed to load application', type: 'error' });
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [applicationId]);

  async function handleWithdraw() {
    setIsWithdrawing(true);

    try {
      const response = await fetch(getApiUrl(`/api/applications/${applicationId}/withdraw`), {
        method: 'PATCH',
        credentials: 'include',
      });

      if (response.ok) {
        setToast({ message: 'Application withdrawn successfully', type: 'success' });
        setShowWithdrawDialog(false);

        // Reload application data
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        const errorData = await response.json();
        setToast({
          message: errorData.error?.message || 'Failed to withdraw application',
          type: 'error',
        });
      }
    } catch (error) {
      setToast({ message: 'An error occurred while withdrawing', type: 'error' });
    } finally {
      setIsWithdrawing(false);
    }
  }

  function getCurrentStepIndex(): number {
    if (!application) return -1;
    return statusSteps.findIndex((step) => step.key === application.status);
  }

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading application...</p>
      </div>
    );
  }

  if (!application || !requisition) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.125rem', color: '#6b7280', marginBottom: '1rem' }}>
            Application not found
          </p>
          <Link href="/jobs" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
            Browse Open Positions
          </Link>
        </div>
      </div>
    );
  }

  const currentStepIndex = getCurrentStepIndex();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb', padding: '2rem' }}>
      {/* Toast Notifications */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <Link href="/jobs" style={{ color: '#3b82f6', fontSize: '0.875rem', textDecoration: 'none' }}>
            ← Back to Jobs
          </Link>
          <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111827', marginTop: '1rem' }}>
            Track Application
          </h1>
        </div>

        {/* Application Info Card */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: '2rem',
            marginBottom: '2rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '600', color: '#111827', marginBottom: '0.5rem' }}>
                {requisition.title}
              </h2>
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                {requisition.department} • {requisition.location}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Reference ID</p>
              <p
                style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#3b82f6',
                  fontFamily: 'monospace',
                }}
              >
                {application.id.toUpperCase().slice(0, 8)}
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Submitted</p>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                {new Date(application.submittedAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Last Updated</p>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                {new Date(application.updatedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Status Timeline */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            padding: '2rem',
            marginBottom: '2rem',
          }}
        >
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '1.5rem' }}>
            Application Status
          </h3>

          <div style={{ position: 'relative' }}>
            {statusSteps.map((step, index) => (
              <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: index < statusSteps.length - 1 ? '2rem' : 0 }}>
                {/* Step Indicator */}
                <div style={{ position: 'relative', marginRight: '1rem' }}>
                  <div
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      backgroundColor: index <= currentStepIndex ? '#10b981' : '#e5e7eb',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {index < currentStepIndex ? '✓' : index + 1}
                  </div>
                  {index < statusSteps.length - 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '2.5rem',
                        left: '1.2rem',
                        width: '2px',
                        height: '2rem',
                        backgroundColor: index < currentStepIndex ? '#10b981' : '#e5e7eb',
                      }}
                    />
                  )}
                </div>

                {/* Step Content */}
                <div style={{ flex: 1, paddingTop: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem', fontWeight: '600', color: index <= currentStepIndex ? '#111827' : '#6b7280' }}>
                    {step.label}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Withdrawal Section */}
        {canWithdraw && application.status === 'submitted' && (
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              padding: '2rem',
              marginBottom: '2rem',
            }}
          >
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
              Withdraw Application
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
              You can withdraw your application before HR review begins. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowWithdrawDialog(true)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: 'white',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
              }}
            >
              Withdraw Application
            </button>
          </div>
        )}

        {/* Withdrawal Blocked Message */}
        {!canWithdraw && application.status !== 'submitted' && application.status !== 'withdrawn' && (
          <div
            style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '2rem',
            }}
          >
            <p style={{ fontSize: '0.875rem', color: '#92400e', margin: 0 }}>
              ⚠️ <strong>Withdrawal not available</strong>
              <br />
              Your application is under review. To withdraw, please contact HR directly.
            </p>
          </div>
        )}

        {/* Withdrawal Confirmation Dialog */}
        {showWithdrawDialog && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
            }}
            onClick={() => !isWithdrawing && setShowWithdrawDialog(false)}
          >
            <div
              style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                padding: '2rem',
                maxWidth: '500px',
                width: '90%',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#111827', marginBottom: '1rem' }}>
                Confirm Withdrawal
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                Are you sure you want to withdraw your application for <strong>{requisition.title}</strong>?
                This action cannot be undone.
              </p>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowWithdrawDialog(false)}
                  disabled={isWithdrawing}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: isWithdrawing ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isWithdrawing ? 'not-allowed' : 'pointer',
                    fontWeight: '500',
                  }}
                >
                  {isWithdrawing ? 'Withdrawing...' : 'Yes, Withdraw'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

### 2. Backend Endpoint for Fetching Single Application

**File**: `backend/src/routes/applications.ts` (add)

```typescript
/**
 * GET /api/applications/:id
 * Get single application by ID (candidate must own it)
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const applicationId = req.params.id;
    const candidateId = req.user!.id;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      return res.status(404).json({
        error: {
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        },
      });
    }

    // Verify ownership
    if (application.candidateId !== candidateId) {
      return res.status(403).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'You are not authorized to view this application',
        },
      });
    }

    return res.status(200).json(application);
  } catch (error) {
    logger.error('Error fetching application', {
      error: error instanceof Error ? error.message : String(error),
      candidateId: req.user?.id,
      applicationId: req.params.id,
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

- [ ] Tracking page displays application reference ID
- [ ] Status timeline shows current status and completed steps
- [ ] "Withdraw Application" button visible only when status is 'submitted'
- [ ] Withdrawal button absent for non-submitted statuses
- [ ] Withdrawal confirmation dialog appears on button click
- [ ] Dialog shows "Confirm" and "Cancel" buttons
- [ ] Successful withdrawal shows success toast and reloads page
- [ ] Blocking message shown when withdrawal not allowed
- [ ] Page shows job title, department, location
- [ ] Backend endpoint GET `/api/applications/:id` verifies ownership

---

## Testing

**E2E Test**:
```typescript
test('should show withdrawal button for submitted application', async ({ page }) => {
  await page.goto('/applications/track/submitted-app-id');

  await expect(page.locator('button:has-text("Withdraw Application")')).toBeVisible();
});

test('should hide withdrawal button for applications under review', async ({ page }) => {
  await page.goto('/applications/track/in-review-app-id');

  await expect(page.locator('button:has-text("Withdraw Application")')).not.toBeVisible();
  await expect(page.locator('text=contact HR to withdraw')).toBeVisible();
});

test('should withdraw application with confirmation', async ({ page }) => {
  await page.goto('/applications/track/submitted-app-id');

  // Click withdraw button
  await page.click('button:has-text("Withdraw Application")');

  // Verify dialog appears
  await expect(page.locator('text=Confirm Withdrawal')).toBeVisible();

  // Click confirm
  await page.click('button:has-text("Yes, Withdraw")');

  // Verify success toast
  await expect(page.locator('text=Application withdrawn successfully')).toBeVisible();
});
```

---

## Dependencies

- TASK-003 (withdrawal API)
- Toast component (existing)

---

## Effort

**Estimated**: 3 hours
- Tracking page UI: 1.5h
- Status timeline component: 0.75h
- Withdrawal dialog and logic: 0.5h
- Backend endpoint: 0.25h
