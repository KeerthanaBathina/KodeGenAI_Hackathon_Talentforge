/**
 * Unit tests for scoring threshold service versioning
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '@/db/prisma';
import {
  createScoringThresholdVersion,
  getEffectiveScoringThreshold,
  getScoringThresholdHistory,
  getAllEffectiveScoringThresholds,
  validateEffectiveDateSafety,
} from '@/services/scoringThresholdService';
import { PolicyValidationError, PolicyNotFoundError } from '@/services/errors/PolicyErrors';

describe('Scoring Threshold Service - Versioning', () => {
  let jobFamilyId: string;
  let adminId: string;

  beforeEach(async () => {
    // Create test job family
    const jobFamily = await prisma.jobFamily.create({
      data: {
        name: `Test Job Family ${Date.now()}`,
      },
    });
    jobFamilyId = jobFamily.id;

    // Create test admin user
    const user = await prisma.user.create({
      data: {
        email: `admin-${Date.now()}@test.example.com`,
        fullName: 'Test Admin',
        role: 'admin',
        active: true,
      },
    });
    adminId = user.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.scoringThreshold.deleteMany({
      where: { jobFamilyId },
    });
    await prisma.jobFamily.deleteMany({
      where: { id: jobFamilyId },
    });
    await prisma.user.deleteMany({
      where: { id: adminId },
    });
  });

  describe('Scoring Threshold Validation', () => {
    it('should reject aiShortlistThreshold < 0', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: -0.1,
            confidenceThreshold: 0.8,
            experienceThresholdYears: 3,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyValidationError);
    });

    it('should reject aiShortlistThreshold > 1', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 1.1,
            confidenceThreshold: 0.8,
            experienceThresholdYears: 3,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyValidationError);
    });

    it('should reject confidenceThreshold < 0', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 0.75,
            confidenceThreshold: -0.1,
            experienceThresholdYears: 3,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyValidationError);
    });

    it('should reject confidenceThreshold > 1', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 0.75,
            confidenceThreshold: 1.1,
            experienceThresholdYears: 3,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyValidationError);
    });

    it('should reject experienceThresholdYears < 0', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 0.75,
            confidenceThreshold: 0.8,
            experienceThresholdYears: -1,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyValidationError);
    });

    it('should reject experienceThresholdYears > 50', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 0.75,
            confidenceThreshold: 0.8,
            experienceThresholdYears: 51,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyValidationError);
    });

    it('should accept valid threshold ranges', async () => {
      const result = await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.75,
          confidenceThreshold: 0.8,
          experienceThresholdYears: 3,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      expect(result).toBeDefined();
      expect(result.aiShortlistThreshold.toNumber()).toBe(0.75);
      expect(result.confidenceThreshold.toNumber()).toBe(0.8);
      expect(result.experienceThresholdYears).toBe(3);
    });

    it('should reject non-existent job family', async () => {
      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId: '00000000-0000-0000-0000-000000000000',
            aiShortlistThreshold: 0.75,
            confidenceThreshold: 0.8,
            experienceThresholdYears: 3,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(PolicyNotFoundError);
    });

    it('should reject inactive user', async () => {
      const inactiveUser = await prisma.user.create({
        data: {
          email: `inactive-${Date.now()}@test.example.com`,
          fullName: 'Inactive User',
          role: 'admin',
          active: false,
        },
      });

      await expect(
        createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 0.75,
            confidenceThreshold: 0.8,
            experienceThresholdYears: 3,
            effectiveFrom: new Date('2026-08-01'),
          },
          inactiveUser.id,
        ),
      ).rejects.toThrow(PolicyValidationError);

      await prisma.user.delete({ where: { id: inactiveUser.id } });
    });
  });

  describe('Effective Date Based Retrieval', () => {
    beforeEach(async () => {
      // Create thresholds at different dates
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.80,
          confidenceThreshold: 0.85,
          experienceThresholdYears: 2,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.75,
          confidenceThreshold: 0.8,
          experienceThresholdYears: 3,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );
    });

    it('should return threshold effective at specific date', async () => {
      const threshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        new Date('2026-07-15'),
      );

      expect(threshold).toBeDefined();
      expect(threshold?.aiShortlistThreshold.toNumber()).toBe(0.80);
    });

    it('should return most recent threshold for future date', async () => {
      const threshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        new Date('2026-08-15'),
      );

      expect(threshold).toBeDefined();
      expect(threshold?.aiShortlistThreshold.toNumber()).toBe(0.75);
    });

    it('should return null if no threshold effective at date', async () => {
      const threshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        new Date('2026-06-01'),
      );

      expect(threshold).toBeNull();
    });

    it('should include creator information', async () => {
      const threshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        new Date('2026-08-15'),
      );

      expect(threshold?.createdBy).toBeDefined();
      expect(threshold?.createdBy?.id).toBe(adminId);
      expect(threshold?.createdBy?.fullName).toBe('Test Admin');
    });
  });

  describe('In-Flight Application Isolation', () => {
    it('should use different threshold for different submission dates', async () => {
      // Create v1
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.80,
          confidenceThreshold: 0.85,
          experienceThresholdYears: 2,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Application submitted on 2026-07-15
      const submissionThreshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        new Date('2026-07-15'),
      );

      // Create v2 with different values
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.75,
          confidenceThreshold: 0.8,
          experienceThresholdYears: 3,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Current threshold should be different
      const currentThreshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        new Date(),
      );

      expect(submissionThreshold?.aiShortlistThreshold.toNumber()).toBe(0.80);
      expect(currentThreshold?.aiShortlistThreshold.toNumber()).toBe(0.75);
    });

    it('should prevent retroactive threshold changes', async () => {
      const applicationSubmissionDate = new Date('2026-07-15');

      // Create policy
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.80,
          confidenceThreshold: 0.85,
          experienceThresholdYears: 2,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Get threshold for application
      const applicationThreshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        applicationSubmissionDate,
      );

      // Later policy change
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.70,
          confidenceThreshold: 0.75,
          experienceThresholdYears: 4,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Application should still use old threshold
      expect(applicationThreshold?.aiShortlistThreshold.toNumber()).toBe(0.80);
    });
  });

  describe('History Tracking', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        await createScoringThresholdVersion(
          {
            jobFamilyId,
            aiShortlistThreshold: 0.80 - i * 0.05,
            confidenceThreshold: 0.85 - i * 0.05,
            experienceThresholdYears: 2 + i,
            effectiveFrom: new Date(`2026-0${7 + i}-01`),
          },
          adminId,
        );
      }
    });

    it('should return history in reverse chronological order', async () => {
      const history = await getScoringThresholdHistory(jobFamilyId);

      expect(history.length).toBeGreaterThanOrEqual(3);
      // Verify reverse chronological order
      for (let i = 0; i < history.length - 1; i++) {
        expect(history[i].effectiveFrom.getTime()).toBeGreaterThanOrEqual(
          history[i + 1].effectiveFrom.getTime(),
        );
      }
    });

    it('should respect limit parameter', async () => {
      const history = await getScoringThresholdHistory(jobFamilyId, { limit: 2 });
      expect(history.length).toBeLessThanOrEqual(2);
    });

    it('should return only thresholds for specific job family', async () => {
      // Create another job family
      const jobFamily2 = await prisma.jobFamily.create({
        data: {
          name: `Test Job Family 2 ${Date.now()}`,
        },
      });

      // Create threshold for different job family
      await createScoringThresholdVersion(
        {
          jobFamilyId: jobFamily2.id,
          aiShortlistThreshold: 0.50,
          confidenceThreshold: 0.50,
          experienceThresholdYears: 1,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // History should only contain thresholds for original job family
      const history = await getScoringThresholdHistory(jobFamilyId);
      for (const threshold of history) {
        expect(threshold.jobFamilyId).toBe(jobFamilyId);
      }

      await prisma.jobFamily.delete({ where: { id: jobFamily2.id } });
    });
  });

  describe('Get All Effective Thresholds', () => {
    it('should return current effective thresholds for all job families', async () => {
      // Create another job family
      const jobFamily2 = await prisma.jobFamily.create({
        data: {
          name: `Test Job Family 2 ${Date.now()}`,
        },
      });

      // Create thresholds
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.80,
          confidenceThreshold: 0.85,
          experienceThresholdYears: 2,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      await createScoringThresholdVersion(
        {
          jobFamilyId: jobFamily2.id,
          aiShortlistThreshold: 0.75,
          confidenceThreshold: 0.80,
          experienceThresholdYears: 3,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      const allThresholds = await getAllEffectiveScoringThresholds();

      // Should contain both
      const jobFamily1Threshold = allThresholds.find((t) => t.jobFamilyId === jobFamilyId);
      const jobFamily2Threshold = allThresholds.find((t) => t.jobFamilyId === jobFamily2.id);

      expect(jobFamily1Threshold).toBeDefined();
      expect(jobFamily2Threshold).toBeDefined();

      await prisma.jobFamily.delete({ where: { id: jobFamily2.id } });
    });

    it('should return thresholds effective at specific date', async () => {
      // Create v1
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.80,
          confidenceThreshold: 0.85,
          experienceThresholdYears: 2,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Create v2
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.75,
          confidenceThreshold: 0.80,
          experienceThresholdYears: 3,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Query as of 2026-07-15
      const thresholdsJuly = await getAllEffectiveScoringThresholds(new Date('2026-07-15'));
      const julyThreshold = thresholdsJuly.find((t) => t.jobFamilyId === jobFamilyId);

      expect(julyThreshold?.aiShortlistThreshold.toNumber()).toBe(0.80);

      // Query as of 2026-08-15
      const thresholdsAugust = await getAllEffectiveScoringThresholds(new Date('2026-08-15'));
      const augustThreshold = thresholdsAugust.find((t) => t.jobFamilyId === jobFamilyId);

      expect(augustThreshold?.aiShortlistThreshold.toNumber()).toBe(0.75);
    });
  });

  describe('Effective Date Safety Validation', () => {
    it('should reject retroactive effective dates', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      await expect(validateEffectiveDateSafety(yesterday)).rejects.toThrow(
        PolicyValidationError,
      );
    });

    it('should accept today as effective date', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await expect(validateEffectiveDateSafety(today)).resolves.not.toThrow();
    });

    it('should accept future effective dates', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await expect(validateEffectiveDateSafety(tomorrow)).resolves.not.toThrow();
    });
  });

  describe('Audit Logging', () => {
    it('should log version creation with before/after values', async () => {
      // Create v1
      await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.80,
          confidenceThreshold: 0.85,
          experienceThresholdYears: 2,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Create v2
      const v2 = await createScoringThresholdVersion(
        {
          jobFamilyId,
          aiShortlistThreshold: 0.75,
          confidenceThreshold: 0.80,
          experienceThresholdYears: 3,
          effectiveFrom: new Date('2026-08-15'),
        },
        adminId,
      );

      // Verify audit event
      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          action: 'scoring_threshold.version_created',
          resourceId: v2.id,
        },
      });

      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0].metadata).toContainKey('newValues');
      expect(auditEvents[0].metadata).toContainKey('oldValues');
      expect(auditEvents[0].metadata?.jobFamilyId).toBe(jobFamilyId);
    });
  });
});
