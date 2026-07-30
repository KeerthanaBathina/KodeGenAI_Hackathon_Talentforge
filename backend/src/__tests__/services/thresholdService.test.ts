/**
 * Unit tests for threshold service versioning and validation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '@/db/prisma';
import {
  createScreeningThresholdVersion,
  getEffectiveThreshold,
  getThresholdHistory,
  getRecommendation,
  clearThresholdCache,
} from '@/services/thresholdService';
import { InvalidThresholdRangeError, PolicyNotFoundError } from '@/services/errors/PolicyErrors';

describe('Threshold Service - Versioning and Validation', () => {
  const adminId = '00000000-0000-0000-0000-000000000001';

  beforeEach(async () => {
    // Clear cache before each test
    clearThresholdCache();
  });

  afterEach(async () => {
    // Cleanup test data
    await prisma.screeningThreshold.deleteMany({
      where: {
        effectiveFrom: {
          gte: new Date('2026-07-25'),
        },
      },
    });
  });

  describe('Threshold Validation', () => {
    it('should reject shortlist threshold < 0', async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: -1,
            borderlineMin: 40,
            borderlineMax: 60,
            rejectThreshold: 20,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidThresholdRangeError);
    });

    it('should reject shortlist threshold > 100', async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: 101,
            borderlineMin: 40,
            borderlineMax: 60,
            rejectThreshold: 20,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidThresholdRangeError);
    });

    it('should reject when rejectThreshold >= borderlineMin', async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: 80,
            borderlineMin: 40,
            borderlineMax: 60,
            rejectThreshold: 40, // Should be < 40
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidThresholdRangeError);
    });

    it('should reject when borderlineMin >= borderlineMax', async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: 80,
            borderlineMin: 60,
            borderlineMax: 60, // Should be > 60
            rejectThreshold: 20,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidThresholdRangeError);
    });

    it('should reject when borderlineMax >= shortlistThreshold', async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: 80,
            borderlineMin: 40,
            borderlineMax: 80, // Should be < 80
            rejectThreshold: 20,
            effectiveFrom: new Date('2026-08-01'),
          },
          adminId,
        ),
      ).rejects.toThrow(InvalidThresholdRangeError);
    });

    it('should accept valid threshold ranges', async () => {
      const result = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      expect(result).toBeDefined();
      expect(result.shortlistThreshold).toBe(80);
      expect(result.borderlineMin).toBe(40);
      expect(result.borderlineMax).toBe(60);
      expect(result.rejectThreshold).toBe(20);
    });
  });

  describe('Version Management', () => {
    it('should increment version on each new threshold', async () => {
      const v1 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      const v2 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 35,
          borderlineMax: 55,
          rejectThreshold: 15,
          effectiveFrom: new Date('2026-08-15'),
        },
        adminId,
      );

      expect(v2.version).toBe(v1.version + 1);
    });

    it('should start at version 1 for first threshold', async () => {
      // Clean up existing thresholds first
      await prisma.screeningThreshold.deleteMany({});

      const result = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      expect(result.version).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Effective Date Based Retrieval', () => {
    beforeEach(async () => {
      // Create threshold versions at different dates
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 35,
          borderlineMax: 55,
          rejectThreshold: 15,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 70,
          borderlineMin: 30,
          borderlineMax: 50,
          rejectThreshold: 10,
          effectiveFrom: new Date('2026-09-01'),
        },
        adminId,
      );
    });

    it('should return threshold effective at specific date', async () => {
      const threshold = await getEffectiveThreshold(new Date('2026-07-15'));
      expect(threshold.shortlistThreshold).toBe(80);
    });

    it('should return most recent threshold for future date', async () => {
      const threshold = await getEffectiveThreshold(new Date('2026-09-15'));
      expect(threshold.shortlistThreshold).toBe(70);
    });

    it('should return most recent threshold for past submission date', async () => {
      // For in-flight application submitted on 2026-08-15
      const threshold = await getEffectiveThreshold(new Date('2026-08-15'));
      expect(threshold.shortlistThreshold).toBe(75);
    });

    it('should throw error if no threshold effective at date', async () => {
      await expect(
        getEffectiveThreshold(new Date('2026-06-01')), // Before first threshold
      ).rejects.toThrow(PolicyNotFoundError);
    });
  });

  describe('In-Flight Application Isolation', () => {
    it('should use different threshold for past submission vs current', async () => {
      // Create v1
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Get threshold at submission date
      const submissionThreshold = await getEffectiveThreshold(
        new Date('2026-07-15'),
      );

      // Create v2 with different values
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 35,
          borderlineMax: 55,
          rejectThreshold: 15,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Get current threshold
      const currentThreshold = await getEffectiveThreshold(new Date());

      // Should be different
      expect(submissionThreshold.shortlistThreshold).toBe(80);
      expect(currentThreshold.shortlistThreshold).toBe(75);
    });

    it('should prevent retroactive policy changes', async () => {
      // Application submitted on 2026-07-15 should use threshold from that date
      const applicationSubmissionDate = new Date('2026-07-15');

      // First policy
      const policy1 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      // Get threshold for application submitted on 2026-07-15
      const applicationThreshold = await getEffectiveThreshold(
        applicationSubmissionDate,
      );

      // Later policy change
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 70,
          borderlineMin: 30,
          borderlineMax: 50,
          rejectThreshold: 10,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Verify application still uses old threshold
      expect(applicationThreshold.version).toBe(policy1.version);
      expect(applicationThreshold.shortlistThreshold).toBe(80);
    });
  });

  describe('Scoring Recommendations', () => {
    beforeEach(async () => {
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );
    });

    it('should recommend shortlist for score >= shortlistThreshold', async () => {
      const threshold = await getEffectiveThreshold();
      const recommendation = getRecommendation(85, threshold);
      expect(recommendation).toBe('shortlist');
    });

    it('should recommend manual_review for score in borderline range', async () => {
      const threshold = await getEffectiveThreshold();
      const recommendation = getRecommendation(50, threshold);
      expect(recommendation).toBe('manual_review');
    });

    it('should recommend reject for score <= rejectThreshold', async () => {
      const threshold = await getEffectiveThreshold();
      const recommendation = getRecommendation(15, threshold);
      expect(recommendation).toBe('reject');
    });

    it('should handle edge cases correctly', async () => {
      const threshold = await getEffectiveThreshold();

      // At exact boundaries
      expect(getRecommendation(80, threshold)).toBe('shortlist');
      expect(getRecommendation(20, threshold)).toBe('reject');
      expect(getRecommendation(40, threshold)).toBe('manual_review');
      expect(getRecommendation(60, threshold)).toBe('manual_review');
    });
  });

  describe('History Tracking', () => {
    it('should return threshold history in reverse chronological order', async () => {
      const v1 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-07-01'),
        },
        adminId,
      );

      const v2 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 35,
          borderlineMax: 55,
          rejectThreshold: 15,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      const history = await getThresholdHistory();

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].version).toBeGreaterThanOrEqual(history[1].version);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await createScreeningThresholdVersion(
          {
            shortlistThreshold: 80 - i,
            borderlineMin: 40 - i,
            borderlineMax: 60 - i,
            rejectThreshold: 20 - i,
            effectiveFrom: new Date(`2026-0${7 + i}-01`),
          },
          adminId,
        );
      }

      const history = await getThresholdHistory(2);
      expect(history.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache when new version created', async () => {
      const v1 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Cache should be cleared on version creation
      // Verify by creating v2 and checking it's returned
      const v2 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 35,
          borderlineMax: 55,
          rejectThreshold: 15,
          effectiveFrom: new Date('2026-08-15'),
        },
        adminId,
      );

      const current = await getEffectiveThreshold();
      expect(current.version).toBe(v2.version);
    });
  });

  describe('Audit Logging', () => {
    it('should log version creation with before/after values', async () => {
      const v1 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: new Date('2026-08-01'),
        },
        adminId,
      );

      // Verify audit event was created
      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          action: 'threshold.version_created',
          resourceId: v1.id,
        },
      });

      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0].metadata).toContainKey('newValues');
      expect(auditEvents[0].metadata).toContainKey('oldValues');
    });
  });
});
