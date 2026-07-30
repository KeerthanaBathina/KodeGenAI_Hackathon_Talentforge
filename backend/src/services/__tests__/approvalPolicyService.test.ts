import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import {
  getApprovalPolicy,
  validateApprovalPolicy,
  listActivePolicies,
  ApprovalPolicyNotFoundError
} from '../approvalPolicyService';

const mocks = vi.hoisted(() => ({
  prismaApprovalPolicyFindFirst: vi.fn(),
  prismaApprovalPolicyFindUnique: vi.fn(),
  prismaApprovalPolicyFindMany: vi.fn(),
  prismaUserFindUnique: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  prisma: {
    approvalPolicy: {
      findFirst: mocks.prismaApprovalPolicyFindFirst,
      findUnique: mocks.prismaApprovalPolicyFindUnique,
      findMany: mocks.prismaApprovalPolicyFindMany
    },
    user: {
      findUnique: mocks.prismaUserFindUnique
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

describe('approvalPolicyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getApprovalPolicy', () => {
    it('should return policy for compensation within band', async () => {
      const mockPolicy = {
        id: 'policy-123',
        compensationBandMin: new Decimal(100000),
        compensationBandMax: new Decimal(200000),
        requiredApprovers: [
          { tier: 1, role: 'vp_engineering', approverId: 'user-vp', displayName: 'VP Engineering' },
          { tier: 2, role: 'cfo', approverId: 'user-cfo', displayName: 'CFO' }
        ],
        active: true,
        effectiveFrom: new Date()
      };

      mocks.prismaApprovalPolicyFindFirst.mockResolvedValue(mockPolicy);

      const result = await getApprovalPolicy(new Decimal(150000));

      expect(result.policyId).toBe('policy-123');
      expect(result.requiredApprovers).toHaveLength(2);
      expect(result.requiredApprovers[0].tier).toBe(1);
      expect(result.requiredApprovers[1].tier).toBe(2);
    });

    it('should sort approvers by tier', async () => {
      const mockPolicy = {
        id: 'policy-456',
        compensationBandMin: new Decimal(200000),
        compensationBandMax: new Decimal(300000),
        requiredApprovers: [
          { tier: 3, role: 'ceo', approverId: 'user-ceo', displayName: 'CEO' },
          { tier: 1, role: 'vp', approverId: 'user-vp', displayName: 'VP' },
          { tier: 2, role: 'cfo', approverId: 'user-cfo', displayName: 'CFO' }
        ],
        active: true,
        effectiveFrom: new Date()
      };

      mocks.prismaApprovalPolicyFindFirst.mockResolvedValue(mockPolicy);

      const result = await getApprovalPolicy(new Decimal(250000));

      expect(result.requiredApprovers[0].tier).toBe(1);
      expect(result.requiredApprovers[1].tier).toBe(2);
      expect(result.requiredApprovers[2].tier).toBe(3);
    });

    it('should throw error when no policy found', async () => {
      mocks.prismaApprovalPolicyFindFirst.mockResolvedValue(null);

      await expect(
        getApprovalPolicy(new Decimal(500000))
      ).rejects.toThrow(ApprovalPolicyNotFoundError);
    });

    it('should query with correct compensation range', async () => {
      mocks.prismaApprovalPolicyFindFirst.mockResolvedValue({
        id: 'policy-789',
        requiredApprovers: [],
        compensationBandMin: new Decimal(50000),
        compensationBandMax: new Decimal(100000),
        active: true,
        effectiveFrom: new Date()
      });

      const amount = new Decimal(75000);
      await getApprovalPolicy(amount);

      expect(mocks.prismaApprovalPolicyFindFirst).toHaveBeenCalledWith({
        where: {
          active: true,
          compensationBandMin: { lte: amount },
          compensationBandMax: { gte: amount }
        },
        orderBy: { effectiveFrom: 'desc' }
      });
    });
  });

  describe('validateApprovalPolicy', () => {
    it('should validate all approvers exist', async () => {
      const mockPolicy = {
        id: 'policy-123',
        requiredApprovers: [
          { tier: 1, approverId: 'user-1', role: 'vp', displayName: 'VP' },
          { tier: 2, approverId: 'user-2', role: 'cfo', displayName: 'CFO' }
        ]
      };

      mocks.prismaApprovalPolicyFindUnique.mockResolvedValue(mockPolicy);
      mocks.prismaUserFindUnique
        .mockResolvedValueOnce({ id: 'user-1', role: 'vp' })
        .mockResolvedValueOnce({ id: 'user-2', role: 'cfo' });

      const result = await validateApprovalPolicy('policy-123');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing approvers', async () => {
      const mockPolicy = {
        id: 'policy-456',
        requiredApprovers: [
          { tier: 1, approverId: 'user-missing', role: 'vp', displayName: 'VP' }
        ]
      };

      mocks.prismaApprovalPolicyFindUnique.mockResolvedValue(mockPolicy);
      mocks.prismaUserFindUnique.mockResolvedValue(null);

      const result = await validateApprovalPolicy('policy-456');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Approver VP (user-missing) not found');
    });
  });

  describe('listActivePolicies', () => {
    it('should return all active policies sorted by compensation', async () => {
      const mockPolicies = [
        {
          id: 'policy-1',
          compensationBandMin: new Decimal(0),
          compensationBandMax: new Decimal(100000),
          requiredApprovers: [{ tier: 1, role: 'manager', approverId: 'user-1', displayName: 'Manager' }],
          active: true
        },
        {
          id: 'policy-2',
          compensationBandMin: new Decimal(100001),
          compensationBandMax: new Decimal(200000),
          requiredApprovers: [{ tier: 1, role: 'vp', approverId: 'user-2', displayName: 'VP' }],
          active: true
        }
      ];

      mocks.prismaApprovalPolicyFindMany.mockResolvedValue(mockPolicies);

      const result = await listActivePolicies();

      expect(result).toHaveLength(2);
      expect(result[0].policyId).toBe('policy-1');
      expect(result[1].policyId).toBe('policy-2');
    });
  });
});
