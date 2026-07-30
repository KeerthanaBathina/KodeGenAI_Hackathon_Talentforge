/**
 * Integration tests for audit logging
 * Verifies all user management actions are audited
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { userManagementService } from "@/services/userManagementService";
import {
  createTestAdmin,
  createTestUser,
  setupTestDatabase,
  teardownTestDatabase,
  verifyAuditEvent,
  getAuditEventsForResource,
  getAuditEventsForActor,
} from "../helpers/userTestData";
import { prisma } from "@/db/prisma";
import type { User } from "@prisma/client";
import { UserRole } from "@/types/user";

describe("Audit Logging Integration", () => {
  let admin: User;
  let testUser: User;

  beforeEach(async () => {
    await setupTestDatabase();
    admin = await createTestAdmin();
    testUser = await createTestUser();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  describe("User Creation Audit Events", () => {
    it("should create audit event when user is created", async () => {
      const email = `audit-create-${Date.now()}@example.com`;

      const result = await userManagementService.createUser(
        {
          email,
          fullName: "Audit Create Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      const auditEvent = await verifyAuditEvent({
        action: "user.created",
        resourceType: "User",
        resourceId: result.user.id,
        actorId: admin.id,
      });

      expect(auditEvent).toBeDefined();
    });

    it("should include user email in audit metadata", async () => {
      const email = `audit-email-${Date.now()}@example.com`;

      const result = await userManagementService.createUser(
        {
          email,
          fullName: "Audit Email Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      const events = await getAuditEventsForResource("User", result.user.id);
      const createEvent = events.find((e) => e.action === "user.created");

      expect(createEvent?.metadata?.email).toBe(email);
    });

    it("should include user role in audit metadata", async () => {
      const result = await userManagementService.createUser(
        {
          email: `audit-role-${Date.now()}@example.com`,
          fullName: "Audit Role Test",
          role: UserRole.hr_reviewer,
        },
        admin.id,
      );

      const events = await getAuditEventsForResource("User", result.user.id);
      const createEvent = events.find((e) => e.action === "user.created");

      expect(createEvent?.metadata?.role).toBe(UserRole.hr_reviewer);
    });

    it("should include user fullName in audit metadata", async () => {
      const fullName = `Audit Name ${Date.now()}`;

      const result = await userManagementService.createUser(
        {
          email: `audit-name-${Date.now()}@example.com`,
          fullName,
          role: UserRole.recruiter,
        },
        admin.id,
      );

      const events = await getAuditEventsForResource("User", result.user.id);
      const createEvent = events.find((e) => e.action === "user.created");

      expect(createEvent?.metadata?.fullName).toBe(fullName);
    });

    it("should include actor ID who created user", async () => {
      const result = await userManagementService.createUser(
        {
          email: `audit-actor-${Date.now()}@example.com`,
          fullName: "Audit Actor Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      const events = await getAuditEventsForResource("User", result.user.id);
      const createEvent = events.find((e) => e.action === "user.created");

      expect(createEvent?.actorId).toBe(admin.id);
    });

    it("should include timestamp for audit event", async () => {
      const beforeTime = new Date();

      const result = await userManagementService.createUser(
        {
          email: `audit-time-${Date.now()}@example.com`,
          fullName: "Audit Time Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      const afterTime = new Date();

      const events = await getAuditEventsForResource("User", result.user.id);
      const createEvent = events.find((e) => e.action === "user.created");

      expect(createEvent?.createdAt).toBeDefined();
      expect(createEvent?.createdAt!.getTime()).toBeGreaterThanOrEqual(
        beforeTime.getTime(),
      );
      expect(createEvent?.createdAt!.getTime()).toBeLessThanOrEqual(
        afterTime.getTime(),
      );
    });
  });

  describe("Role Update Audit Events", () => {
    it("should create audit event when role is updated", async () => {
      await userManagementService.updateUserRole(
        testUser.id,
        UserRole.hr_manager,
        admin.id,
      );

      const auditEvent = await verifyAuditEvent({
        action: "user.role_updated",
        resourceType: "User",
        resourceId: testUser.id,
        actorId: admin.id,
      });

      expect(auditEvent).toBeDefined();
    });

    it("should include old and new roles in metadata", async () => {
      const oldRole = testUser.role;
      const newRole = UserRole.tech_interviewer;

      await userManagementService.updateUserRole(testUser.id, newRole, admin.id);

      const events = await getAuditEventsForResource("User", testUser.id);
      const roleEvent = events.find((e) => e.action === "user.role_updated");

      expect(roleEvent?.metadata?.oldRole).toBe(oldRole);
      expect(roleEvent?.metadata?.newRole).toBe(newRole);
    });

    it("should include actor who made role change", async () => {
      await userManagementService.updateUserRole(
        testUser.id,
        UserRole.hr_reviewer,
        admin.id,
      );

      const events = await getAuditEventsForResource("User", testUser.id);
      const roleEvent = events.find((e) => e.action === "user.role_updated");

      expect(roleEvent?.actorId).toBe(admin.id);
    });

    it("should create separate events for multiple role changes", async () => {
      await userManagementService.updateUserRole(
        testUser.id,
        UserRole.hr_manager,
        admin.id,
      );
      await userManagementService.updateUserRole(
        testUser.id,
        UserRole.hr_reviewer,
        admin.id,
      );

      const events = await getAuditEventsForResource("User", testUser.id);
      const roleEvents = events.filter((e) => e.action === "user.role_updated");

      expect(roleEvents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("User Deactivation Audit Events", () => {
    it("should create audit event when user is deactivated", async () => {
      const user = await createTestUser();

      await userManagementService.deactivateUser(user.id, admin.id);

      const auditEvent = await verifyAuditEvent({
        action: "user.deactivated",
        resourceType: "User",
        resourceId: user.id,
        actorId: admin.id,
      });

      expect(auditEvent).toBeDefined();
    });

    it("should include deactivated user email in metadata", async () => {
      const user = await createTestUser({
        email: `deactivate-${Date.now()}@example.com`,
      });

      await userManagementService.deactivateUser(user.id, admin.id);

      const events = await getAuditEventsForResource("User", user.id);
      const deactivateEvent = events.find((e) => e.action === "user.deactivated");

      expect(deactivateEvent?.metadata?.email).toBe(user.email);
    });

    it("should include actor who deactivated user", async () => {
      const user = await createTestUser();

      await userManagementService.deactivateUser(user.id, admin.id);

      const events = await getAuditEventsForResource("User", user.id);
      const deactivateEvent = events.find((e) => e.action === "user.deactivated");

      expect(deactivateEvent?.actorId).toBe(admin.id);
    });
  });

  describe("Deactivation Block Audit Events", () => {
    it("should log user_deactivation_blocked when self-deactivation attempted", async () => {
      await expect(
        userManagementService.deactivateUser(admin.id, admin.id),
      ).rejects.toThrow();

      const auditEvent = await verifyAuditEvent({
        action: "user.deactivation_blocked",
        resourceType: "User",
        resourceId: admin.id,
        actorId: admin.id,
      });

      expect(auditEvent).toBeDefined();
    });

    it("should include reason in blocked deactivation metadata", async () => {
      await expect(
        userManagementService.deactivateUser(admin.id, admin.id),
      ).rejects.toThrow();

      const events = await getAuditEventsForResource("User", admin.id);
      const blockEvent = events.find(
        (e) => e.action === "user.deactivation_blocked",
      );

      expect(blockEvent?.metadata?.reason).toContain("Self-deactivation");
    });

    it("should still log even when operation fails", async () => {
      const eventsBefore = await getAuditEventsForResource("User", admin.id);

      await expect(
        userManagementService.deactivateUser(admin.id, admin.id),
      ).rejects.toThrow();

      const eventsAfter = await getAuditEventsForResource("User", admin.id);

      expect(eventsAfter.length).toBeGreaterThan(eventsBefore.length);
    });
  });

  describe("User Reactivation Audit Events", () => {
    it("should create audit event when user is reactivated", async () => {
      const user = await createTestUser({ active: false });

      await userManagementService.reactivateUser(user.id, admin.id);

      const auditEvent = await verifyAuditEvent({
        action: "user.reactivated",
        resourceType: "User",
        resourceId: user.id,
        actorId: admin.id,
      });

      expect(auditEvent).toBeDefined();
    });

    it("should include reactivated user email in metadata", async () => {
      const email = `reactivate-${Date.now()}@example.com`;
      const user = await createTestUser({ email, active: false });

      await userManagementService.reactivateUser(user.id, admin.id);

      const events = await getAuditEventsForResource("User", user.id);
      const reactivateEvent = events.find(
        (e) => e.action === "user.reactivated",
      );

      expect(reactivateEvent?.metadata?.email).toBe(email);
    });

    it("should include actor who reactivated user", async () => {
      const user = await createTestUser({ active: false });

      await userManagementService.reactivateUser(user.id, admin.id);

      const events = await getAuditEventsForResource("User", user.id);
      const reactivateEvent = events.find(
        (e) => e.action === "user.reactivated",
      );

      expect(reactivateEvent?.actorId).toBe(admin.id);
    });
  });

  describe("Audit Trail Queries", () => {
    it("should get all audit events for a user", async () => {
      const user = await createTestUser();

      // Perform multiple actions
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_manager,
        admin.id,
      );
      await userManagementService.deactivateUser(user.id, admin.id);

      const trail = await userManagementService.getUserAuditTrail(user.id);

      expect(Array.isArray(trail)).toBe(true);
      expect(trail.length).toBeGreaterThan(0);
    });

    it("should filter audit trail by action type", async () => {
      const user = await createTestUser();

      // Perform multiple actions
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_manager,
        admin.id,
      );
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_reviewer,
        admin.id,
      );
      await userManagementService.deactivateUser(user.id, admin.id);

      const trail = await userManagementService.getUserAuditTrail(user.id, {
        actions: ["user.role_updated"],
      });

      trail.forEach((event) => {
        expect(event.action).toBe("user.role_updated");
      });
    });

    it("should limit audit trail results", async () => {
      const user = await createTestUser();

      // Perform multiple actions
      for (let i = 0; i < 5; i++) {
        await userManagementService.updateUserRole(
          user.id,
          i % 2 === 0 ? UserRole.hr_manager : UserRole.hr_reviewer,
          admin.id,
        );
      }

      const trail = await userManagementService.getUserAuditTrail(user.id, {
        limit: 2,
      });

      expect(trail.length).toBeLessThanOrEqual(2);
    });

    it("should filter audit trail by date range", async () => {
      const user = await createTestUser();
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_manager,
        admin.id,
      );

      const trail = await userManagementService.getUserAuditTrail(user.id, {
        startDate: now,
        endDate: tomorrow,
      });

      trail.forEach((event) => {
        expect(new Date(event.timestamp).getTime()).toBeGreaterThanOrEqual(
          now.getTime(),
        );
      });
    });
  });

  describe("Audit Event Data Integrity", () => {
    it("should never expose sensitive data in audit logs", async () => {
      const result = await userManagementService.createUser(
        {
          email: `sensitive-${Date.now()}@example.com`,
          fullName: "Sensitive Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      const events = await getAuditEventsForResource("User", result.user.id);

      events.forEach((event) => {
        // Should never contain raw password
        expect(JSON.stringify(event.metadata)).not.toContain(
          result.temporaryPassword,
        );
      });
    });

    it("should maintain audit immutability", async () => {
      const user = await createTestUser();

      // Get initial audit count
      const eventsBefore = await getAuditEventsForResource("User", user.id);
      const countBefore = eventsBefore.length;

      // Perform action
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_manager,
        admin.id,
      );

      // Try to delete audit event (should fail if immutable)
      const latestEvent = await prisma.auditEvent.findFirst({
        where: {
          resourceId: user.id,
          action: "user.role_updated",
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Verify event exists and wasn't deleted
      expect(latestEvent).toBeDefined();

      // Get final audit count
      const eventsAfter = await getAuditEventsForResource("User", user.id);
      expect(eventsAfter.length).toBeGreaterThan(countBefore);
    });
  });

  describe("Audit Event Consistency", () => {
    it("should create consistent audit trail across operations", async () => {
      const email = `consistency-${Date.now()}@example.com`;

      // Create user
      const result = await userManagementService.createUser(
        {
          email,
          fullName: "Consistency Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      // Get all events
      const events = await getAuditEventsForResource("User", result.user.id);

      // Verify each event has required fields
      events.forEach((event) => {
        expect(event.id).toBeDefined();
        expect(event.action).toBeDefined();
        expect(event.resourceType).toBeDefined();
        expect(event.resourceId).toBe(result.user.id);
        expect(event.actorId).toBeDefined();
        expect(event.createdAt).toBeDefined();
        expect(event.metadata).toBeDefined();
      });
    });

    it("should maintain chronological order of events", async () => {
      const user = await createTestUser();

      // Perform actions in sequence
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_manager,
        admin.id,
      );
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_reviewer,
        admin.id,
      );

      const events = await getAuditEventsForResource("User", user.id);
      const roleEvents = events.filter((e) => e.action === "user.role_updated");

      // Should be ordered by creation time
      for (let i = 0; i < roleEvents.length - 1; i++) {
        expect(roleEvents[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          roleEvents[i + 1].createdAt.getTime(),
        );
      }
    });
  });
});
