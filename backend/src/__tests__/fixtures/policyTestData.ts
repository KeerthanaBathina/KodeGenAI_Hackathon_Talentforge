import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../db/prisma";

/**
 * Test data factory for policy versioning tests
 * Provides consistent, realistic test data across all test suites
 */

export const policyTestDataFactory = {
  /**
   * Valid screening threshold data
   */
  validScreeningThreshold: (overrides = {}) => ({
    shortlistThreshold: 75,
    borderlineMin: 50,
    borderlineMax: 74,
    rejectThreshold: 49,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Alternative valid screening threshold (for version comparison tests)
   */
  validScreeningThresholdV2: (overrides = {}) => ({
    shortlistThreshold: 80,
    borderlineMin: 55,
    borderlineMax: 79,
    rejectThreshold: 54,
    effectiveFrom: new Date("2026-09-01"),
    ...overrides,
  }),

  /**
   * Invalid screening threshold - shortlist too low
   */
  invalidScreeningThresholdLowShortlist: (overrides = {}) => ({
    shortlistThreshold: 60, // Invalid: must be > borderlineMax
    borderlineMin: 50,
    borderlineMax: 70,
    rejectThreshold: 49,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Invalid screening threshold - value out of range
   */
  invalidScreeningThresholdOutOfRange: (overrides = {}) => ({
    shortlistThreshold: 105, // Invalid: must be 0-100
    borderlineMin: 50,
    borderlineMax: 100,
    rejectThreshold: 49,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Invalid screening threshold - bad ordering
   */
  invalidScreeningThresholdBadOrdering: (overrides = {}) => ({
    shortlistThreshold: 75,
    borderlineMin: 70, // Invalid: >= borderlineMax
    borderlineMax: 70,
    rejectThreshold: 49,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Valid scoring threshold data (per job family)
   */
  validScoringThreshold: (overrides = {}) => ({
    jobFamilyId: "job-family-123",
    technicalMinScore: new Decimal("0.60"),
    technicalPassScore: new Decimal("0.75"),
    behavioralMinScore: new Decimal("0.50"),
    behavioralPassScore: new Decimal("0.70"),
    yearsOfExperienceRequired: 3,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Valid scoring threshold V2
   */
  validScoringThresholdV2: (overrides = {}) => ({
    jobFamilyId: "job-family-123",
    technicalMinScore: new Decimal("0.65"),
    technicalPassScore: new Decimal("0.80"),
    behavioralMinScore: new Decimal("0.55"),
    behavioralPassScore: new Decimal("0.75"),
    yearsOfExperienceRequired: 4,
    effectiveFrom: new Date("2026-09-01"),
    ...overrides,
  }),

  /**
   * Invalid scoring threshold - score out of range
   */
  invalidScoringThresholdOutOfRange: (overrides = {}) => ({
    jobFamilyId: "job-family-123",
    technicalMinScore: new Decimal("1.5"), // Invalid: must be 0.0-1.0
    technicalPassScore: new Decimal("0.75"),
    behavioralMinScore: new Decimal("0.50"),
    behavioralPassScore: new Decimal("0.70"),
    yearsOfExperienceRequired: 3,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Invalid scoring threshold - min > pass
   */
  invalidScoringThresholdBadOrdering: (overrides = {}) => ({
    jobFamilyId: "job-family-123",
    technicalMinScore: new Decimal("0.80"),
    technicalPassScore: new Decimal("0.75"), // Invalid: < min
    behavioralMinScore: new Decimal("0.50"),
    behavioralPassScore: new Decimal("0.70"),
    yearsOfExperienceRequired: 3,
    effectiveFrom: new Date("2026-08-01"),
    ...overrides,
  }),

  /**
   * Valid approval policy data
   */
  validApprovalPolicy: (overrides = {}) => ({
    compensationBandMin: new Decimal("0"),
    compensationBandMax: new Decimal("100000"),
    requiredTiers: [
      {
        tier: 1,
        approverId: "approver-123",
      },
    ],
    effectiveFrom: new Date("2026-08-01"),
    active: true,
    ...overrides,
  }),

  /**
   * Valid approval policy V2 with more tiers
   */
  validApprovalPolicyV2: (overrides = {}) => ({
    compensationBandMin: new Decimal("100000"),
    compensationBandMax: new Decimal("250000"),
    requiredTiers: [
      {
        tier: 1,
        approverId: "approver-123",
      },
      {
        tier: 2,
        approverId: "approver-456",
      },
    ],
    effectiveFrom: new Date("2026-09-01"),
    active: true,
    ...overrides,
  }),

  /**
   * Invalid approval policy - min >= max
   */
  invalidApprovalPolicyBadRange: (overrides = {}) => ({
    compensationBandMin: new Decimal("100000"),
    compensationBandMax: new Decimal("50000"), // Invalid: < min
    requiredTiers: [
      {
        tier: 1,
        approverId: "approver-123",
      },
    ],
    effectiveFrom: new Date("2026-08-01"),
    active: true,
    ...overrides,
  }),

  /**
   * Invalid approval policy - duplicate tiers
   */
  invalidApprovalPolicyDuplicateTiers: (overrides = {}) => ({
    compensationBandMin: new Decimal("0"),
    compensationBandMax: new Decimal("100000"),
    requiredTiers: [
      {
        tier: 1,
        approverId: "approver-123",
      },
      {
        tier: 1, // Invalid: duplicate tier
        approverId: "approver-456",
      },
    ],
    effectiveFrom: new Date("2026-08-01"),
    active: true,
    ...overrides,
  }),

  /**
   * Invalid approval policy - non-sequential tiers
   */
  invalidApprovalPolicyNonSequentialTiers: (overrides = {}) => ({
    compensationBandMin: new Decimal("0"),
    compensationBandMax: new Decimal("100000"),
    requiredTiers: [
      {
        tier: 1,
        approverId: "approver-123",
      },
      {
        tier: 3, // Invalid: skips tier 2
        approverId: "approver-456",
      },
    ],
    effectiveFrom: new Date("2026-08-01"),
    active: true,
    ...overrides,
  }),

  /**
   * Application data for in-flight isolation tests
   */
  validApplication: (overrides = {}) => ({
    candidateId: "candidate-123",
    jobId: "job-123",
    requisitionId: "req-123",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phoneNumber: "+1234567890",
    submittedAt: new Date(),
    status: "submitted",
    ...overrides,
  }),

  /**
   * Offer data for approval policy tests
   */
  validOffer: (overrides = {}) => ({
    applicationId: "app-123",
    compensationAmount: new Decimal("100000"),
    currency: "USD",
    startDate: new Date("2026-09-01"),
    status: "pending_approval",
    createdAt: new Date(),
    ...overrides,
  }),

  /**
   * User data for admin tests
   */
  adminUser: (overrides = {}) => ({
    id: "admin-123",
    email: "admin@example.com",
    firstName: "Admin",
    lastName: "User",
    role: "admin",
    ...overrides,
  }),

  /**
   * User data for approver tests
   */
  approverUser: (overrides = {}) => ({
    id: "approver-123",
    email: "approver@example.com",
    firstName: "Approver",
    lastName: "User",
    role: "approver",
    ...overrides,
  }),

  /**
   * Date range for in-flight isolation tests
   */
  dateRange: () => ({
    before: new Date("2026-07-01"),
    v1Effective: new Date("2026-08-01"),
    v1Period: new Date("2026-08-15"),
    v2Effective: new Date("2026-09-01"),
    v2Period: new Date("2026-09-15"),
    after: new Date("2026-10-01"),
  }),
};

/**
 * Helper to create test screening threshold in database
 */
export async function createTestScreeningThreshold(
  data = {},
  adminId: string = "admin-123",
) {
  return prisma.screeningThreshold.create({
    data: {
      ...policyTestDataFactory.validScreeningThreshold(data),
      version: 1,
      createdById: adminId,
    },
  });
}

/**
 * Helper to create test scoring threshold in database
 */
export async function createTestScoringThreshold(
  data = {},
  adminId: string = "admin-123",
) {
  return prisma.scoringThreshold.create({
    data: {
      ...policyTestDataFactory.validScoringThreshold(data),
      version: 1,
      createdById: adminId,
    },
  });
}

/**
 * Helper to create test approval policy in database
 */
export async function createTestApprovalPolicy(
  data = {},
  adminId: string = "admin-123",
) {
  return prisma.approvalPolicy.create({
    data: {
      ...policyTestDataFactory.validApprovalPolicy(data),
      version: 1,
      createdById: adminId,
    },
  });
}

/**
 * Helper to create test application in database
 */
export async function createTestApplication(
  data = {},
  requisitionId: string = "req-123",
) {
  return prisma.application.create({
    data: {
      ...policyTestDataFactory.validApplication(data),
      requisitionId,
    },
  });
}

/**
 * Helper to create multiple threshold versions for testing history
 */
export async function createTestThresholdHistory(
  count: number = 5,
  adminId: string = "admin-123",
) {
  const versions = [];
  for (let i = 0; i < count; i++) {
    const effectiveDate = new Date("2026-08-01");
    effectiveDate.setMonth(effectiveDate.getMonth() + i);

    versions.push(
      await prisma.screeningThreshold.create({
        data: {
          ...policyTestDataFactory.validScreeningThreshold(),
          version: i + 1,
          effectiveFrom: effectiveDate,
          createdById: adminId,
        },
      }),
    );
  }
  return versions;
}

/**
 * Helper to clean up test data
 */
export async function cleanupTestData() {
  // Delete in order of dependencies
  await prisma.approval.deleteMany();
  await prisma.approvalPolicy.deleteMany();
  await prisma.scoring.deleteMany();
  await prisma.scoringThreshold.deleteMany();
  await prisma.screening.deleteMany();
  await prisma.screeningThreshold.deleteMany();
  await prisma.application.deleteMany();
  await prisma.offer.deleteMany();
}
