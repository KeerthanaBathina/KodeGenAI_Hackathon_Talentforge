---
id: TASK-004
user_story: US-003
title: "Testing - Comprehensive Health Dashboard Tests"
status: todo
priority: high
assigned_to: qa-team
estimated_hours: 6
layer: testing
dependencies: [TASK-001, TASK-002, TASK-003]
---

# TASK-004 — Testing - Comprehensive Health Dashboard Tests

## Objective

Implement comprehensive test coverage for health dashboard functionality including unit tests, integration tests, and E2E tests focusing on data accuracy, auto-refresh, and real-time monitoring.

## Scope

Create tests for health metrics service, API endpoints, frontend components, and end-to-end user workflows with emphasis on operational accuracy and refresh behavior.

## Testing Requirements

### 1. Backend Unit Tests - Health Metrics Service

#### File: `/backend/src/__tests__/services/healthMetricsService.test.ts`

```typescript
import {
  getHealthDashboardData,
  getAllQueueMetrics,
  getAllWorkerHealth,
  getEmailDeliveryMetrics,
} from "../../services/healthMetricsService";
import { redis } from "../../db/redis";
import { prisma } from "../../db/prisma";

// Mock dependencies
vi.mock("../../db/redis");
vi.mock("../../db/prisma");
vi.mock("../../queues/screeningQueue");
vi.mock("../../queues/emailDeliveryQueue");

describe("HealthMetricsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAllQueueMetrics", () => {
    it("should collect metrics from all BullMQ queues", async () => {
      // Mock queue methods
      const mockQueue = {
        name: "screening",
        getActiveCount: vi.fn().resolves(5),
        getWaitingCount: vi.fn().resolves(10),
        getFailedCount: vi.fn().resolves(2),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi
          .fn()
          .resolves([
            { finishedOn: Date.now() - 30 * 60 * 1000 },
            { finishedOn: Date.now() - 45 * 60 * 1000 },
          ]),
      };

      const metrics = await getQueueMetrics(mockQueue);

      expect(metrics).toEqual({
        queueName: "screening",
        active: 5,
        waiting: 10,
        failed: 2,
        delayed: 0,
        completed: 2,
      });
    });

    it("should handle queue with no jobs", async () => {
      const mockQueue = {
        name: "email-delivery",
        getActiveCount: vi.fn().resolves(0),
        getWaitingCount: vi.fn().resolves(0),
        getFailedCount: vi.fn().resolves(0),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi.fn().resolves([]),
      };

      const metrics = await getQueueMetrics(mockQueue);

      expect(metrics.active).toBe(0);
      expect(metrics.completed).toBe(0);
    });

    it("should only count completed jobs from last 60 minutes", async () => {
      const now = Date.now();
      const mockQueue = {
        name: "screening",
        getActiveCount: vi.fn().resolves(0),
        getWaitingCount: vi.fn().resolves(0),
        getFailedCount: vi.fn().resolves(0),
        getDelayedCount: vi.fn().resolves(0),
        getCompleted: vi.fn().resolves([
          { finishedOn: now - 30 * 60 * 1000 }, // 30 min ago - include
          { finishedOn: now - 45 * 60 * 1000 }, // 45 min ago - include
          { finishedOn: now - 90 * 60 * 1000 }, // 90 min ago - exclude
          { finishedOn: now - 120 * 60 * 1000 }, // 2 hours ago - exclude
        ]),
      };

      const metrics = await getQueueMetrics(mockQueue);
      expect(metrics.completed).toBe(2); // Only last 60 minutes
    });
  });

  describe("getAllWorkerHealth", () => {
    it("should return online status for recent heartbeat", async () => {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(oneMinuteAgo.toString());

      const status = await getWorkerHealth(
        "worker:screening:heartbeat",
        "AI Screening Worker",
      );

      expect(status).toEqual({
        workerName: "AI Screening Worker",
        status: "online",
        lastHeartbeat: new Date(oneMinuteAgo),
        minutesSinceHeartbeat: 1,
      });
    });

    it("should return degraded status for heartbeat > 2 min old", async () => {
      const now = Date.now();
      const threeMinutesAgo = now - 3 * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(threeMinutesAgo.toString());

      const status = await getWorkerHealth(
        "worker:screening:heartbeat",
        "AI Screening Worker",
      );

      expect(status.status).toBe("degraded");
      expect(status.minutesSinceHeartbeat).toBe(3);
    });

    it("should return offline status for heartbeat > 5 min old", async () => {
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(tenMinutesAgo.toString());

      const status = await getWorkerHealth(
        "worker:screening:heartbeat",
        "AI Screening Worker",
      );

      expect(status.status).toBe("offline");
      expect(status.minutesSinceHeartbeat).toBe(10);
    });

    it("should return offline status when no heartbeat found", async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const status = await getWorkerHealth(
        "worker:screening:heartbeat",
        "AI Screening Worker",
      );

      expect(status).toEqual({
        workerName: "AI Screening Worker",
        status: "offline",
        lastHeartbeat: null,
        minutesSinceHeartbeat: null,
      });
    });

    it("should handle exact 2-minute threshold correctly", async () => {
      const now = Date.now();
      const exactlyTwoMinutes = now - 2 * 60 * 1000;

      vi.mocked(redis.get).mockResolvedValue(exactlyTwoMinutes.toString());

      const status = await getWorkerHealth(
        "worker:screening:heartbeat",
        "AI Screening Worker",
      );

      // Exactly 2 minutes should be degraded (not online)
      expect(status.status).toBe("degraded");
    });
  });

  describe("getEmailDeliveryMetrics", () => {
    it("should calculate email delivery success rate correctly", async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(95) // successful
        .mockResolvedValueOnce(5) // failed
        .mockResolvedValueOnce(100); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.totalAttempted).toBe(100);
      expect(metrics.successful).toBe(95);
      expect(metrics.failed).toBe(5);
      expect(metrics.successRate).toBe(95); // Rounded percentage
    });

    it("should return 100% success rate when no emails attempted", async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(0) // successful
        .mockResolvedValueOnce(0) // failed
        .mockResolvedValueOnce(0); // total

      vi.mocked(prisma.communication.findMany).mockResolvedValue([]);

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.successRate).toBe(100);
    });

    it("should include failed email details", async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(97)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(100);

      const mockFailedEmails = [
        {
          id: "email-1",
          status: "failed",
          createdAt: new Date(),
          application: {
            user: { email: "user1@example.com" },
          },
          template: { type: "offer_approval" },
        },
        {
          id: "email-2",
          status: "failed",
          createdAt: new Date(),
          application: {
            user: { email: "user2@example.com" },
          },
          template: { type: "interview_confirmation" },
        },
      ];

      vi.mocked(prisma.communication.findMany).mockResolvedValue(
        mockFailedEmails as any,
      );

      const metrics = await getEmailDeliveryMetrics();

      expect(metrics.failedEmails).toHaveLength(2);
      expect(metrics.failedEmails[0].to).toBe("user1@example.com");
      expect(metrics.failedEmails[0].templateType).toBe("offer_approval");
    });

    it("should limit failed emails to 100 most recent", async () => {
      vi.mocked(prisma.communication.count)
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(150) // 150 failed
        .mockResolvedValueOnce(1050);

      const mockFailedEmails = Array(150)
        .fill(null)
        .map((_, i) => ({
          id: `email-${i}`,
          status: "failed",
          createdAt: new Date(),
          application: { user: { email: `user${i}@example.com` } },
          template: { type: "test" },
        }));

      vi.mocked(prisma.communication.findMany).mockResolvedValue(
        mockFailedEmails as any,
      );

      const metrics = await getEmailDeliveryMetrics();

      // Verify query was called with take: 100 limit
      expect(prisma.communication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe("getHealthDashboardData", () => {
    it("should aggregate all health metrics", async () => {
      // Mock all sub-functions
      const mockQueues = [
        {
          queueName: "screening",
          active: 5,
          waiting: 10,
          failed: 0,
          delayed: 0,
          completed: 100,
        },
      ];
      const mockWorkers = [
        {
          workerName: "AI Worker",
          status: "online",
          lastHeartbeat: new Date(),
          minutesSinceHeartbeat: 1,
        },
      ];
      const mockEmailMetrics = {
        totalAttempted: 100,
        successful: 98,
        failed: 2,
        successRate: 98,
        failedEmails: [],
      };

      vi.mocked(getAllQueueMetrics).mockResolvedValue(mockQueues as any);
      vi.mocked(getAllWorkerHealth).mockResolvedValue(mockWorkers as any);
      vi.mocked(getEmailDeliveryMetrics).mockResolvedValue(
        mockEmailMetrics as any,
      );

      const data = await getHealthDashboardData();

      expect(data.queues).toEqual(mockQueues);
      expect(data.workers).toEqual(mockWorkers);
      expect(data.emailDelivery).toEqual(mockEmailMetrics);
      expect(data.timestamp).toBeInstanceOf(Date);
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(getAllQueueMetrics).mockRejectedValue(
        new Error("Redis connection failed"),
      );

      const data = await getHealthDashboardData();

      expect(data.queues).toEqual([]);
      expect(data.workers).toEqual([]);
      expect(data.error).toBeDefined();
    });

    it("should complete data collection within 200ms", async () => {
      const startTime = Date.now();
      await getHealthDashboardData();
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    });
  });
});
```

### 2. Backend Integration Tests - API Endpoints

#### File: `/backend/src/routes/__tests__/admin-health.integration.test.ts`

```typescript
import request from "supertest";
import { app } from "../../app";
import { generateToken } from "../../utils/auth";

describe("Health Dashboard API", () => {
  let adminToken: string;
  let recruiterToken: string;

  beforeAll(async () => {
    adminToken = generateToken({ id: "admin-1", role: "admin" });
    recruiterToken = generateToken({ id: "recruiter-1", role: "recruiter" });
  });

  describe("GET /api/admin/health", () => {
    it("should return health metrics for admin users", async () => {
      const response = await request(app)
        .get("/api/admin/health")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("queues");
      expect(response.body).toHaveProperty("workers");
      expect(response.body).toHaveProperty("emailDelivery");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("meta");

      // Verify data structure
      expect(Array.isArray(response.body.queues)).toBe(true);
      expect(Array.isArray(response.body.workers)).toBe(true);
      expect(response.body.emailDelivery).toHaveProperty("successRate");
    });

    it("should reject non-admin users with 403", async () => {
      const response = await request(app)
        .get("/api/admin/health")
        .set("Authorization", `Bearer ${recruiterToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
    });

    it("should reject unauthenticated requests with 401", async () => {
      const response = await request(app).get("/api/admin/health");

      expect(response.status).toBe(401);
    });

    it("should include performance metadata", async () => {
      const response = await request(app)
        .get("/api/admin/health")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.body.meta.collectionTimeMs).toBeDefined();
      expect(typeof response.body.meta.collectionTimeMs).toBe("number");
    });

    it("should complete request within 500ms", async () => {
      const startTime = Date.now();

      await request(app)
        .get("/api/admin/health")
        .set("Authorization", `Bearer ${adminToken}`);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
    });
  });

  describe("GET /api/admin/health/queue/:queueName", () => {
    it("should return detailed queue metrics", async () => {
      const response = await request(app)
        .get("/api/admin/health/queue/screening")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.queueName).toBe("screening");
      expect(response.body.jobs).toHaveProperty("active");
      expect(response.body.jobs).toHaveProperty("waiting");
      expect(response.body.jobs).toHaveProperty("failed");
      expect(response.body.jobs).toHaveProperty("delayed");
    });

    it("should return 404 for unknown queue", async () => {
      const response = await request(app)
        .get("/api/admin/health/queue/nonexistent")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe("Queue not found");
      expect(response.body.availableQueues).toBeDefined();
    });
  });

  describe("GET /api/admin/health/email/failed", () => {
    it("should return paginated failed emails", async () => {
      const response = await request(app)
        .get("/api/admin/health/email/failed?limit=10&offset=0")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.failedEmails).toBeInstanceOf(Array);
      expect(response.body.pagination).toHaveProperty("total");
      expect(response.body.pagination).toHaveProperty("limit");
      expect(response.body.pagination).toHaveProperty("offset");
      expect(response.body.pagination).toHaveProperty("hasMore");
    });

    it("should enforce max limit of 100", async () => {
      const response = await request(app)
        .get("/api/admin/health/email/failed?limit=200")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.body.pagination.limit).toBe(100);
    });

    it("should use default limit of 50", async () => {
      const response = await request(app)
        .get("/api/admin/health/email/failed")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.body.pagination.limit).toBe(50);
    });

    it("should support offset pagination", async () => {
      const page1 = await request(app)
        .get("/api/admin/health/email/failed?limit=5&offset=0")
        .set("Authorization", `Bearer ${adminToken}`);

      const page2 = await request(app)
        .get("/api/admin/health/email/failed?limit=5&offset=5")
        .set("Authorization", `Bearer ${adminToken}`);

      // If there are enough failed emails, they should be different
      if (page1.body.pagination.total > 5) {
        expect(page1.body.failedEmails[0].id).not.toBe(
          page2.body.failedEmails[0].id,
        );
      }
    });
  });
});
```

### 3. Frontend E2E Tests - Auto-Refresh Behavior

#### File: `/frontend/tests/e2e/health-dashboard-refresh.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Health Dashboard Auto-Refresh", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('[name="email"]', "admin@example.com");
    await page.fill('[name="password"]', "adminPassword");
    await page.click('button[type="submit"]');
    await page.waitForURL("/admin");
  });

  test("should auto-refresh every 60 seconds", async ({ page }) => {
    await page.goto("/admin/health");

    // Wait for initial load
    await page.waitForSelector('h1:has-text("Platform Health Dashboard")');

    // Get initial timestamp
    const initialTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    // Wait for auto-refresh (60 seconds + 2 second buffer)
    await page.waitForTimeout(62000);

    // Get new timestamp
    const newTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    // Verify timestamp changed
    expect(newTimestamp).not.toBe(initialTimestamp);

    // Verify no full page reload occurred (check URL didn't change)
    expect(page.url()).toContain("/admin/health");
  });

  test("should not refresh when auto-refresh toggled off", async ({ page }) => {
    await page.goto("/admin/health");

    // Toggle auto-refresh off
    await page.click('input[type="checkbox"]');

    const initialTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    // Wait 65 seconds
    await page.waitForTimeout(65000);

    const newTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    // Timestamp should NOT have changed
    expect(newTimestamp).toBe(initialTimestamp);
  });

  test("should refresh immediately on manual button click", async ({
    page,
  }) => {
    await page.goto("/admin/health");

    const initialTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    // Click refresh button
    await page.click('button:has-text("Refresh Now")');

    // Wait for network request to complete
    await page.waitForTimeout(1000);

    const newTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    expect(newTimestamp).not.toBe(initialTimestamp);
  });

  test("should maintain auto-refresh across multiple cycles", async ({
    page,
  }) => {
    await page.goto("/admin/health");

    let previousTimestamp = await page
      .locator("text=/Last updated:/")
      .textContent();

    // Verify 2 refresh cycles
    for (let i = 0; i < 2; i++) {
      await page.waitForTimeout(62000);

      const currentTimestamp = await page
        .locator("text=/Last updated:/")
        .textContent();
      expect(currentTimestamp).not.toBe(previousTimestamp);

      previousTimestamp = currentTimestamp;
    }
  });
});

test.describe("Health Dashboard Data Accuracy", () => {
  test("should display correct worker status colors", async ({ page }) => {
    await page.goto("/admin/health");

    // Find worker cards
    const workerCards = page.locator('[data-testid="worker-card"]');

    // Verify at least one worker shown
    await expect(workerCards.first()).toBeVisible();

    // Check for status badge
    const statusBadge = workerCards
      .first()
      .locator(
        'span:has-text("ONLINE"), span:has-text("DEGRADED"), span:has-text("OFFLINE")',
      );
    await expect(statusBadge).toBeVisible();
  });

  test("should display failed jobs count with visual indicator", async ({
    page,
  }) => {
    await page.goto("/admin/health");

    // Find queue table
    const queueTable = page.locator("table").first();
    await expect(queueTable).toBeVisible();

    // Check if any queues have failed jobs (look for red badges)
    const failedBadges = page.locator("span.bg-red-100");

    // If failed badges exist, verify they contain numbers
    const count = await failedBadges.count();
    if (count > 0) {
      const text = await failedBadges.first().textContent();
      expect(text).toMatch(/\d+/);
    }
  });
});
```

## Acceptance Criteria

- [ ] All backend unit tests pass for health metrics service
- [ ] Integration tests verify API endpoint authentication and authorization
- [ ] Integration tests verify correct data structure in API responses
- [ ] E2E tests verify auto-refresh occurs every 60 seconds
- [ ] E2E tests verify manual refresh updates data immediately
- [ ] E2E tests verify auto-refresh can be disabled
- [ ] E2E tests verify no full page reload during refresh
- [ ] Performance tests confirm health check completes within 200ms
- [ ] Performance tests confirm API response time < 500ms
- [ ] Worker status logic tests verify correct online/degraded/offline thresholds
- [ ] Email delivery rate calculation tests verify correct percentage
- [ ] Test coverage minimum 85% for health-related code

## Testing Requirements Summary

- **Backend Unit Tests:** 30+ test cases
- **Integration Tests:** 15+ test cases
- **E2E Tests:** 10+ test cases
- **Performance Tests:** 5+ test cases
- **Coverage Target:** 85%

## Files to Create

- `/backend/src/__tests__/services/healthMetricsService.test.ts`
- `/backend/src/routes/__tests__/admin-health.integration.test.ts`
- `/frontend/tests/e2e/health-dashboard.spec.ts`
- `/frontend/tests/e2e/health-dashboard-refresh.spec.ts`
- `/frontend/src/components/admin/__tests__/WorkerHealthSection.test.tsx`
- `/frontend/src/components/admin/__tests__/QueueMetricsSection.test.tsx`
- `/frontend/src/components/admin/__tests__/EmailDeliverySection.test.tsx`

## Dependencies

- All previous tasks (TASK-001, TASK-002, TASK-003)
- Test infrastructure (Vitest, Playwright)
- Test database with Communication records
- Mock BullMQ queues
- Mock Redis for heartbeat testing

## Related User Story

**US-003 All Acceptance Criteria Tested:**

- ✅ Scenario 1: Queue depths accuracy verified
- ✅ Scenario 2: Worker heartbeat status logic verified (amber at > 2 min)
- ✅ Scenario 3: Email delivery rate calculation verified
- ✅ Scenario 4: Auto-refresh behavior verified (60s without page reload)

## Notes

- Auto-refresh tests require longer timeouts (60+ seconds)
- Mock time functions where possible to speed up tests
- Worker status threshold tests are CRITICAL for operational accuracy
- Performance tests ensure dashboard doesn't impact system performance
- Failed email detail tests verify DLQ functionality
- Test both happy path and error scenarios
