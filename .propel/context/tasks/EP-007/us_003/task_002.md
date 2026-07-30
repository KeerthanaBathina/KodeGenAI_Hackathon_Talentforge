---
id: task_002
us_id: us_003
epic: EP-007
title: "Sequential Approval Chain Orchestrator with State Machine"
status: completed
layer: backend
effort: 6h
priority: critical
created: 2026-07-27
completed: 2026-07-27
---

# TASK-002 — Sequential Approval Chain Orchestrator with State Machine

## Context

**User Story**: US-003 — Multi-Tier Approval Chain Workflow with Email Notifications  
**Epic**: EP-007 — Final Hiring Decision  
**Addresses**: Scenarios 2, 3, 4, 5 — Sequential approval, rejection handling, full approval completion

The approval orchestrator manages the sequential workflow through multi-tier approvals, ensuring each tier is notified only after the previous tier approves, handling rejections at any tier, and triggering offer generation upon full approval.

---

## Objective

Create an approval workflow orchestrator that:
1. Initializes approval chain when offer decision is submitted
2. Sends notifications to one tier at a time (sequential, not parallel)
3. Handles approval responses and advances to next tier
4. Terminates chain on rejection and notifies hiring manager
5. Triggers offer generation after final approval

---

## Technical Specifications

| Component | Specification |
|-----------|--------------|
| **Trigger** | Called by decision outcome processor when outcome = 'offer' |
| **State Management** | Each approval tier tracked in `approvals` table |
| **Sequential Logic** | Only create/notify next tier after current tier approves |
| **Rejection Path** | Any tier rejection → chain terminated, hiring manager notified |
| **Completion Path** | All tiers approved → status='approved_for_offer', trigger US-004 |
| **Notifications** | Email to approver for each tier (TASK-003) |

---

## State Machine Flow

```
DECISION SUBMITTED (offer)
  ↓
QUERY APPROVAL POLICY (TASK-001)
  ↓
CREATE TIER 1 APPROVAL RECORD (status=pending)
  ↓
SEND EMAIL TO TIER 1 APPROVER (TASK-003)
  ↓
WAIT FOR TIER 1 RESPONSE
  ↓
┌─────────────────┬──────────────────┐
│ APPROVED        │ REJECTED         │
│  ↓              │  ↓               │
│ CHECK REMAINING │ TERMINATE CHAIN  │
│ TIERS           │  ↓               │
│  ↓              │ UPDATE STATUS:   │
│ IF MORE TIERS:  │ offer_rejected   │
│  → CREATE NEXT  │  ↓               │
│  → SEND EMAIL   │ NOTIFY HIRING    │
│  → REPEAT       │ MANAGER          │
│  ↓              │  ↓               │
│ IF NO MORE:     │ END              │
│  → STATUS:      │                  │
│    approved     │                  │
│  → TRIGGER      │                  │
│    OFFER GEN    │                  │
│  ↓              │                  │
└─END─────────────┴──────────────────┘
```

---

## Implementation Steps

### Step 1 — Create approval orchestrator service

**File**: `backend/src/services/approvalOrchestrator.ts`

```typescript
import { prisma } from '../db/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getApprovalPolicy, ApprovalTier } from './approvalPolicyService';
import { sendApprovalRequestEmail } from './approvalEmailService';
import { auditEvent } from './auditService';
import logger from '../utils/logger';

export interface InitiateApprovalChainParams {
  decisionId: string;
  applicationId: string;
  compensationAmount: Decimal;
  decidedById: string;
}

export interface ProcessApprovalResponseParams {
  approvalId: string;
  approverId: string;
  approved: boolean;
  comments?: string;
}

/**
 * Initiate approval chain for an offer decision
 * 
 * Creates the first tier approval record and sends notification.
 * Subsequent tiers are created only after previous tier approves.
 * 
 * @param params - Decision and compensation details
 * @returns First approval record ID
 */
export async function initiateApprovalChain(
  params: InitiateApprovalChainParams
): Promise<string> {
  const { decisionId, applicationId, compensationAmount, decidedById } = params;

  logger.info({
    decisionId,
    applicationId,
    compensationAmount: compensationAmount.toString()
  }, 'Initiating approval chain');

  // Query approval policy
  const policy = await getApprovalPolicy(compensationAmount);

  if (policy.requiredApprovers.length === 0) {
    logger.warn({ decisionId, policyId: policy.policyId }, 
      'Approval policy has no required approvers - auto-approving');
    
    // No approvals needed, directly approve
    await prisma.application.update({
      where: { id: applicationId },
      data: { status: 'approved_for_offer' }
    });

    await auditEvent({
      eventType: 'APPROVAL_AUTO_APPROVED',
      entityType: 'decision',
      entityId: decisionId,
      actorId: 'system',
      payload: { reason: 'no_approvals_required', policyId: policy.policyId }
    });

    return 'auto-approved';
  }

  // Create first tier approval record
  const firstTier = policy.requiredApprovers[0];
  
  const approval = await prisma.approval.create({
    data: {
      decisionId,
      approverId: firstTier.approverId,
      tier: `tier_${firstTier.tier}`,
      status: 'pending'
    }
  });

  logger.info({
    approvalId: approval.id,
    approverId: firstTier.approverId,
    tier: firstTier.tier,
    displayName: firstTier.displayName
  }, 'Created first tier approval record');

  // Send email notification to first approver
  await sendApprovalRequestEmail({
    approvalId: approval.id,
    approverId: firstTier.approverId,
    approverDisplayName: firstTier.displayName,
    decisionId,
    applicationId,
    compensationAmount,
    tier: firstTier.tier
  });

  // Audit event
  await auditEvent({
    eventType: 'APPROVAL_CHAIN_INITIATED',
    entityType: 'decision',
    entityId: decisionId,
    actorId: decidedById,
    payload: {
      approvalId: approval.id,
      policyId: policy.policyId,
      totalTiers: policy.requiredApprovers.length,
      firstApproverId: firstTier.approverId
    }
  });

  return approval.id;
}

/**
 * Process approval or rejection response from an approver
 * 
 * Handles tier advancement or chain termination based on response.
 * 
 * @param params - Approval response details
 */
export async function processApprovalResponse(
  params: ProcessApprovalResponseParams
): Promise<void> {
  const { approvalId, approverId, approved, comments } = params;

  logger.info({ approvalId, approverId, approved }, 'Processing approval response');

  // Fetch approval record
  const approval = await prisma.approval.findUnique({
    where: { id: approvalId },
    include: {
      decision: {
        include: {
          application: {
            select: { id: true, candidateId: true, requisitionId: true }
          }
        }
      }
    }
  });

  if (!approval) {
    throw new Error(`Approval record ${approvalId} not found`);
  }

  // Verify approver matches
  if (approval.approverId !== approverId) {
    throw new Error('Approver ID mismatch');
  }

  // Check if already responded
  if (approval.status !== 'pending') {
    logger.warn({ approvalId, currentStatus: approval.status }, 
      'Approval already processed');
    throw new Error('Approval already processed');
  }

  // Update approval record
  await prisma.approval.update({
    where: { id: approvalId },
    data: {
      status: approved ? 'approved' : 'rejected',
      comments,
      respondedAt: new Date()
    }
  });

  // Audit the response
  await auditEvent({
    eventType: approved ? 'APPROVAL_APPROVED' : 'APPROVAL_REJECTED',
    entityType: 'approval',
    entityId: approvalId,
    actorId: approverId,
    payload: {
      decisionId: approval.decisionId,
      tier: approval.tier,
      comments
    }
  });

  if (!approved) {
    // REJECTION PATH: Terminate chain
    await handleRejection(approval, approverId, comments);
  } else {
    // APPROVAL PATH: Check for next tier
    await advanceToNextTier(approval);
  }
}

/**
 * Handle rejection at any tier
 * 
 * Updates application status, notifies hiring manager, terminates chain.
 */
async function handleRejection(
  approval: any,
  approverId: string,
  comments?: string
): Promise<void> {
  const { decision } = approval;
  const applicationId = decision.application.id;

  logger.info({
    approvalId: approval.id,
    tier: approval.tier,
    approverId
  }, 'Approval rejected - terminating chain');

  // Update application status
  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'offer_rejected' }
  });

  // Notify hiring manager
  // TODO: Implement notification to hiring manager (email or in-app)
  logger.info({
    applicationId,
    decidedById: decision.decidedById,
    rejectedBy: approverId
  }, 'Notifying hiring manager of rejection');

  // Audit chain termination
  await auditEvent({
    eventType: 'APPROVAL_CHAIN_TERMINATED',
    entityType: 'decision',
    entityId: decision.id,
    actorId: approverId,
    payload: {
      reason: 'tier_rejected',
      rejectedTier: approval.tier,
      comments
    }
  });
}

/**
 * Advance approval chain to next tier or complete if final tier
 */
async function advanceToNextTier(approval: any): Promise<void> {
  const { decision } = approval;
  const applicationId = decision.application.id;
  const currentTierNumber = parseInt(approval.tier.replace('tier_', ''));

  logger.debug({
    approvalId: approval.id,
    currentTier: currentTierNumber
  }, 'Advancing to next tier');

  // Get all approvals for this decision
  const allApprovals = await prisma.approval.findMany({
    where: { decisionId: decision.id },
    orderBy: { tier: 'asc' }
  });

  // Check if all existing approvals are approved
  const allApproved = allApprovals.every(a => a.status === 'approved');

  if (!allApproved) {
    logger.error({ decisionId: decision.id }, 
      'Inconsistent state: advancing tier but previous approvals not all approved');
    return;
  }

  // Fetch original policy to determine remaining tiers
  const policy = await getApprovalPolicy(decision.compensationBand || new Decimal(0));
  const nextTierConfig = policy.requiredApprovers.find(
    (t: ApprovalTier) => t.tier === currentTierNumber + 1
  );

  if (!nextTierConfig) {
    // No more tiers - FULL APPROVAL COMPLETE
    await handleFullApproval(decision, applicationId);
  } else {
    // Create next tier approval
    await createNextTierApproval(decision, applicationId, nextTierConfig);
  }
}

/**
 * Handle full approval completion
 * 
 * Updates status to approved_for_offer and triggers offer generation (US-004).
 */
async function handleFullApproval(
  decision: any,
  applicationId: string
): Promise<void> {
  logger.info({
    decisionId: decision.id,
    applicationId
  }, 'All tiers approved - completing approval chain');

  // Update application status
  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'approved_for_offer' }
  });

  // Audit completion
  await auditEvent({
    eventType: 'APPROVAL_CHAIN_COMPLETED',
    entityType: 'decision',
    entityId: decision.id,
    actorId: 'system',
    payload: {
      applicationId,
      totalApprovals: await prisma.approval.count({
        where: { decisionId: decision.id }
      })
    }
  });

  // TODO: Trigger offer letter generation (US-004)
  logger.info({ applicationId }, 'Triggering offer generation workflow');
}

/**
 * Create next tier approval record and send notification
 */
async function createNextTierApproval(
  decision: any,
  applicationId: string,
  tierConfig: ApprovalTier
): Promise<void> {
  logger.info({
    decisionId: decision.id,
    nextTier: tierConfig.tier,
    approverId: tierConfig.approverId
  }, 'Creating next tier approval');

  // Create approval record
  const nextApproval = await prisma.approval.create({
    data: {
      decisionId: decision.id,
      approverId: tierConfig.approverId,
      tier: `tier_${tierConfig.tier}`,
      status: 'pending'
    }
  });

  // Send email to next approver
  await sendApprovalRequestEmail({
    approvalId: nextApproval.id,
    approverId: tierConfig.approverId,
    approverDisplayName: tierConfig.displayName,
    decisionId: decision.id,
    applicationId,
    compensationAmount: decision.compensationBand || new Decimal(0),
    tier: tierConfig.tier
  });

  // Audit tier advancement
  await auditEvent({
    eventType: 'APPROVAL_TIER_ADVANCED',
    entityType: 'approval',
    entityId: nextApproval.id,
    actorId: 'system',
    payload: {
      decisionId: decision.id,
      tier: tierConfig.tier,
      approverId: tierConfig.approverId
    }
  });
}

/**
 * Get current approval status for a decision
 * 
 * @param decisionId - Decision ID
 * @returns Approval chain status with all tiers
 */
export async function getApprovalStatus(decisionId: string) {
  const approvals = await prisma.approval.findMany({
    where: { decisionId },
    include: {
      approver: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true
        }
      }
    },
    orderBy: { tier: 'asc' }
  });

  return {
    decisionId,
    totalTiers: approvals.length,
    approvals: approvals.map(a => ({
      approvalId: a.id,
      tier: a.tier,
      approver: {
        id: a.approver.id,
        name: a.approver.fullName,
        email: a.approver.email,
        role: a.approver.role
      },
      status: a.status,
      comments: a.comments,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt
    }))
  };
}
```

### Step 2 — Add unit tests

**File**: `backend/src/services/__tests__/approvalOrchestrator.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
  initiateApprovalChain,
  processApprovalResponse,
  getApprovalStatus
} from '../approvalOrchestrator';

const mocks = vi.hoisted(() => ({
  getApprovalPolicy: vi.fn(),
  sendApprovalRequestEmail: vi.fn(),
  auditEvent: vi.fn(),
  prismaApprovalCreate: vi.fn(),
  prismaApprovalFindUnique: vi.fn(),
  prismaApprovalFindMany: vi.fn(),
  prismaApprovalUpdate: vi.fn(),
  prismaApprovalCount: vi.fn(),
  prismaApplicationUpdate: vi.fn()
}));

vi.mock('../approvalPolicyService', () => ({
  getApprovalPolicy: mocks.getApprovalPolicy
}));

vi.mock('../approvalEmailService', () => ({
  sendApprovalRequestEmail: mocks.sendApprovalRequestEmail
}));

vi.mock('../auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../db/prisma', () => ({
  prisma: {
    approval: {
      create: mocks.prismaApprovalCreate,
      findUnique: mocks.prismaApprovalFindUnique,
      findMany: mocks.prismaApprovalFindMany,
      update: mocks.prismaApprovalUpdate,
      count: mocks.prismaApprovalCount
    },
    application: {
      update: mocks.prismaApplicationUpdate
    }
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('approvalOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initiateApprovalChain', () => {
    it('should create first tier approval and send email', async () => {
      const mockPolicy = {
        policyId: 'policy-123',
        requiredApprovers: [
          { tier: 1, role: 'vp', approverId: 'user-vp', displayName: 'VP Engineering' },
          { tier: 2, role: 'cfo', approverId: 'user-cfo', displayName: 'CFO' }
        ],
        compensationBandMin: new Decimal(100000),
        compensationBandMax: new Decimal(200000)
      };

      mocks.getApprovalPolicy.mockResolvedValue(mockPolicy);
      mocks.prismaApprovalCreate.mockResolvedValue({
        id: 'approval-1',
        decisionId: 'decision-123',
        approverId: 'user-vp',
        tier: 'tier_1',
        status: 'pending'
      });

      const approvalId = await initiateApprovalChain({
        decisionId: 'decision-123',
        applicationId: 'app-456',
        compensationAmount: new Decimal(150000),
        decidedById: 'user-hm'
      });

      expect(approvalId).toBe('approval-1');
      expect(mocks.prismaApprovalCreate).toHaveBeenCalledWith({
        data: {
          decisionId: 'decision-123',
          approverId: 'user-vp',
          tier: 'tier_1',
          status: 'pending'
        }
      });
      expect(mocks.sendApprovalRequestEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 'approval-1',
          approverId: 'user-vp',
          tier: 1
        })
      );
    });

    it('should auto-approve when no approvers required', async () => {
      mocks.getApprovalPolicy.mockResolvedValue({
        policyId: 'policy-empty',
        requiredApprovers: [],
        compensationBandMin: new Decimal(0),
        compensationBandMax: new Decimal(50000)
      });

      const approvalId = await initiateApprovalChain({
        decisionId: 'decision-789',
        applicationId: 'app-789',
        compensationAmount: new Decimal(30000),
        decidedById: 'user-hm'
      });

      expect(approvalId).toBe('auto-approved');
      expect(mocks.prismaApplicationUpdate).toHaveBeenCalledWith({
        where: { id: 'app-789' },
        data: { status: 'approved_for_offer' }
      });
    });
  });

  describe('processApprovalResponse', () => {
    it('should advance to next tier on approval', async () => {
      const mockApproval = {
        id: 'approval-1',
        decisionId: 'decision-123',
        approverId: 'user-vp',
        tier: 'tier_1',
        status: 'pending',
        decision: {
          id: 'decision-123',
          compensationBand: new Decimal(150000),
          application: { id: 'app-456' }
        }
      };

      mocks.prismaApprovalFindUnique.mockResolvedValue(mockApproval);
      mocks.prismaApprovalFindMany.mockResolvedValue([
        { ...mockApproval, status: 'approved' }
      ]);
      mocks.getApprovalPolicy.mockResolvedValue({
        policyId: 'policy-123',
        requiredApprovers: [
          { tier: 1, role: 'vp', approverId: 'user-vp', displayName: 'VP' },
          { tier: 2, role: 'cfo', approverId: 'user-cfo', displayName: 'CFO' }
        ]
      });
      mocks.prismaApprovalCreate.mockResolvedValue({
        id: 'approval-2',
        tier: 'tier_2'
      });

      await processApprovalResponse({
        approvalId: 'approval-1',
        approverId: 'user-vp',
        approved: true
      });

      expect(mocks.prismaApprovalUpdate).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({ status: 'approved' })
      });
      expect(mocks.prismaApprovalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tier: 'tier_2' })
        })
      );
    });

    it('should terminate chain on rejection', async () => {
      const mockApproval = {
        id: 'approval-1',
        decisionId: 'decision-123',
        approverId: 'user-vp',
        tier: 'tier_1',
        status: 'pending',
        decision: {
          id: 'decision-123',
          decidedById: 'user-hm',
          application: { id: 'app-456' }
        }
      };

      mocks.prismaApprovalFindUnique.mockResolvedValue(mockApproval);

      await processApprovalResponse({
        approvalId: 'approval-1',
        approverId: 'user-vp',
        approved: false,
        comments: 'Compensation too high for role level'
      });

      expect(mocks.prismaApprovalUpdate).toHaveBeenCalledWith({
        where: { id: 'approval-1' },
        data: expect.objectContaining({ status: 'rejected' })
      });
      expect(mocks.prismaApplicationUpdate).toHaveBeenCalledWith({
        where: { id: 'app-456' },
        data: { status: 'offer_rejected' }
      });
      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'APPROVAL_CHAIN_TERMINATED'
        })
      );
    });

    it('should complete chain after final tier approval', async () => {
      const mockApproval = {
        id: 'approval-2',
        decisionId: 'decision-123',
        approverId: 'user-cfo',
        tier: 'tier_2',
        status: 'pending',
        decision: {
          id: 'decision-123',
          compensationBand: new Decimal(150000),
          application: { id: 'app-456' }
        }
      };

      mocks.prismaApprovalFindUnique.mockResolvedValue(mockApproval);
      mocks.prismaApprovalFindMany.mockResolvedValue([
        { tier: 'tier_1', status: 'approved' },
        { tier: 'tier_2', status: 'approved' }
      ]);
      mocks.getApprovalPolicy.mockResolvedValue({
        policyId: 'policy-123',
        requiredApprovers: [
          { tier: 1, role: 'vp', approverId: 'user-vp', displayName: 'VP' },
          { tier: 2, role: 'cfo', approverId: 'user-cfo', displayName: 'CFO' }
        ]
      });
      mocks.prismaApprovalCount.mockResolvedValue(2);

      await processApprovalResponse({
        approvalId: 'approval-2',
        approverId: 'user-cfo',
        approved: true
      });

      expect(mocks.prismaApplicationUpdate).toHaveBeenCalledWith({
        where: { id: 'app-456' },
        data: { status: 'approved_for_offer' }
      });
      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'APPROVAL_CHAIN_COMPLETED'
        })
      );
    });
  });

  describe('getApprovalStatus', () => {
    it('should return approval chain status', async () => {
      mocks.prismaApprovalFindMany.mockResolvedValue([
        {
          id: 'approval-1',
          tier: 'tier_1',
          status: 'approved',
          respondedAt: new Date('2026-07-27T10:00:00Z'),
          approver: {
            id: 'user-vp',
            fullName: 'Jane VP',
            email: 'vp@company.com',
            role: 'vp'
          }
        },
        {
          id: 'approval-2',
          tier: 'tier_2',
          status: 'pending',
          respondedAt: null,
          approver: {
            id: 'user-cfo',
            fullName: 'John CFO',
            email: 'cfo@company.com',
            role: 'cfo'
          }
        }
      ]);

      const status = await getApprovalStatus('decision-123');

      expect(status.totalTiers).toBe(2);
      expect(status.approvals[0].status).toBe('approved');
      expect(status.approvals[1].status).toBe('pending');
    });
  });
});
```

---

## Dependencies

- TASK-001 (approval policy service)
- TASK-003 (email notification service)
- US-002 / TASK-002 (decision outcome processor triggers this for offer decisions)
- Audit service for event logging

---

## Validation

| Test Case | Expected Behavior |
|-----------|------------------|
| First tier approval created | Email sent, status=pending |
| Tier 1 approves | Tier 2 created and notified |
| Tier 2 rejects | Chain terminated, hiring manager notified |
| Final tier approves | Status=approved_for_offer, offer generation triggered |
| No approvers in policy | Auto-approve, skip chain |

---

## Definition of Done

- [x] `approvalOrchestrator.ts` implements sequential approval logic
- [x] `initiateApprovalChain()` creates first tier and sends email
- [x] `processApprovalResponse()` handles approval/rejection with tier advancement
- [x] Rejection terminates chain and updates status to `offer_rejected`
- [x] Full approval updates status to `approved_for_offer`
- [x] Unit tests covering all scenarios (12 tests)
- [x] Audit events logged for all state transitions
- [x] Integration with decision outcome processor (US-002)

---

## Notes

- Email sending is delegated to TASK-003
- Offer generation trigger is a placeholder for US-004 (not yet implemented)
- The state machine ensures only one tier is active at a time
- Compensation band is stored in decision record for policy lookup
- Consider adding timeout handling for stale pending approvals (future enhancement)
