---
id: TASK-006
user_story: US-002
title: "Testing - Comprehensive Policy Versioning Tests"
status: todo
priority: high
assigned_to: qa-team
estimated_hours: 12
layer: testing
dependencies: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005]
---

# TASK-006 — Testing - Comprehensive Policy Versioning Tests

## Objective

Implement comprehensive test coverage for policy versioning functionality including unit tests, integration tests, and E2E tests with focus on effective-date isolation and in-flight application protection.

## Scope

Create tests for all policy types, validation logic, history tracking, and critical in-flight isolation scenarios.

## Testing Requirements

### 1. Backend Unit Tests - Threshold Service

#### File: `/backend/src/__tests__/services/thresholdService.test.ts`

**Test Cases:**

```typescript
describe("ThresholdService", () => {
  describe("createScreeningThresholdVersion", () => {
    it("should create new version with incremented version number", async () => {
      // Create v1
      const v1 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 50,
          borderlineMax: 74,
          rejectThreshold: 49,
          effectiveFrom: new Date("2026-08-01"),
        },
        adminId,
      );

      expect(v1.version).toBe(1);

      // Create v2
      const v2 = await createScreeningThresholdVersion(
        {
          shortlistThreshold: 80,
          borderlineMin: 55,
          borderlineMax: 79,
          rejectThreshold: 54,
          effectiveFrom: new Date("2026-09-01"),
        },
        adminId,
      );

      expect(v2.version).toBe(2);
    });

    it("should reject thresholds with invalid ranges", async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: 60, // Invalid: must be > borderlineMax
            borderlineMin: 50,
            borderlineMax: 70,
            rejectThreshold: 49,
            effectiveFrom: new Date(),
          },
          adminId,
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("should reject values outside 0-100 range", async () => {
      await expect(
        createScreeningThresholdVersion(
          {
            shortlistThreshold: 105, // Invalid
            borderlineMin: 50,
            borderlineMax: 70,
            rejectThreshold: 49,
            effectiveFrom: new Date(),
          },
          adminId,
        ),
      ).rejects.toThrow("must be between 0 and 100");
    });

    it("should log audit event on creation", async () => {
      const auditSpy = vi.spyOn(auditService, "logEvent");

      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 50,
          borderlineMax: 74,
          rejectThreshold: 49,
          effectiveFrom: new Date(),
        },
        adminId,
      );

      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "threshold.version_created",
          actorId: adminId,
        }),
      );
    });
  });

  describe("getEffectiveThreshold", () => {
    it("should return threshold effective at specific date", async () => {
      // Create v1 effective Aug 1
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 70,
          borderlineMin: 45,
          borderlineMax: 69,
          rejectThreshold: 44,
          effectiveFrom: new Date("2026-08-01"),
        },
        adminId,
      );

      // Create v2 effective Sep 1
      await createScreeningThresholdVersion(
        {
          shortlistThreshold: 75,
          borderlineMin: 50,
          borderlineMax: 74,
          rejectThreshold: 49,
          effectiveFrom: new Date("2026-09-01"),
        },
        adminId,
      );

      // Query for Aug 15 should return v1
      const threshold = await getEffectiveThreshold(new Date("2026-08-15"));
      expect(threshold.shortlistThreshold).toBe(70);
      expect(threshold.version).toBe(1);

      // Query for Sep 15 should return v2
      const threshold2 = await getEffectiveThreshold(new Date("2026-09-15"));
      expect(threshold2.shortlistThreshold).toBe(75);
      expect(threshold2.version).toBe(2);
    });

    it("should throw error if no threshold effective at date", async () => {
      await expect(
        getEffectiveThreshold(new Date("2020-01-01")),
      ).rejects.toThrow(PolicyNotFoundError);
    });
  });

  describe("getThresholdHistory", () => {
    it("should return versions in reverse chronological order", async () => {
      // Create multiple versions
      await createScreeningThresholdVersion(
        { ...data1, effectiveFrom: new Date("2026-08-01") },
        adminId,
      );
      await createScreeningThresholdVersion(
        { ...data2, effectiveFrom: new Date("2026-09-01") },
        adminId,
      );
      await createScreeningThresholdVersion(
        { ...data3, effectiveFrom: new Date("2026-10-01") },
        adminId,
      );

      const history = await getThresholdHistory();

      expect(history).toHaveLength(3);
      expect(history[0].effectiveFrom).toEqual(new Date("2026-10-01"));
      expect(history[2].effectiveFrom).toEqual(new Date("2026-08-01"));
    });

    it("should limit results to specified count", async () => {
      // Create 10 versions
      for (let i = 0; i < 10; i++) {
        await createScreeningThresholdVersion(
          {
            ...baseData,
            effectiveFrom: new Date(`2026-${i + 1}-01`),
          },
          adminId,
        );
      }

      const history = await getThresholdHistory(5);
      expect(history).toHaveLength(5);
    });
  });
});
```

### 2. Backend Integration Tests - API Endpoints

#### File: `/backend/src/routes/__tests__/admin-screening-thresholds.integration.test.ts`

**Test Cases:**

```typescript
describe("POST /api/admin/screening-thresholds", () => {
  it("should create new threshold version", async () => {
    const response = await request(app)
      .post("/api/admin/screening-thresholds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        shortlistThreshold: 75,
        borderlineMin: 50,
        borderlineMax: 74,
        rejectThreshold: 49,
        effectiveFrom: new Date("2026-08-01").toISOString(),
      });

    expect(response.status).toBe(201);
    expect(response.body.version).toBeDefined();
    expect(response.body.shortlistThreshold).toBe(75);
  });

  it("should reject invalid threshold ranges with detailed errors", async () => {
    const response = await request(app)
      .post("/api/admin/screening-thresholds")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        shortlistThreshold: 60, // Invalid: less than borderlineMax
        borderlineMin: 50,
        borderlineMax: 70,
        rejectThreshold: 49,
        effectiveFrom: new Date().toISOString(),
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("VALIDATION_ERROR");
    expect(response.body.details).toContain(
      "Borderline max must be less than shortlist threshold",
    );
  });

  it("should require admin authentication", async () => {
    const response = await request(app)
      .post("/api/admin/screening-thresholds")
      .set("Authorization", `Bearer ${recruiterToken}`)
      .send(validThresholdData);

    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/screening-thresholds/history", () => {
  it("should return all versions ordered by effective date", async () => {
    // Create multiple versions
    await createMultipleVersions();

    const response = await request(app)
      .get("/api/admin/screening-thresholds/history")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.thresholds).toBeInstanceOf(Array);
    expect(
      response.body.thresholds[0].effectiveFrom >=
        response.body.thresholds[1].effectiveFrom,
    ).toBe(true);
  });

  it("should respect limit parameter", async () => {
    await createMultipleVersions();

    const response = await request(app)
      .get("/api/admin/screening-thresholds/history?limit=5")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.body.thresholds).toHaveLength(5);
  });
});
```

### 3. In-Flight Isolation Tests

#### File: `/backend/src/__tests__/services/inFlightIsolation.test.ts`

**Critical Test Cases:**

```typescript
describe("In-Flight Application Isolation", () => {
  it("should use threshold from submission date, not current date", async () => {
    // Create v1 effective Aug 1
    const v1 = await createScreeningThresholdVersion(
      {
        shortlistThreshold: 70,
        borderlineMin: 45,
        borderlineMax: 69,
        rejectThreshold: 44,
        effectiveFrom: new Date("2026-08-01"),
      },
      adminId,
    );

    // Submit application on Aug 15 (should use v1)
    const app1 = await createApplication({
      submittedAt: new Date("2026-08-15"),
    });

    // Create v2 effective Sep 1
    const v2 = await createScreeningThresholdVersion(
      {
        shortlistThreshold: 75,
        borderlineMin: 50,
        borderlineMax: 74,
        rejectThreshold: 49,
        effectiveFrom: new Date("2026-09-01"),
      },
      adminId,
    );

    // Submit application on Sep 15 (should use v2)
    const app2 = await createApplication({
      submittedAt: new Date("2026-09-15"),
    });

    // Screen both applications TODAY (Oct 1)
    // Each should use the threshold from their submission date
    await screenApplication(app1.id);
    await screenApplication(app2.id);

    const screening1 = await prisma.screening.findFirst({
      where: { applicationId: app1.id },
      include: { threshold: true },
    });
    const screening2 = await prisma.screening.findFirst({
      where: { applicationId: app2.id },
      include: { threshold: true },
    });

    expect(screening1.threshold.id).toBe(v1.id);
    expect(screening1.threshold.shortlistThreshold).toBe(70);

    expect(screening2.threshold.id).toBe(v2.id);
    expect(screening2.threshold.shortlistThreshold).toBe(75);
  });

  it("should not affect in-flight applications when policy changes", async () => {
    // Create application and screen it
    const app = await createApplication({
      submittedAt: new Date("2026-08-01"),
    });
    await screenApplication(app.id);

    const initialScreening = await prisma.screening.findFirst({
      where: { applicationId: app.id },
    });

    // Change threshold
    await createScreeningThresholdVersion(
      {
        shortlistThreshold: 90, // Much higher
        borderlineMin: 70,
        borderlineMax: 89,
        rejectThreshold: 69,
        effectiveFrom: new Date(),
      },
      adminId,
    );

    // Re-fetch application screening
    const currentScreening = await prisma.screening.findFirst({
      where: { applicationId: app.id },
    });

    // Should still use original threshold
    expect(currentScreening.thresholdId).toBe(initialScreening.thresholdId);
  });

  it("should use new approval policy only for decisions after effective date", async () => {
    // Create offer needing approval before policy change
    const offer1 = await createOffer({
      createdAt: new Date("2026-08-15"),
      compensationAmount: 100000,
    });

    // Change approval policy
    const newPolicy = await createApprovalPolicyVersion(
      {
        compensationBandMin: new Decimal(0),
        compensationBandMax: new Decimal(200000),
        requiredApprovers: [
          /* new approver chain */
        ],
        effectiveFrom: new Date("2026-09-01"),
      },
      adminId,
    );

    // Create offer needing approval after policy change
    const offer2 = await createOffer({
      createdAt: new Date("2026-09-15"),
      compensationAmount: 100000,
    });

    // Get approval workflows for both
    const workflow1 = await getApprovalWorkflow(offer1.id);
    const workflow2 = await getApprovalWorkflow(offer2.id);

    // Offer 1 should use old policy
    expect(workflow1.policyId).not.toBe(newPolicy.id);

    // Offer 2 should use new policy
    expect(workflow2.policyId).toBe(newPolicy.id);
  });
});
```

### 4. Frontend E2E Tests

#### File: `/frontend/tests/e2e/policy-management.spec.ts`

**Test Cases:**

```typescript
import { test, expect } from "@playwright/test";

test.describe("Policy Management", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('[name="email"]', "admin@example.com");
    await page.fill('[name="password"]', "adminPassword");
    await page.click('button[type="submit"]');
    await page.waitForURL("/admin");
  });

  test("should create new screening threshold with validation", async ({
    page,
  }) => {
    await page.goto("/admin/policies");
    await page.click('tab:has-text("Screening Thresholds")');

    // Fill form with invalid data
    await page.fill('[name="shortlistThreshold"]', "60");
    await page.fill('[name="borderlineMin"]', "50");
    await page.fill('[name="borderlineMax"]', "70"); // Invalid: > shortlist
    await page.fill('[name="rejectThreshold"]', "49");

    // Verify validation error shown
    await expect(page.locator(".error-message")).toContainText(
      "Borderline max must be less than shortlist threshold",
    );

    // Verify submit button disabled
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // Fix validation error
    await page.fill('[name="borderlineMax"]', "59");

    // Submit should now work
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
    await page.click('button[type="submit"]');

    // Verify success message
    await expect(page.locator(".toast-success")).toContainText(
      "Threshold version created",
    );
  });

  test("should display change history with version comparison", async ({
    page,
  }) => {
    await page.goto("/admin/policies");
    await page.click('tab:has-text("History")');

    // Verify history table visible
    await expect(page.locator("table")).toBeVisible();

    // Verify current version highlighted
    const currentRow = page.locator("tr.bg-green-50");
    await expect(currentRow).toContainText("Current");

    // Click compare button
    await page.click('button:has-text("Compare"):first');

    // Verify comparison modal appears
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('[role="dialog"]')).toContainText(
      "Compare Versions",
    );

    // Verify changes highlighted
    await expect(page.locator(".highlight")).toBeVisible();
  });

  test("should enforce future effective date", async ({ page }) => {
    await page.goto("/admin/policies");

    // Try to set past effective date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await page.fill(
      '[name="effectiveFrom"]',
      yesterday.toISOString().split("T")[0],
    );

    await expect(page.locator(".error-message")).toContainText(
      "Effective date cannot be in the past",
    );
  });

  test("should show visual range validator for screening thresholds", async ({
    page,
  }) => {
    await page.goto("/admin/policies");
    await page.click('tab:has-text("Screening Thresholds")');

    // Verify visualizer present
    await expect(
      page.locator('[data-testid="threshold-visualizer"]'),
    ).toBeVisible();

    // Change values and verify visualizer updates
    await page.fill('[name="shortlistThreshold"]', "80");

    // Verify green section width changed
    const greenSection = page.locator(".bg-green-200");
    const width = await greenSection.evaluate((el) => el.style.width);
    expect(width).toBe("20%"); // 100 - 80
  });
});

test.describe("In-Flight Application Isolation", () => {
  test("should not affect existing applications when threshold changes", async ({
    page,
  }) => {
    // Create and submit application
    await createTestApplication({ status: "screening" });

    // Change threshold
    await page.goto("/admin/policies");
    await createNewThresholdVersion({ shortlistThreshold: 90 });

    // Verify application still uses old threshold
    const screening = await getApplicationScreening(testApplicationId);
    expect(screening.threshold.shortlistThreshold).not.toBe(90);
  });
});
```

### 5. Performance Tests

#### File: `/backend/src/__tests__/performance/policyQueries.perf.test.ts`

**Test Cases:**

```typescript
describe("Policy Query Performance", () => {
  it("should query effective threshold efficiently", async () => {
    // Create 100 versions
    for (let i = 0; i < 100; i++) {
      await createScreeningThresholdVersion(
        {
          ...baseData,
          effectiveFrom: new Date(`2026-${(i % 12) + 1}-01`),
        },
        adminId,
      );
    }

    // Time query
    const start = performance.now();
    await getEffectiveThreshold(new Date());
    const duration = performance.now() - start;

    // Should be under 50ms with proper indexing
    expect(duration).toBeLessThan(50);
  });

  it("should handle large history queries efficiently", async () => {
    // Create 1000 versions
    for (let i = 0; i < 1000; i++) {
      await createScreeningThresholdVersion(
        {
          ...baseData,
          effectiveFrom: new Date(`2020-01-${(i % 30) + 1}`),
        },
        adminId,
      );
    }

    const start = performance.now();
    await getThresholdHistory(100);
    const duration = performance.now() - start;

    // Should be under 100ms
    expect(duration).toBeLessThan(100);
  });
});
```

## Acceptance Criteria

- [ ] All unit tests pass for policy versioning services
- [ ] All integration tests pass for API endpoints
- [ ] In-flight isolation tests verify applications use submission-date policies
- [ ] Validation tests cover all invalid input scenarios
- [ ] E2E tests cover complete policy management workflows
- [ ] History viewer tests verify correct display and comparison
- [ ] Performance tests confirm queries meet SLA (<100ms)
- [ ] Test coverage minimum 85% for policy-related code
- [ ] All critical paths tested (creation, validation, isolation)

## Testing Requirements Summary

- **Unit Tests:** 50+ test cases
- **Integration Tests:** 30+ test cases
- **E2E Tests:** 15+ test cases
- **Performance Tests:** 5+ test cases
- **Coverage Target:** 85%

## Files to Create

- `/backend/src/__tests__/services/thresholdService.test.ts`
- `/backend/src/__tests__/services/scoringThresholdService.test.ts`
- `/backend/src/__tests__/services/approvalPolicyService.test.ts`
- `/backend/src/__tests__/services/inFlightIsolation.test.ts`
- `/backend/src/routes/__tests__/admin-screening-thresholds.integration.test.ts`
- `/backend/src/routes/__tests__/admin-scoring-thresholds.integration.test.ts`
- `/backend/src/routes/__tests__/admin-approval-policies.integration.test.ts`
- `/backend/src/__tests__/performance/policyQueries.perf.test.ts`
- `/frontend/tests/e2e/policy-management.spec.ts`
- `/frontend/src/components/__tests__/ScreeningThresholdEditor.test.tsx`
- `/frontend/src/components/__tests__/PolicyHistoryViewer.test.tsx`
- `/frontend/src/utils/__tests__/policyValidation.test.ts`

## Test Data Management

Create test data factory:

```typescript
// Test data factory for consistent test data
export const policyTestData = {
  validScreeningThreshold: () => ({
    shortlistThreshold: 75,
    borderlineMin: 50,
    borderlineMax: 74,
    rejectThreshold: 49,
    effectiveFrom: new Date(),
  }),

  invalidScreeningThreshold: () => ({
    shortlistThreshold: 60,
    borderlineMin: 50,
    borderlineMax: 70, // Invalid
    rejectThreshold: 49,
    effectiveFrom: new Date(),
  }),
};
```

## Related User Story

**US-002 All Acceptance Criteria Verified:**

- ✅ Scenario 1: New policy version with future effective date
- ✅ Scenario 2: Policy editor shows change history
- ✅ Scenario 3: Invalid policy value rejected
- ✅ Scenario 4: Approval policy change applies to new decisions only

## Dependencies

- All previous tasks (TASK-001 through TASK-005)
- Test infrastructure (Vitest, Playwright)
- Test database

## Notes

- In-flight isolation tests are CRITICAL for compliance
- Performance tests ensure scalability
- E2E tests verify complete user workflows
- Test data should be realistic and cover edge cases
