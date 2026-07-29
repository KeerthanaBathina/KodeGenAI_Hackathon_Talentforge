import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  createScreeningThresholdVersion,
  getEffectiveScreeningThreshold,
  getScreeningThresholdHistory,
} from "../../services/thresholdService";
import { auditService } from "../../services/auditService";
import { prisma } from "../../db/prisma";
import {
  policyTestDataFactory,
  createTestScreeningThreshold,
  cleanupTestData,
} from "../fixtures/policyTestData";

/**
 * Unit tests for screening threshold service
 * Tests version creation, effective date logic, and history retrieval
 */
describe("ScreeningThresholdService", () => {
  const adminId = "test-admin-123";

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestData();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupTestData();
  });

  describe("createScreeningThresholdVersion", () => {
    it("should create new screening threshold with version 1", async () => {
      const data = policyTestDataFactory.validScreeningThreshold();

      const result = await createScreeningThresholdVersion(data, adminId);

      expect(result).toBeDefined();
      expect(result.version).toBe(1);
      expect(result.shortlistThreshold).toBe(data.shortlistThreshold);
      expect(result.borderlineMin).toBe(data.borderlineMin);
      expect(result.borderlineMax).toBe(data.borderlineMax);
      expect(result.rejectThreshold).toBe(data.rejectThreshold);
      expect(result.createdById).toBe(adminId);
    });

    it("should increment version number on subsequent creates", async () => {
      const data1 = policyTestDataFactory.validScreeningThreshold({
        effectiveFrom: new Date("2026-08-01"),
      });
      const data2 = policyTestDataFactory.validScreeningThresholdV2({
        effectiveFrom: new Date("2026-09-01"),
      });

      const v1 = await createScreeningThresholdVersion(data1, adminId);
      const v2 = await createScreeningThresholdVersion(data2, adminId);

      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
    });

    it("should set effective date correctly", async () => {
      const effectiveDate = new Date("2026-08-15");
      const data = policyTestDataFactory.validScreeningThreshold({
        effectiveFrom: effectiveDate,
      });

      const result = await createScreeningThresholdVersion(data, adminId);

      expect(result.effectiveFrom).toEqual(effectiveDate);
    });

    it("should reject thresholds with shortlist < borderlineMax", async () => {
      const data = policyTestDataFactory.invalidScreeningThresholdLowShortlist();

      await expect(
        createScreeningThresholdVersion(data, adminId),
      ).rejects.toThrow();
    });

    it("should reject values outside 0-100 range", async () => {
      const data = policyTestDataFactory.invalidScreeningThresholdOutOfRange();

      await expect(
        createScreeningThresholdVersion(data, adminId),
      ).rejects.toThrow(/0 and 100/);
    });

    it("should reject borderlineMin >= borderlineMax", async () => {
      const data = policyTestDataFactory.invalidScreeningThresholdBadOrdering();

      await expect(
        createScreeningThresholdVersion(data, adminId),
      ).rejects.toThrow();
    });

    it("should reject negative thresholds", async () => {
      const data = policyTestDataFactory.validScreeningThreshold({
        rejectThreshold: -1,
      });

      await expect(
        createScreeningThresholdVersion(data, adminId),
      ).rejects.toThrow();
    });

    it("should log audit event on successful creation", async () => {
      const auditSpy = vi.spyOn(auditService, "logEvent");
      const data = policyTestDataFactory.validScreeningThreshold();

      await createScreeningThresholdVersion(data, adminId);

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "threshold.version_created",
          actorId: adminId,
          entityId: expect.any(String),
          entityType: "screening_threshold",
        }),
      );
    });

    it("should track creator in database", async () => {
      const data = policyTestDataFactory.validScreeningThreshold();

      const result = await createScreeningThresholdVersion(data, adminId);
      const stored = await prisma.screeningThreshold.findUnique({
        where: { id: result.id },
      });

      expect(stored?.createdById).toBe(adminId);
    });
  });

  describe("getEffectiveScreeningThreshold", () => {
    it("should return threshold effective at specific date", async () => {
      const v1 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold({
          shortlistThreshold: 70,
          borderlineMin: 45,
          borderlineMax: 69,
          rejectThreshold: 44,
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const v2 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThresholdV2({
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      // Query for Aug 15 should return v1
      const threshold1 = await getEffectiveScreeningThreshold(
        new Date("2026-08-15"),
      );
      expect(threshold1.id).toBe(v1.id);
      expect(threshold1.shortlistThreshold).toBe(70);
      expect(threshold1.version).toBe(1);

      // Query for Sep 15 should return v2
      const threshold2 = await getEffectiveScreeningThreshold(
        new Date("2026-09-15"),
      );
      expect(threshold2.id).toBe(v2.id);
      expect(threshold2.shortlistThreshold).toBe(80);
      expect(threshold2.version).toBe(2);
    });

    it("should return latest version for future date", async () => {
      const v1 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold({
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const threshold = await getEffectiveScreeningThreshold(
        new Date("2030-12-31"),
      );
      expect(threshold.id).toBe(v1.id);
    });

    it("should throw error if no threshold effective at date", async () => {
      await expect(
        getEffectiveScreeningThreshold(new Date("2020-01-01")),
      ).rejects.toThrow();
    });

    it("should use exact boundary date correctly", async () => {
      const effectiveDate = new Date("2026-08-01T00:00:00Z");
      const v1 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold({
          effectiveFrom: effectiveDate,
        }),
        adminId,
      );

      // Exact date should return this threshold
      const threshold = await getEffectiveScreeningThreshold(effectiveDate);
      expect(threshold.id).toBe(v1.id);
    });

    it("should return correct version for date between v1 and v2 effective dates", async () => {
      const v1 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold({
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThresholdV2({
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      // Date between v1 and v2
      const threshold = await getEffectiveScreeningThreshold(
        new Date("2026-08-20"),
      );
      expect(threshold.id).toBe(v1.id);
    });
  });

  describe("getScreeningThresholdHistory", () => {
    it("should return versions in reverse chronological order", async () => {
      const dates = [
        new Date("2026-08-01"),
        new Date("2026-09-01"),
        new Date("2026-10-01"),
      ];

      const versions = [];
      for (let i = 0; i < 3; i++) {
        const v = await createScreeningThresholdVersion(
          policyTestDataFactory.validScreeningThreshold({
            effectiveFrom: dates[i],
          }),
          adminId,
        );
        versions.push(v);
      }

      const history = await getScreeningThresholdHistory();

      expect(history).toHaveLength(3);
      expect(history[0].version).toBe(3);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(1);
    });

    it("should limit results to specified count", async () => {
      for (let i = 0; i < 10; i++) {
        const date = new Date("2026-08-01");
        date.setMonth(date.getMonth() + i);

        await createScreeningThresholdVersion(
          policyTestDataFactory.validScreeningThreshold({
            effectiveFrom: date,
          }),
          adminId,
        );
      }

      const history = await getScreeningThresholdHistory(5);
      expect(history).toHaveLength(5);
    });

    it("should return empty array if no versions exist", async () => {
      const history = await getScreeningThresholdHistory();
      expect(history).toEqual([]);
    });

    it("should include all threshold fields in response", async () => {
      await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold(),
        adminId,
      );

      const history = await getScreeningThresholdHistory(1);

      expect(history[0]).toHaveProperty("id");
      expect(history[0]).toHaveProperty("version");
      expect(history[0]).toHaveProperty("shortlistThreshold");
      expect(history[0]).toHaveProperty("borderlineMin");
      expect(history[0]).toHaveProperty("borderlineMax");
      expect(history[0]).toHaveProperty("rejectThreshold");
      expect(history[0]).toHaveProperty("effectiveFrom");
      expect(history[0]).toHaveProperty("createdById");
    });

    it("should default to 10 items if no limit specified", async () => {
      for (let i = 0; i < 15; i++) {
        const date = new Date("2026-08-01");
        date.setMonth(date.getMonth() + i);

        await createScreeningThresholdVersion(
          policyTestDataFactory.validScreeningThreshold({
            effectiveFrom: date,
          }),
          adminId,
        );
      }

      const history = await getScreeningThresholdHistory();
      expect(history).toHaveLength(10);
    });

    it("should respect limit=1 for latest version only", async () => {
      await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold(),
        adminId,
      );
      await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThresholdV2(),
        adminId,
      );

      const history = await getScreeningThresholdHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe(2);
    });
  });

  describe("Validation rules", () => {
    it("should require all threshold values to be integers", async () => {
      const data = policyTestDataFactory.validScreeningThreshold({
        shortlistThreshold: 75.5, // Float instead of int
      });

      await expect(
        createScreeningThresholdVersion(data as any, adminId),
      ).rejects.toThrow();
    });

    it("should enforce ordering: rejectThreshold < borderlineMin < borderlineMax < shortlistThreshold", async () => {
      const validData = {
        rejectThreshold: 40,
        borderlineMin: 50,
        borderlineMax: 70,
        shortlistThreshold: 80,
        effectiveFrom: new Date(),
      };

      // This should work
      const result = await createScreeningThresholdVersion(validData, adminId);
      expect(result).toBeDefined();

      // Invalid: rejectThreshold >= borderlineMin
      await expect(
        createScreeningThresholdVersion(
          {
            ...validData,
            rejectThreshold: 50,
          },
          adminId,
        ),
      ).rejects.toThrow();

      // Invalid: borderlineMin >= borderlineMax
      await expect(
        createScreeningThresholdVersion(
          {
            ...validData,
            borderlineMin: 70,
            borderlineMax: 70,
          },
          adminId,
        ),
      ).rejects.toThrow();

      // Invalid: borderlineMax >= shortlistThreshold
      await expect(
        createScreeningThresholdVersion(
          {
            ...validData,
            borderlineMax: 80,
            shortlistThreshold: 80,
          },
          adminId,
        ),
      ).rejects.toThrow();
    });
  });

  describe("Concurrent version creation", () => {
    it("should handle concurrent creates with correct version numbering", async () => {
      const data1 = policyTestDataFactory.validScreeningThreshold({
        effectiveFrom: new Date("2026-08-01"),
      });
      const data2 = policyTestDataFactory.validScreeningThresholdV2({
        effectiveFrom: new Date("2026-09-01"),
      });

      // Create both concurrently
      const [v1, v2] = await Promise.all([
        createScreeningThresholdVersion(data1, adminId),
        createScreeningThresholdVersion(data2, adminId),
      ]);

      // Both should have unique versions
      expect([v1.version, v2.version].sort()).toEqual([1, 2]);

      // History should have both
      const history = await getScreeningThresholdHistory();
      expect(history).toHaveLength(2);
    });
  });
});
