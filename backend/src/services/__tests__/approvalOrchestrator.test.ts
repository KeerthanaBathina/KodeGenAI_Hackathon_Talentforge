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

    it('should log audit event for chain initiation', async () => {
      const mockPolicy = {
        policyId: 'policy-123',
        requiredApprovers: [
          { tier: 1, role: 'vp', approverId: 'user-vp', displayName: 'VP' }
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

      await initiateApprovalChain({
        decisionId: 'decision-123',
        applicationId: 'app-456',
        compensationAmount: new Decimal(150000),
        decidedById: 'user-hm'
      });

      expect(mocks.auditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'APPROVAL_CHAIN_INITIATED',
          entityType: 'decision',
          entityId: 'decision-123'
        })
      );
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
          compensationBand: '100000-200000',
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
          compensationBand: '100000-200000',
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

    it('should throw error when approval not found', async () => {
      mocks.prismaApprovalFindUnique.mockResolvedValue(null);

      await expect(
        processApprovalResponse({
          approvalId: 'nonexistent',
          approverId: 'user-vp',
          approved: true
        })
      ).rejects.toThrow('Approval record nonexistent not found');
    });

    it('should throw error when approver mismatch', async () => {
      const mockApproval = {
        id: 'approval-1',
        decisionId: 'decision-123',
        approverId: 'user-vp',
        tier: 'tier_1',
        status: 'pending',
        decision: {
          application: { id: 'app-456' }
        }
      };

      mocks.prismaApprovalFindUnique.mockResolvedValue(mockApproval);

      await expect(
        processApprovalResponse({
          approvalId: 'approval-1',
          approverId: 'wrong-user',
          approved: true
        })
      ).rejects.toThrow('Approver ID mismatch');
    });

    it('should throw error when approval already processed', async () => {
      const mockApproval = {
        id: 'approval-1',
        decisionId: 'decision-123',
        approverId: 'user-vp',
        tier: 'tier_1',
        status: 'approved',
        decision: {
          application: { id: 'app-456' }
        }
      };

      mocks.prismaApprovalFindUnique.mockResolvedValue(mockApproval);

      await expect(
        processApprovalResponse({
          approvalId: 'approval-1',
          approverId: 'user-vp',
          approved: true
        })
      ).rejects.toThrow('Approval already processed');
    });
  });

  describe('getApprovalStatus', () => {
    it('should return approval chain status', async () => {
      mocks.prismaApprovalFindMany.mockResolvedValue([
        {
          id: 'approval-1',
          tier: 'tier_1',
          status: 'approved',
          comments: null,
          respondedAt: new Date('2026-07-27T10:00:00Z'),
          createdAt: new Date('2026-07-27T09:00:00Z'),
          approver: {
            id: 'user-vp',
            fullName: 'Jane VP',
            email: 'vp@company.com',
            role: 'vp_engineering'
          }
        },
        {
          id: 'approval-2',
          tier: 'tier_2',
          status: 'pending',
          comments: null,
          respondedAt: null,
          createdAt: new Date('2026-07-27T10:00:00Z'),
          approver: {
            id: 'user-cfo',
            fullName: 'John CFO',
            email: 'cfo@company.com',
            role: 'cfo'
          }
        }
      ]);

      const status = await getApprovalStatus('decision-123');

      expect(status.decisionId).toBe('decision-123');
      expect(status.totalTiers).toBe(2);
      expect(status.approvals[0].status).toBe('approved');
      expect(status.approvals[1].status).toBe('pending');
      expect(status.approvals[0].approver.name).toBe('Jane VP');
    });

    it('should handle empty approval chain', async () => {
      mocks.prismaApprovalFindMany.mockResolvedValue([]);

      const status = await getApprovalStatus('decision-456');

      expect(status.totalTiers).toBe(0);
      expect(status.approvals).toHaveLength(0);
    });
  });
});
