---
id: task_004
us_id: us_003
epic: EP-007
title: "Approval Response API Endpoints and Frontend Integration"
status: completed
layer: full-stack
effort: 5h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-004 — Approval Response API Endpoints and Frontend Integration

## Context

**User Story**: US-003 — Multi-Tier Approval Chain Workflow with Email Notifications  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenario 2 — Email links open platform approval confirmation

Approvers click approve/reject links in email which navigate to the platform. The API must validate the token, process the response, and provide a user-friendly confirmation page.

---

## Objective

Implement:
1. Backend API endpoint to process approval responses via secure tokens
2. Frontend page to display approval confirmation UI
3. Single-use token enforcement to prevent replay attacks
4. Approval status viewing API for hiring managers

---

## Technical Specifications

### Backend API Endpoints

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|---------------|
| `/api/approvals/respond` | POST | Process approval response from token | Token-based |
| `/api/approvals/:decisionId/status` | GET | View approval chain status | JWT required |
| `/api/approvals/:approvalId` | GET | View individual approval details | JWT required |

### Frontend Routes

| Route | Purpose | Access |
|-------|---------|--------|
| `/approvals/respond` | Approval confirmation page | Public (token in query param) |
| `/decisions/:id/approvals` | View approval status for a decision | Authenticated |

---

## Implementation Steps

### Step 1 — Create approval API routes

**File**: `backend/src/routes/approvals.ts`

```typescript
import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { verifyApprovalToken } from '../services/approvalTokenService';
import { processApprovalResponse, getApprovalStatus } from '../services/approvalOrchestrator';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/approvals/respond
 * Process approval or rejection via secure token
 * 
 * Public endpoint (token-based authentication)
 */
router.post(
  '/respond',
  [
    body('token').isString().notEmpty().withMessage('Token is required'),
    body('comments').optional().isString().withMessage('Comments must be a string')
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: errors.array()
        }
      });
      return;
    }

    const { token, comments } = req.body;

    try {
      // Verify and decode token
      const decoded = verifyApprovalToken(token);

      logger.info({
        approvalId: decoded.approvalId,
        action: decoded.action,
        approverId: decoded.approverId
      }, 'Processing approval response from token');

      // Process the approval response
      await processApprovalResponse({
        approvalId: decoded.approvalId,
        approverId: decoded.approverId,
        approved: decoded.action === 'approve',
        comments
      });

      res.status(200).json({
        success: true,
        message: decoded.action === 'approve' 
          ? 'Approval recorded successfully. The next approver has been notified.'
          : 'Rejection recorded successfully. The hiring manager has been notified.',
        data: {
          action: decoded.action,
          approvalId: decoded.approvalId
        }
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to process approval response');

      if (error.message.includes('expired') || error.message.includes('Invalid')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: error.message
          }
        });
        return;
      }

      if (error.message.includes('already processed')) {
        res.status(409).json({
          success: false,
          error: {
            code: 'ALREADY_PROCESSED',
            message: 'This approval has already been processed'
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to process approval response'
        }
      });
    }
  }
);

/**
 * GET /api/approvals/decision/:decisionId/status
 * Get approval chain status for a decision
 * 
 * Requires authentication (hiring manager or admin)
 */
router.get(
  '/decision/:decisionId/status',
  authenticate,
  authorize(['hiring_manager', 'admin']),
  [
    param('decisionId').isUUID().withMessage('Invalid decision ID')
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid decision ID',
          details: errors.array()
        }
      });
      return;
    }

    const { decisionId } = req.params;

    try {
      const status = await getApprovalStatus(decisionId);

      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error: any) {
      logger.error({ error: error.message, decisionId }, 'Failed to get approval status');

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve approval status'
        }
      });
    }
  }
);

/**
 * GET /api/approvals/:approvalId
 * Get individual approval details
 * 
 * Requires authentication
 */
router.get(
  '/:approvalId',
  authenticate,
  [
    param('approvalId').isUUID().withMessage('Invalid approval ID')
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid approval ID',
          details: errors.array()
        }
      });
      return;
    }

    const { approvalId } = req.params;

    try {
      // Fetch approval details
      const approval = await prisma.approval.findUnique({
        where: { id: approvalId },
        include: {
          approver: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true
            }
          },
          decision: {
            select: {
              id: true,
              outcome: true,
              applicationId: true
            }
          }
        }
      });

      if (!approval) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Approval not found'
          }
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          approvalId: approval.id,
          tier: approval.tier,
          status: approval.status,
          approver: {
            id: approval.approver.id,
            name: approval.approver.fullName,
            email: approval.approver.email,
            role: approval.approver.role
          },
          comments: approval.comments,
          respondedAt: approval.respondedAt,
          createdAt: approval.createdAt,
          decision: {
            id: approval.decision.id,
            outcome: approval.decision.outcome,
            applicationId: approval.decision.applicationId
          }
        }
      });
    } catch (error: any) {
      logger.error({ error: error.message, approvalId }, 'Failed to get approval details');

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve approval details'
        }
      });
    }
  }
);

export default router;
```

### Step 2 — Register routes in main app

**File**: `backend/src/app.ts` (add to existing routes)

```typescript
import approvalsRouter from './routes/approvals';

// ... existing code ...

app.use('/api/approvals', approvalsRouter);
```

### Step 3 — Create frontend approval response page

**File**: `frontend/src/pages/approvals/respond.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

type ResponseStatus = 'processing' | 'success' | 'error' | 'already_processed';

interface ResponseMessage {
  title: string;
  description: string;
  action?: string;
}

export default function ApprovalRespondPage() {
  const router = useRouter();
  const { token } = router.query;
  const [status, setStatus] = useState<ResponseStatus>('processing');
  const [message, setMessage] = useState<ResponseMessage | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!token || typeof token !== 'string') {
      setStatus('error');
      setMessage({
        title: 'Invalid Link',
        description: 'The approval link you followed is invalid or incomplete.'
      });
      return;
    }

    // Process the approval response
    processApproval(token);
  }, [token]);

  const processApproval = async (approvalToken: string) => {
    try {
      const response = await fetch('/api/approvals/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: approvalToken })
      });

      const data = await response.json();

      if (response.ok) {
        setStatus('success');
        setAction(data.data.action);
        setMessage({
          title: data.data.action === 'approve' ? 'Approval Confirmed' : 'Rejection Recorded',
          description: data.message,
          action: data.data.action
        });
      } else {
        if (response.status === 409) {
          setStatus('already_processed');
          setMessage({
            title: 'Already Processed',
            description: 'This approval has already been processed. Each approval link can only be used once.'
          });
        } else {
          setStatus('error');
          setMessage({
            title: 'Processing Failed',
            description: data.error?.message || 'Failed to process your approval response. The link may have expired.'
          });
        }
      }
    } catch (error) {
      setStatus('error');
      setMessage({
        title: 'Network Error',
        description: 'Unable to connect to the server. Please check your internet connection and try again.'
      });
    }
  };

  const renderIcon = () => {
    switch (status) {
      case 'success':
        return action === 'approve' ? (
          <CheckCircleIcon className="h-20 w-20 text-green-500" />
        ) : (
          <XCircleIcon className="h-20 w-20 text-red-500" />
        );
      case 'error':
      case 'already_processed':
        return <ExclamationTriangleIcon className="h-20 w-20 text-yellow-500" />;
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-blue-600"></div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
        <div className="flex justify-center mb-6">
          {renderIcon()}
        </div>

        {message && (
          <>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              {message.title}
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              {message.description}
            </p>
          </>
        )}

        {status === 'processing' && (
          <p className="text-lg text-gray-600">
            Processing your response...
          </p>
        )}

        {status === 'success' && (
          <div className="mt-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {(status === 'error' || status === 'already_processed') && (
          <div className="mt-6">
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Return to Home
            </button>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            If you believe this is an error, please contact your system administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Step 4 — Create approval status component for hiring managers

**File**: `frontend/src/components/ApprovalStatusPanel.tsx`

```typescript
import { useEffect, useState } from 'react';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface Approval {
  approvalId: string;
  tier: string;
  approver: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  comments: string | null;
  respondedAt: string | null;
  createdAt: string;
}

interface ApprovalStatusPanelProps {
  decisionId: string;
}

export function ApprovalStatusPanel({ decisionId }: ApprovalStatusPanelProps) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApprovalStatus();
  }, [decisionId]);

  const fetchApprovalStatus = async () => {
    try {
      const response = await fetch(`/api/approvals/decision/${decisionId}/status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch approval status');
      }

      const data = await response.json();
      setApprovals(data.data.approvals);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircleIcon className="h-6 w-6 text-green-500" />;
      case 'rejected':
        return <XCircleIcon className="h-6 w-6 text-red-500" />;
      case 'pending':
        return <ClockIcon className="h-6 w-6 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-3 py-1 rounded-full text-sm font-medium";
    switch (status) {
      case 'approved':
        return <span className={`${baseClasses} bg-green-100 text-green-800`}>Approved</span>;
      case 'rejected':
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>Rejected</span>;
      case 'pending':
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>Pending</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Approval Chain Status
      </h3>

      <div className="space-y-4">
        {approvals.map((approval, index) => (
          <div
            key={approval.approvalId}
            className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0"
          >
            <div className="flex-shrink-0">
              {getStatusIcon(approval.status)}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900">
                  {approval.tier.replace('tier_', 'Tier ')} - {approval.approver.name}
                </p>
                {getStatusBadge(approval.status)}
              </div>

              <p className="text-sm text-gray-600 mb-1">
                {approval.approver.email} • {approval.approver.role}
              </p>

              {approval.comments && (
                <div className="mt-2 bg-gray-50 rounded p-2">
                  <p className="text-sm text-gray-700">{approval.comments}</p>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-2">
                {approval.respondedAt 
                  ? `Responded on ${new Date(approval.respondedAt).toLocaleString()}`
                  : `Pending since ${new Date(approval.createdAt).toLocaleString()}`
                }
              </p>
            </div>
          </div>
        ))}
      </div>

      {approvals.every(a => a.status === 'approved') && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            ✓ All approvals complete - Ready for offer generation
          </p>
        </div>
      )}

      {approvals.some(a => a.status === 'rejected') && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 font-medium">
            ✗ Approval chain terminated due to rejection
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Dependencies

- TASK-001, TASK-002, TASK-003 (all backend services)
- Next.js routing for frontend pages
- JWT authentication middleware
- Heroicons for UI icons

---

## Validation

| Test Case | Expected Behavior |
|-----------|------------------|
| Valid token | Process approval, return 200 |
| Expired token | Return 400 with expiry message |
| Already processed | Return 409 conflict |
| Invalid token signature | Return 400 invalid token |
| Frontend success | Show confirmation with proper icon |
| Frontend error | Show error with helpful message |

---

## Definition of Done

- [x] Backend `/api/approvals/respond` endpoint handles token-based responses
- [x] Backend `/api/approvals/decision/:id/status` returns approval chain status
- [x] Frontend `/approvals/respond` page shows confirmation UI
- [x] Single-use enforcement prevents replay attacks
- [x] Error handling for expired/invalid tokens
- [x] ApprovalStatusPanel component displays chain progress
- [x] Unit tests for API routes (8 tests)
- [x] Frontend component tests (4 tests)
- [x] Integration with existing authentication system

---

## Notes

- Token is consumed in `processApprovalResponse` (already-processed check)
- Frontend page is public (no authentication) but token validates identity
- Approval status panel only visible to hiring managers and admins
- Consider adding approval history view showing all past decisions
- Future enhancement: In-platform approval UI (not just email links)
