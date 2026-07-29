/**
 * Unit tests for approval policy versioning and validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '@/db/prisma';
import {
  createApprovalPolicyVersion,
  getApprovalPolicy,
  getApprovalPolicyHistory,
  listActivePolicies,
  validateApprovalPolicy,
} from '@/services/approvalPolicyService';
import type { ApprovalTier } from '@/services/approvalPolicyService';
import { InvalidCompensationBandError, InvalidApproverError, PolicyNotFoundError } from '@/services/errors/PolicyErrors';

describe('Approval Policy Service - Versioning', () => {
  let approver1: string;
  let approver2: string;
  let adminId: string;

  beforeEach(async () => {
    // Create test approvers
    const user1 = await prisma.user.create({
      data: {
        email: `approver1-${Date.now()}@test.example.com`,
        fullName: 'Approver 1',
        role: 'hr_manager',
        active: true,
      },
    });
    approver1 = user1.id;

    const user2 = await prisma.user.create({
      data: {
        email: `approver2-${Date.now()}@test.example.com`,
        fullName: 'Approver 2',
        role: 'admin',
        active: true,
      },
    });
    approver2 = user2.id;

    const user3 = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@test.example.com`,
        fullName: 'Admin',
        role: 'admin',
        active: true,
      },
    });
    adminId = user3.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.approvalPolicy.deleteMany({
      where: {
        createdById: adminId,
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [approver1, approver2, adminId],
        },
      },
    });
  });

  describe('Compensation Band Validation', () => {
    it('should reject when min >= max', async () => {
      await expect(
        createApprovalPolicyVersion(
          {
            compensationBandMin: new Decimal('100000'),
            compensationBandMax: new Decimal('100000'),
            requiredApprovers: [
              {
                tier: 1,
                role: 'hr_manager',
                approverId: approver1,
                displayName: 'HR Manager',
              },
            ],
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidCompensationBandError);
    });

    it('should reject when min > max', async () => {
      await expect(
        createApprovalPolicyVersion(
          {
            compensationBandMin: new Decimal('150000'),
            compensationBandMax: new Decimal('100000'),
            requiredApprovers: [
              {
                tier: 1,
                role: 'hr_manager',
                approverId: approver1,
                displayName: 'HR Manager',
              },
            ],
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidCompensationBandError);
    });

    it('should accept valid compensation band', async () => {
      const result = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('150000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      expect(result).toBeDefined();
      expect(result.compensationBandMin.equals(new Decimal('100000'))).toBe(true);
      expect(result.compensationBandMax.equals(new Decimal('150000'))).toBe(true);
    });
  });

  describe('Approver Validation', () => {
    it('should reject non-existent approver', async () => {
      await expect(
        createApprovalPolicyVersion(
          {
            compensationBandMin: new Decimal('100000'),
            compensationBandMax: new Decimal('150000'),
            requiredApprovers: [
              {
                tier: 1,
                role: 'hr_manager',
                approverId: '00000000-0000-0000-0000-000000000000',
                displayName: 'Invalid Approver',
              },
            ],
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidApproverError);
    });

    it('should reject inactive approver', async () => {
      const inactiveUser = await prisma.user.create({
        data: {
          email: `inactive-${Date.now()}@test.example.com`,
          fullName: 'Inactive Approver',
          role: 'hr_manager',
          active: false,
        },
      });

      await expect(
        createApprovalPolicyVersion(
          {
            compensationBandMin: new Decimal('100000'),
            compensationBandMax: new Decimal('150000'),
            requiredApprovers: [
              {
                tier: 1,
                role: 'hr_manager',
                approverId: inactiveUser.id,
                displayName: 'Inactive Approver',
              },
            ],
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidApproverError);

      await prisma.user.delete({ where: { id: inactiveUser.id } });
    });

    it('should accept valid approvers', async () => {
      const result = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('150000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
            {
              tier: 2,
              role: 'admin',
              approverId: approver2,
              displayName: 'Admin',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      expect(result).toBeDefined();
      expect(result.requiredApprovers.length).toBe(2);
    });
  });

  describe('Effective Date Based Retrieval', () => {
    beforeEach(async () => {
      // Create policies at different dates
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
            {
              tier: 2,
              role: 'admin',
              approverId: approver2,
              displayName: 'Admin',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );
    });

    it('should return policy effective at specific date', async () => {
      const policy = await getApprovalPolicy(
        new Decimal('150000'),
        new Date('2026-07-15'),
      );

      expect(policy).toBeDefined();
      expect(policy.requiredApprovers.length).toBe(1);
    });

    it('should return most recent policy for future date', async () => {
      const policy = await getApprovalPolicy(
        new Decimal('150000'),
        new Date('2026-08-15'),
      );

      expect(policy).toBeDefined();
      expect(policy.requiredApprovers.length).toBe(2);
    });

    it('should throw error if no policy matches compensation', async () => {
      await expect(
        getApprovalPolicy(new Decimal('500000'), new Date('2026-08-15')),
      ).rejects.toThrow(PolicyNotFoundError);
    });

    it('should sort approvers by tier', async () => {
      const policy = await getApprovalPolicy(
        new Decimal('150000'),
        new Date('2026-08-15'),
      );

      // Should be sorted by tier
      for (let i = 0; i < policy.requiredApprovers.length - 1; i++) {
        expect(policy.requiredApprovers[i].tier).toBeLessThanOrEqual(
          policy.requiredApprovers[i + 1].tier,
        );
      }
    });
  });

  describe('In-Flight Application Isolation', () => {
    it('should use different policy for different offer dates', async () => {
      // Create v1
      const v1 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Get policy for offer created on 2026-07-15
      const offerPolicy = await getApprovalPolicy(
        new Decimal('150000'),
        new Date('2026-07-15'),
      );

      // Create v2
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
            {
              tier: 2,
              role: 'admin',
              approverId: approver2,
              displayName: 'Admin',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Current policy should be different
      const currentPolicy = await getApprovalPolicy(new Decimal('150000'));

      expect(offerPolicy.requiredApprovers.length).toBe(1);
      expect(currentPolicy.requiredApprovers.length).toBe(2);
    });

    it('should prevent retroactive policy changes from affecting in-flight offers', async () => {
      const offerCreationDate = new Date('2026-07-15');

      // Create policy
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Get policy for in-flight offer
      const offerPolicy = await getApprovalPolicy(
        new Decimal('150000'),
        offerCreationDate,
      );

      // Later policy change
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
            {
              tier: 2,
              role: 'admin',
              approverId: approver2,
              displayName: 'Admin',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Offer should still use old policy
      expect(offerPolicy.requiredApprovers.length).toBe(1);
    });
  });

  describe('Policy History', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await createApprovalPolicyVersion(
          {
            compensationBandMin: new Decimal('100000'),
            compensationBandMax: new Decimal('200000' + i),
            requiredApprovers: [
              {
                tier: 1,
                role: 'hr_manager',
                approverId: approver1,
                displayName: 'HR Manager',
              },
            ],
            effectiveFrom: new Date(`2026-0${7 + i}-01`),
          },
          adminId,
        );
      }
    });

    it('should return policy history in reverse chronological order', async () => {
      const history = await getApprovalPolicyHistory({
        compensationBandMin: new Decimal('100000'),
        compensationBandMax: new Decimal('200002'),
      });

      expect(history.length).toBeGreaterThanOrEqual(3);

      for (let i = 0; i < history.length - 1; i++) {
        expect(history[i].effectiveFrom!.getTime()).toBeGreaterThanOrEqual(
          history[i + 1].effectiveFrom!.getTime(),
        );
      }
    });

    it('should respect limit parameter', async () => {
      const history = await getApprovalPolicyHistory({
        limit: 2,
      });

      expect(history.length).toBeLessThanOrEqual(2);
    });

    it('should filter by compensation band range', async () => {
      const history = await getApprovalPolicyHistory({
        compensationBandMin: new Decimal('100000'),
        compensationBandMax: new Decimal('200001'),
      });

      for (const policy of history) {
        const overlaps =
          policy.compensationBandMin.lte(new Decimal('200001')) &&
          policy.compensationBandMax.gte(new Decimal('100000'));
        expect(overlaps).toBe(true);
      }
    });
  });

  describe('List Active Policies', () => {
    beforeEach(async () => {
      // Create policies for different compensation bands
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('50000'),
          compensationBandMax: new Decimal('100000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
            {
              tier: 2,
              role: 'admin',
              approverId: approver2,
              displayName: 'Admin',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );
    });

    it('should return all active policies', async () => {
      const policies = await listActivePolicies();

      // Should contain at least the two policies we created
      expect(policies.length).toBeGreaterThanOrEqual(2);
    });

    it('should return policies in compensation order', async () => {
      const policies = await listActivePolicies();

      for (let i = 0; i < policies.length - 1; i++) {
        expect(policies[i].compensationBandMin.lte(policies[i + 1].compensationBandMin)).toBe(
          true,
        );
      }
    });

    it('should return unique policies per compensation band', async () => {
      // Create multiple versions of same band
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('200000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-09-01'),
        },
        adminId,
      );

      const policies = await listActivePolicies();

      // Count policies with compensation band 100000-200000
      const band100to200 = policies.filter(
        (p) =>
          p.compensationBandMin.equals(new Decimal('100000')) &&
          p.compensationBandMax.equals(new Decimal('200000')),
      );

      // Should only return the most recent one
      expect(band100to200.length).toBe(1);
      // The most recent should be from 2026-09-01
      expect(band100to200[0].effectiveFrom!.getTime()).toBe(
        new Date('2026-09-01').getTime(),
      );
    });
  });

  describe('Policy Validation', () => {
    it('should validate that all approvers exist and are active', async () => {
      const policy = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('150000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      const validation = await validateApprovalPolicy(policy.policyId);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect inactive approvers', async () => {
      const inactiveUser = await prisma.user.create({
        data: {
          email: `inactive-approver-${Date.now()}@test.example.com`,
          fullName: 'Inactive Approver',
          role: 'hr_manager',
          active: false,
        },
      });

      // Manually create policy with inactive approver (bypassing validation)
      const policy = await prisma.approvalPolicy.create({
        data: {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('150000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: inactiveUser.id,
              displayName: 'Inactive Approver',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
          createdById: adminId,
          active: true,
        },
      });

      const validation = await validateApprovalPolicy(policy.id);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);

      await prisma.user.delete({ where: { id: inactiveUser.id } });
    });
  });

  describe('Audit Logging', () => {
    it('should log policy version creation with before/after values', async () => {
      // Create v1
      await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('150000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
          ],
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Create v2
      const v2 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal('100000'),
          compensationBandMax: new Decimal('150000'),
          requiredApprovers: [
            {
              tier: 1,
              role: 'hr_manager',
              approverId: approver1,
              displayName: 'HR Manager',
            },
            {
              tier: 2,
              role: 'admin',
              approverId: approver2,
              displayName: 'Admin',
            },
          ],
          effectiveFrom: new Date('2026-08-15'),
        },
        adminId,
      );

      // Verify audit event
      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          action: 'approval_policy.version_created',
          resourceId: v2.policyId,
        },
      });

      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0].metadata).toContainKey('newApprovers');
      expect(auditEvents[0].metadata).toContainKey('oldApprovers');
    });
  });
});
