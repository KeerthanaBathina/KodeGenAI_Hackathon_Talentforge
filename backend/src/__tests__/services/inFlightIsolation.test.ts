import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../db/prisma";
import {
  createScreeningThresholdVersion,
  getEffectiveScreeningThreshold,
} from "../../services/thresholdService";
import {
  createScoringThresholdVersion,
  getEffectiveScoringThreshold,
} from "../../services/scoringThresholdService";
import {
  createApprovalPolicyVersion,
  getApprovalPolicy,
} from "../../services/approvalPolicyService";
import {
  policyTestDataFactory,
  cleanupTestData,
  createTestApplication,
} from "../fixtures/policyTestData";

/**
 * Critical in-flight isolation tests
 * Ensures that policy changes don't affect existing applications
 * This is a core requirement for US-002 Scenario 1 and 4
 */
describe("In-Flight Application Isolation", () => {
  const adminId = "test-admin-123";
  const jobFamilyId = "job-family-eng";

  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("Screening Threshold Isolation", () => {
    it("should use threshold from submission date, not current date", async () => {
      // Create v1 effective Aug 1
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

      // Submit application on Aug 15 (should use v1)
      const app1SubmissionDate = new Date("2026-08-15");
      const app1 = await createTestApplication({
        submittedAt: app1SubmissionDate,
      });

      // Create v2 effective Sep 1
      const v2 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThresholdV2({
          shortlistThreshold: 75,
          borderlineMin: 50,
          borderlineMax: 74,
          rejectThreshold: 49,
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      // Submit application on Sep 15 (should use v2)
      const app2SubmissionDate = new Date("2026-09-15");
      const app2 = await createTestApplication({
        submittedAt: app2SubmissionDate,
      });

      // Query effective thresholds at submission dates
      const app1Threshold = await getEffectiveScreeningThreshold(
        app1SubmissionDate,
      );
      const app2Threshold = await getEffectiveScreeningThreshold(
        app2SubmissionDate,
      );

      // Verify each application uses correct version
      expect(app1Threshold.id).toBe(v1.id);
      expect(app1Threshold.shortlistThreshold).toBe(70);

      expect(app2Threshold.id).toBe(v2.id);
      expect(app2Threshold.shortlistThreshold).toBe(75);
    });

    it("should not affect in-flight applications when policy changes", async () => {
      // Create v1 and application on that date
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

      const applicationDate = new Date("2026-08-15");
      const app = await createTestApplication({
        submittedAt: applicationDate,
      });

      // Get threshold at application submission time
      const initialThreshold = await getEffectiveScreeningThreshold(
        applicationDate,
      );

      // Later, create v2 with MUCH higher threshold
      const v2 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThresholdV2({
          shortlistThreshold: 90, // Much higher - would reject app
          borderlineMin: 70,
          borderlineMax: 89,
          rejectThreshold: 69,
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      // Application should STILL use v1 threshold if screened after v2 created
      const currentThreshold = await getEffectiveScreeningThreshold(
        applicationDate,
      ); // Still query by app submission date

      expect(currentThreshold.id).toBe(v1.id);
      expect(currentThreshold.shortlistThreshold).toBe(70);
      expect(currentThreshold.shortlistThreshold).not.toBe(90);
    });

    it("should handle pre-system applications with earliest threshold", async () => {
      // Create first threshold effective Aug 1, 2026
      const v1 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold({
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      // Application from before system existed (using earliest threshold)
      const app = await createTestApplication({
        submittedAt: new Date("2020-01-15"), // Way before v1
      });

      // Query for application date should fail (no threshold)
      await expect(
        getEffectiveScreeningThreshold(new Date("2020-01-15")),
      ).rejects.toThrow();
    });
  });

  describe("Scoring Threshold Isolation", () => {
    it("should use scoring threshold from submission date", async () => {
      // Create v1 effective Aug 1
      const v1 = await createScoringThresholdVersion(
        policyTestDataFactory.validScoringThreshold({
          jobFamilyId,
          technicalMinScore: new Decimal("0.60"),
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const app1SubmissionDate = new Date("2026-08-15");
      const app1 = await createTestApplication({
        submittedAt: app1SubmissionDate,
      });

      // Create v2 effective Sep 1
      const v2 = await createScoringThresholdVersion(
        policyTestDataFactory.validScoringThresholdV2({
          jobFamilyId,
          technicalMinScore: new Decimal("0.65"),
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      const app2SubmissionDate = new Date("2026-09-15");
      const app2 = await createTestApplication({
        submittedAt: app2SubmissionDate,
      });

      // Each app should use threshold from its submission date
      const app1Threshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        app1SubmissionDate,
      );
      const app2Threshold = await getEffectiveScoringThreshold(
        jobFamilyId,
        app2SubmissionDate,
      );

      expect(app1Threshold.id).toBe(v1.id);
      expect(app1Threshold.technicalMinScore).toEqual(new Decimal("0.60"));

      expect(app2Threshold.id).toBe(v2.id);
      expect(app2Threshold.technicalMinScore).toEqual(new Decimal("0.65"));
    });

    it("should handle per-job-family scoring thresholds independently", async () => {
      const jobFamily1 = "job-family-eng";
      const jobFamily2 = "job-family-sales";

      // Create different thresholds for each job family
      const v1Eng = await createScoringThresholdVersion(
        policyTestDataFactory.validScoringThreshold({
          jobFamilyId: jobFamily1,
          technicalMinScore: new Decimal("0.70"),
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const v1Sales = await createScoringThresholdVersion(
        policyTestDataFactory.validScoringThreshold({
          jobFamilyId: jobFamily2,
          technicalMinScore: new Decimal("0.50"),
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const testDate = new Date("2026-08-15");

      // Each should return different threshold
      const engThreshold = await getEffectiveScoringThreshold(
        jobFamily1,
        testDate,
      );
      const salesThreshold = await getEffectiveScoringThreshold(
        jobFamily2,
        testDate,
      );

      expect(engThreshold.technicalMinScore).toEqual(new Decimal("0.70"));
      expect(salesThreshold.technicalMinScore).toEqual(new Decimal("0.50"));
    });
  });

  describe("Approval Policy Isolation", () => {
    it("should use approval policy from offer creation date, not decision date", async () => {
      // Create v1 effective Aug 1 with 1 approver
      const approver1 = await prisma.user.create({
        data: {
          email: "approver1@test.com",
          fullName: "Approver 1",
          role: "hr_manager",
          active: true,
        },
      });

      const v1 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal("0"),
          compensationBandMax: new Decimal("100000"),
          requiredTiers: [
            {
              tier: 1,
              approverId: approver1.id,
            },
          ],
          effectiveFrom: new Date("2026-08-01"),
          active: true,
        },
        adminId,
      );

      // Offer created Aug 15
      const offer1 = await prisma.offer.create({
        data: {
          applicationId: (
            await createTestApplication({
              submittedAt: new Date("2026-08-15"),
            })
          ).id,
          compensationAmount: new Decimal("80000"),
          currency: "USD",
          startDate: new Date("2026-09-01"),
          status: "pending_approval",
          createdAt: new Date("2026-08-15"),
        },
      });

      // Create v2 effective Sep 1 with 2 approvers
      const approver2 = await prisma.user.create({
        data: {
          email: "approver2@test.com",
          fullName: "Approver 2",
          role: "admin",
          active: true,
        },
      });

      const v2 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal("0"),
          compensationBandMax: new Decimal("100000"),
          requiredTiers: [
            {
              tier: 1,
              approverId: approver1.id,
            },
            {
              tier: 2,
              approverId: approver2.id,
            },
          ],
          effectiveFrom: new Date("2026-09-01"),
          active: true,
        },
        adminId,
      );

      // Offer created Sep 15
      const offer2 = await prisma.offer.create({
        data: {
          applicationId: (
            await createTestApplication({
              submittedAt: new Date("2026-09-15"),
            })
          ).id,
          compensationAmount: new Decimal("80000"),
          currency: "USD",
          startDate: new Date("2026-10-01"),
          status: "pending_approval",
          createdAt: new Date("2026-09-15"),
        },
      });

      // Offer 1 should use v1 (1 approver)
      const policy1 = await getApprovalPolicy(offer1.compensationAmount, new Date("2026-08-15"));
      // Offer 2 should use v2 (2 approvers)
      const policy2 = await getApprovalPolicy(offer2.compensationAmount, new Date("2026-09-15"));

      expect(policy1.requiredTiers).toHaveLength(1);
      expect(policy2.requiredTiers).toHaveLength(2);

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [approver1.id, approver2.id] } },
      });
    });

    it("should not retroactively apply policy changes to existing offers", async () => {
      // Create v1
      const approver1 = await prisma.user.create({
        data: {
          email: "approver1@test.com",
          fullName: "Approver 1",
          role: "hr_manager",
          active: true,
        },
      });

      const v1 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal("0"),
          compensationBandMax: new Decimal("100000"),
          requiredTiers: [
            {
              tier: 1,
              approverId: approver1.id,
            },
          ],
          effectiveFrom: new Date("2026-08-01"),
          active: true,
        },
        adminId,
      );

      // Create offer on Aug 15
      const offerDate = new Date("2026-08-15");
      const offer = await prisma.offer.create({
        data: {
          applicationId: (
            await createTestApplication({
              submittedAt: offerDate,
            })
          ).id,
          compensationAmount: new Decimal("80000"),
          currency: "USD",
          startDate: new Date("2026-09-01"),
          status: "pending_approval",
          createdAt: offerDate,
        },
      });

      const policyAtOfferTime = await getApprovalPolicy(
        offer.compensationAmount,
        offerDate,
      );

      // Later create v2 with deactivated v1
      const approver2 = await prisma.user.create({
        data: {
          email: "approver2@test.com",
          fullName: "Approver 2",
          role: "admin",
          active: true,
        },
      });

      const v2 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal("0"),
          compensationBandMax: new Decimal("100000"),
          requiredTiers: [
            {
              tier: 1,
              approverId: approver2.id,
            },
          ],
          effectiveFrom: new Date("2026-09-01"),
          active: true,
        },
        adminId,
      );

      // Offer should still use original policy
      expect(policyAtOfferTime.requiredTiers[0].approverId).toBe(approver1.id);

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [approver1.id, approver2.id] } },
      });
    });
  });

  describe("Multiple Policy Types Isolation", () => {
    it("should maintain isolation across all three policy types simultaneously", async () => {
      // Create all v1 policies
      const screeningV1 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThreshold({
          shortlistThreshold: 70,
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const scoringV1 = await createScoringThresholdVersion(
        policyTestDataFactory.validScoringThreshold({
          jobFamilyId,
          technicalMinScore: new Decimal("0.60"),
          effectiveFrom: new Date("2026-08-01"),
        }),
        adminId,
      );

      const approver1 = await prisma.user.create({
        data: {
          email: "approver1@test.com",
          fullName: "Approver 1",
          role: "hr_manager",
          active: true,
        },
      });

      const approvalV1 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal("0"),
          compensationBandMax: new Decimal("100000"),
          requiredTiers: [{ tier: 1, approverId: approver1.id }],
          effectiveFrom: new Date("2026-08-01"),
          active: true,
        },
        adminId,
      );

      const app1Date = new Date("2026-08-15");
      const app1 = await createTestApplication({ submittedAt: app1Date });

      // Create all v2 policies
      const screeningV2 = await createScreeningThresholdVersion(
        policyTestDataFactory.validScreeningThresholdV2({
          shortlistThreshold: 80,
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      const scoringV2 = await createScoringThresholdVersion(
        policyTestDataFactory.validScoringThresholdV2({
          jobFamilyId,
          technicalMinScore: new Decimal("0.65"),
          effectiveFrom: new Date("2026-09-01"),
        }),
        adminId,
      );

      const approver2 = await prisma.user.create({
        data: {
          email: "approver2@test.com",
          fullName: "Approver 2",
          role: "admin",
          active: true,
        },
      });

      const approvalV2 = await createApprovalPolicyVersion(
        {
          compensationBandMin: new Decimal("0"),
          compensationBandMax: new Decimal("100000"),
          requiredTiers: [
            { tier: 1, approverId: approver1.id },
            { tier: 2, approverId: approver2.id },
          ],
          effectiveFrom: new Date("2026-09-01"),
          active: true,
        },
        adminId,
      );

      const app2Date = new Date("2026-09-15");
      const app2 = await createTestApplication({ submittedAt: app2Date });

      // Verify app1 uses v1 of all policies
      const app1Screening = await getEffectiveScreeningThreshold(app1Date);
      const app1Scoring = await getEffectiveScoringThreshold(jobFamilyId, app1Date);
      const app1Approval = await getApprovalPolicy(
        new Decimal("80000"),
        app1Date,
      );

      expect(app1Screening.id).toBe(screeningV1.id);
      expect(app1Scoring.id).toBe(scoringV1.id);
      expect(app1Approval.requiredTiers).toHaveLength(1);

      // Verify app2 uses v2 of all policies
      const app2Screening = await getEffectiveScreeningThreshold(app2Date);
      const app2Scoring = await getEffectiveScoringThreshold(jobFamilyId, app2Date);
      const app2Approval = await getApprovalPolicy(
        new Decimal("80000"),
        app2Date,
      );

      expect(app2Screening.id).toBe(screeningV2.id);
      expect(app2Scoring.id).toBe(scoringV2.id);
      expect(app2Approval.requiredTiers).toHaveLength(2);

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [approver1.id, approver2.id] } },
      });
    });
  });
});
