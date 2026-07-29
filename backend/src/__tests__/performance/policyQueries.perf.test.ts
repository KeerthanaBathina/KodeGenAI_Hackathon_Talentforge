import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  getEffectiveScreeningThreshold,
  getScreeningThresholdHistory,
} from "../../services/thresholdService";
import {
  getEffectiveScoringThreshold,
  getScoringThresholdHistory,
} from "../../services/scoringThresholdService";
import { prisma } from "../../db/prisma";
import {
  policyTestDataFactory,
  cleanupTestData,
  createTestScreeningThreshold,
  createTestScoringThreshold,
} from "../fixtures/policyTestData";

/**
 * Performance tests for policy versioning queries
 * Ensures queries meet SLA requirements even with large datasets
 * Target: All queries < 100ms, most < 50ms
 */
describe("Policy Query Performance", () => {
  const adminId = "test-admin-123";
  const jobFamilyId = "job-family-perf-test";
  const threshold = 100; // ms - SLA target

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("Screening Threshold Queries", () => {
    it("should query effective threshold efficiently with 100 versions", async () => {
      // Create 100 versions over time
      const dates = [];
      for (let i = 0; i < 100; i++) {
        const date = new Date("2020-01-01");
        date.setMonth(date.getMonth() + (i % 120)); // Spread over 10 years
        dates.push(date);

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 15),
          },
          adminId,
        );
      }

      // Query in the middle
      const queryDate = new Date("2024-01-01");
      const startTime = performance.now();
      const result = await getEffectiveScreeningThreshold(queryDate);
      const duration = performance.now() - startTime;

      expect(result).toBeDefined();
      expect(duration).toBeLessThan(threshold);
      console.log(`✓ Effective threshold query: ${duration.toFixed(2)}ms`);
    });

    it("should retrieve history efficiently with 1000 versions", async () => {
      // Create 1000 versions
      for (let i = 0; i < 1000; i++) {
        const date = new Date("2000-01-01");
        date.setDate(date.getDate() + i); // One per day for ~2.7 years

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 20),
          },
          adminId,
        );
      }

      // Get last 100
      const startTime = performance.now();
      const history = await getScreeningThresholdHistory(100);
      const duration = performance.now() - startTime;

      expect(history).toHaveLength(100);
      expect(duration).toBeLessThan(threshold);
      console.log(`✓ History query (1000 versions, limit 100): ${duration.toFixed(2)}ms`);
    });

    it("should paginate through history efficiently", async () => {
      // Create 500 versions
      for (let i = 0; i < 500; i++) {
        const date = new Date("2020-01-01");
        date.setDate(date.getDate() + i);

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 20),
          },
          adminId,
        );
      }

      // Get 5 pages of 20 items each
      const pageTimes: number[] = [];

      for (let page = 0; page < 5; page++) {
        const startTime = performance.now();
        const history = await getScreeningThresholdHistory(20);
        const duration = performance.now() - startTime;
        pageTimes.push(duration);

        expect(history).toHaveLength(20);
      }

      // All pages should be fast
      const avgPageTime = pageTimes.reduce((a, b) => a + b) / pageTimes.length;
      expect(avgPageTime).toBeLessThan(threshold);
      console.log(
        `✓ Pagination (5 pages): avg ${avgPageTime.toFixed(2)}ms, max ${Math.max(...pageTimes).toFixed(2)}ms`,
      );
    });

    it("should handle concurrent queries efficiently", async () => {
      // Create 200 versions
      for (let i = 0; i < 200; i++) {
        const date = new Date("2020-01-01");
        date.setMonth(date.getMonth() + i);

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 15),
          },
          adminId,
        );
      }

      // Run 10 concurrent queries
      const startTime = performance.now();
      const queries = Array.from({ length: 10 }, () =>
        getEffectiveScreeningThreshold(new Date("2024-01-01")),
      );
      await Promise.all(queries);
      const duration = performance.now() - startTime;

      // Should complete within reasonable time even with concurrency
      expect(duration).toBeLessThan(threshold * 2);
      console.log(`✓ 10 concurrent queries: ${duration.toFixed(2)}ms total`);
    });
  });

  describe("Scoring Threshold Queries", () => {
    it("should query effective scoring threshold efficiently", async () => {
      // Create 100 versions per job family
      for (let family = 0; family < 3; family++) {
        const familyId = `job-family-${family}`;
        for (let i = 0; i < 100; i++) {
          const date = new Date("2020-01-01");
          date.setMonth(date.getMonth() + i);

          await createTestScoringThreshold(
            {
              jobFamilyId: familyId,
              effectiveFrom: date,
              technicalMinScore: new Decimal("0.50").add(
                new Decimal(i % 40).dividedBy(new Decimal(1000)),
              ),
            },
            adminId,
          );
        }
      }

      // Query for each job family
      const queryDate = new Date("2024-01-01");
      const times: number[] = [];

      for (let family = 0; family < 3; family++) {
        const familyId = `job-family-${family}`;
        const startTime = performance.now();
        const result = await getEffectiveScoringThreshold(
          familyId,
          queryDate,
        );
        const duration = performance.now() - startTime;
        times.push(duration);

        expect(result).toBeDefined();
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      expect(avgTime).toBeLessThan(threshold);
      console.log(
        `✓ Scoring threshold queries (3 families): avg ${avgTime.toFixed(2)}ms`,
      );
    });

    it("should retrieve scoring threshold history efficiently", async () => {
      // Create 500 versions for one job family
      for (let i = 0; i < 500; i++) {
        const date = new Date("2020-01-01");
        date.setMonth(date.getMonth() + (i % 60));

        await createTestScoringThreshold(
          {
            jobFamilyId,
            effectiveFrom: date,
            technicalMinScore: new Decimal("0.50").add(
              new Decimal(i % 40).dividedBy(new Decimal(1000)),
            ),
          },
          adminId,
        );
      }

      // Get full history
      const startTime = performance.now();
      const history = await getScoringThresholdHistory(jobFamilyId);
      const duration = performance.now() - startTime;

      expect(history.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(threshold);
      console.log(
        `✓ Scoring threshold history query: ${duration.toFixed(2)}ms (${history.length} versions)`,
      );
    });

    it("should filter by job family efficiently with multiple families", async () => {
      // Create 50 versions for each of 10 job families
      const families = Array.from({ length: 10 }, (_, i) => `job-family-${i}`);

      for (const familyId of families) {
        for (let i = 0; i < 50; i++) {
          const date = new Date("2020-01-01");
          date.setMonth(date.getMonth() + i);

          await createTestScoringThreshold(
            {
              jobFamilyId: familyId,
              effectiveFrom: date,
              technicalMinScore: new Decimal("0.50").add(
                new Decimal(i % 40).dividedBy(new Decimal(1000)),
              ),
            },
            adminId,
          );
        }
      }

      // Query for one family should be fast despite 500 total versions
      const startTime = performance.now();
      const history = await getScoringThresholdHistory(families[0]);
      const duration = performance.now() - startTime;

      expect(history).toHaveLength(50);
      expect(duration).toBeLessThan(threshold);
      console.log(`✓ History filter by job family: ${duration.toFixed(2)}ms`);
    });
  });

  describe("Backup and Restore Performance", () => {
    it("should handle backup of large policy dataset efficiently", async () => {
      // Create 500 screening thresholds
      const screeningVersions = [];
      for (let i = 0; i < 500; i++) {
        const date = new Date("2020-01-01");
        date.setDate(date.getDate() + i);

        const version = await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 20),
          },
          adminId,
        );
        screeningVersions.push(version);
      }

      // Simulate backup query
      const startTime = performance.now();
      const allVersions = await prisma.screeningThreshold.findMany({
        orderBy: { effectiveFrom: "desc" },
        include: { createdBy: true },
      });
      const duration = performance.now() - startTime;

      expect(allVersions.length).toBe(500);
      expect(duration).toBeLessThan(300); // Slightly higher SLA for full backup
      console.log(`✓ Backup query (500 versions): ${duration.toFixed(2)}ms`);
    });
  });

  describe("Complex Queries", () => {
    it("should find all active policies efficiently", async () => {
      // Create mixed set of active/inactive policies
      for (let i = 0; i < 100; i++) {
        const date = new Date("2020-01-01");
        date.setMonth(date.getMonth() + i);

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 20),
          },
          adminId,
        );
      }

      // Query active policies
      const startTime = performance.now();
      const active = await prisma.screeningThreshold.findMany({
        where: { effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: "desc" },
        take: 1,
      });
      const duration = performance.now() - startTime;

      expect(active.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(threshold);
      console.log(`✓ Active policy query: ${duration.toFixed(2)}ms`);
    });

    it("should handle date range queries efficiently", async () => {
      // Create 200 versions
      for (let i = 0; i < 200; i++) {
        const date = new Date("2020-01-01");
        date.setMonth(date.getMonth() + i);

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 20),
          },
          adminId,
        );
      }

      // Query for versions in a date range
      const startDate = new Date("2022-01-01");
      const endDate = new Date("2024-12-31");

      const startTime = performance.now();
      const versionsInRange = await prisma.screeningThreshold.findMany({
        where: {
          effectiveFrom: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { effectiveFrom: "desc" },
      });
      const duration = performance.now() - startTime;

      expect(versionsInRange.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(threshold);
      console.log(
        `✓ Date range query: ${duration.toFixed(2)}ms (${versionsInRange.length} versions)`,
      );
    });
  });

  describe("Memory and Index Usage", () => {
    it("should not exceed memory limits with large dataset", async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create 1000 versions
      for (let i = 0; i < 1000; i++) {
        const date = new Date("2010-01-01");
        date.setDate(date.getDate() + i);

        await createTestScreeningThreshold(
          {
            effectiveFrom: date,
            shortlistThreshold: 70 + (i % 20),
          },
          adminId,
        );
      }

      const afterCreation = process.memoryUsage().heapUsed;

      // Perform queries
      for (let j = 0; j < 10; j++) {
        await getEffectiveScreeningThreshold(new Date("2024-01-01"));
      }

      const afterQueries = process.memoryUsage().heapUsed;
      const memoryDelta = afterQueries - initialMemory;

      // Should not grow unbounded (allow 100MB for test data)
      expect(memoryDelta).toBeLessThan(100 * 1024 * 1024);
      console.log(`✓ Memory usage: ${(memoryDelta / 1024 / 1024).toFixed(2)}MB`);
    });
  });
});
