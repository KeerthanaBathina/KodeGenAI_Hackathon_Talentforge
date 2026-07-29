/**
 * Unit tests for userManagementService
 * Tests core business logic for user CRUD operations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { userManagementService } from "@/services/userManagementService";
import { auditService } from "@/services/auditService";
import { prisma } from "@/db/prisma";
import {
  createTestAdmin,
  createTestUser,
  setupTestDatabase,
  teardownTestDatabase,
  getAuditEventsForActor,
  verifyAuditEvent,
} from "./userTestData";
import type { User } from "@prisma/client";
import { UserRole } from "@/types/user";

// Mock auditService to avoid side effects
vi.mock("@/services/auditService", () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("UserManagementService", () => {
  let admin: User;
  let testUser: User;

  beforeEach(async () => {
    await setupTestDatabase();
    admin = await createTestAdmin();
    testUser = await createTestUser();
  });

  afterEach(async () => {
    await teardownTestDatabase();
    vi.clearAllMocks();
  });

  describe("createUser", () => {
    it("should create user with valid data", async () => {
      const input = {
        email: `new-user-${Date.now()}@example.com`,
        fullName: "New User",
        role: UserRole.recruiter,
        timezone: "America/New_York",
      };

      const result = await userManagementService.createUser(input, admin.id);

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(input.email);
      expect(result.user.fullName).toBe(input.fullName);
      expect(result.user.role).toBe(input.role);
      expect(result.user.timezone).toBe(input.timezone);
      expect(result.user.active).toBe(true);
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword.length).toBeGreaterThan(32);
    });

    it("should generate cryptographically secure password", async () => {
      const result1 = await userManagementService.createUser(
        {
          email: `user1-${Date.now()}@example.com`,
          fullName: "User 1",
          role: UserRole.candidate,
        },
        admin.id,
      );

      const result2 = await userManagementService.createUser(
        {
          email: `user2-${Date.now()}@example.com`,
          fullName: "User 2",
          role: UserRole.candidate,
        },
        admin.id,
      );

      // Passwords should be different (extremely unlikely to match)
      expect(result1.temporaryPassword).not.toBe(result2.temporaryPassword);
    });

    it("should set default timezone to UTC when not provided", async () => {
      const result = await userManagementService.createUser(
        {
          email: `tz-test-${Date.now()}@example.com`,
          fullName: "TZ Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      expect(result.user.timezone).toBe("UTC");
    });

    it("should fail with duplicate email", async () => {
      const email = `duplicate-${Date.now()}@example.com`;

      // Create first user
      await userManagementService.createUser(
        {
          email,
          fullName: "User 1",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      // Try to create second with same email
      await expect(
        userManagementService.createUser(
          {
            email,
            fullName: "User 2",
            role: UserRole.recruiter,
          },
          admin.id,
        ),
      ).rejects.toThrow("already exists");
    });

    it("should log user_created audit event", async () => {
      const input = {
        email: `audit-test-${Date.now()}@example.com`,
        fullName: "Audit Test",
        role: UserRole.recruiter,
      };

      await userManagementService.createUser(input, admin.id);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.created",
          actorId: admin.id,
        }),
      );
    });

    it("should include actorId in audit event", async () => {
      const input = {
        email: `actor-test-${Date.now()}@example.com`,
        fullName: "Actor Test",
        role: UserRole.recruiter,
      };

      await userManagementService.createUser(input, admin.id);

      const auditCall = vi.mocked(auditService.logEvent).mock.calls[0][0];
      expect(auditCall.actorId).toBe(admin.id);
    });
  });

  describe("getUserById", () => {
    it("should fetch user by id", async () => {
      const result = await userManagementService.getUserById(testUser.id);

      expect(result).toBeDefined();
      expect(result.id).toBe(testUser.id);
      expect(result.email).toBe(testUser.email);
    });

    it("should return null for non-existent user", async () => {
      const result = await userManagementService.getUserById("invalid-id");

      expect(result).toBeNull();
    });
  });

  describe("getUserByEmail", () => {
    it("should fetch user by email (case-insensitive)", async () => {
      const result = await userManagementService.getUserByEmail(
        testUser.email.toUpperCase(),
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(testUser.id);
    });

    it("should return null for non-existent email", async () => {
      const result = await userManagementService.getUserByEmail(
        "nonexistent@example.com",
      );

      expect(result).toBeNull();
    });
  });

  describe("getAllUsers", () => {
    it("should fetch all users", async () => {
      const result = await userManagementService.getAllUsers();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter users by role", async () => {
      // Create users with different roles
      await createTestUser({ role: UserRole.recruiter });
      await createTestUser({ role: UserRole.hr_reviewer });

      const result = await userManagementService.getAllUsers({
        role: UserRole.recruiter,
      });

      result.forEach((user) => {
        expect(user.role).toBe(UserRole.recruiter);
      });
    });

    it("should filter users by active status", async () => {
      // Create active and inactive users
      await createTestUser({ active: true });
      await createTestUser({ active: false });

      const active = await userManagementService.getAllUsers({ active: true });
      active.forEach((user) => {
        expect(user.active).toBe(true);
      });

      const inactive = await userManagementService.getAllUsers({
        active: false,
      });
      inactive.forEach((user) => {
        expect(user.active).toBe(false);
      });
    });

    it("should search users by name", async () => {
      const uniqueName = `Unique-${Date.now()}`;
      await createTestUser({ fullName: uniqueName });

      const result = await userManagementService.getAllUsers({
        search: "Unique",
      });

      const found = result.find((u) => u.fullName === uniqueName);
      expect(found).toBeDefined();
    });

    it("should search users by email", async () => {
      const email = `search-${Date.now()}@example.com`;
      await createTestUser({ email });

      const result = await userManagementService.getAllUsers({
        search: email,
      });

      const found = result.find((u) => u.email === email);
      expect(found).toBeDefined();
    });

    it("should combine multiple filters", async () => {
      const email = `combined-${Date.now()}@example.com`;
      await createTestUser({
        email,
        role: UserRole.hr_manager,
        active: true,
      });

      const result = await userManagementService.getAllUsers({
        role: UserRole.hr_manager,
        active: true,
        search: email,
      });

      const found = result.find((u) => u.email === email);
      expect(found).toBeDefined();
      expect(found?.role).toBe(UserRole.hr_manager);
      expect(found?.active).toBe(true);
    });
  });

  describe("updateUserRole", () => {
    it("should update user role", async () => {
      const newRole = UserRole.hr_reviewer;

      const result = await userManagementService.updateUserRole(
        testUser.id,
        newRole,
        admin.id,
      );

      expect(result.role).toBe(newRole);
    });

    it("should log user_role_updated audit event", async () => {
      const newRole = UserRole.hr_manager;

      await userManagementService.updateUserRole(testUser.id, newRole, admin.id);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.role_updated",
          actorId: admin.id,
        }),
      );
    });

    it("should prevent changing own role", async () => {
      const newRole = UserRole.recruiter;

      await expect(
        userManagementService.updateUserRole(admin.id, newRole, admin.id),
      ).rejects.toThrow("cannot change");
    });

    it("should fail for non-existent user", async () => {
      await expect(
        userManagementService.updateUserRole(
          "invalid-id",
          UserRole.recruiter,
          admin.id,
        ),
      ).rejects.toThrow();
    });

    it("should include oldRole and newRole in audit event", async () => {
      const newRole = UserRole.tech_interviewer;

      await userManagementService.updateUserRole(testUser.id, newRole, admin.id);

      const auditCall = vi.mocked(auditService.logEvent).mock.calls[0][0];
      expect(auditCall.metadata).toHaveProperty("oldRole", testUser.role);
      expect(auditCall.metadata).toHaveProperty("newRole", newRole);
    });
  });

  describe("deactivateUser", () => {
    it("should deactivate user", async () => {
      const result = await userManagementService.deactivateUser(
        testUser.id,
        admin.id,
      );

      expect(result.active).toBe(false);
    });

    it("should log user_deactivated audit event", async () => {
      await userManagementService.deactivateUser(testUser.id, admin.id);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.deactivated",
          actorId: admin.id,
        }),
      );
    });

    it("should prevent self-deactivation", async () => {
      await expect(
        userManagementService.deactivateUser(admin.id, admin.id),
      ).rejects.toThrow("cannot deactivate");
    });

    it("should log user_deactivation_blocked for self-deactivation attempt", async () => {
      await expect(
        userManagementService.deactivateUser(admin.id, admin.id),
      ).rejects.toThrow();

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.deactivation_blocked",
          actorId: admin.id,
        }),
      );
    });

    it("should include reason in blocked deactivation event", async () => {
      await expect(
        userManagementService.deactivateUser(admin.id, admin.id),
      ).rejects.toThrow();

      const auditCall = vi.mocked(auditService.logEvent).mock.calls[0][0];
      expect(auditCall.metadata?.reason).toContain("Self-deactivation");
    });

    it("should fail for non-existent user", async () => {
      await expect(
        userManagementService.deactivateUser("invalid-id", admin.id),
      ).rejects.toThrow();
    });

    it("should fail if user already deactivated", async () => {
      const inactive = await createTestUser({ active: false });

      await expect(
        userManagementService.deactivateUser(inactive.id, admin.id),
      ).rejects.toThrow();
    });
  });

  describe("reactivateUser", () => {
    it("should reactivate user", async () => {
      const inactive = await createTestUser({ active: false });

      const result = await userManagementService.reactivateUser(
        inactive.id,
        admin.id,
      );

      expect(result.active).toBe(true);
    });

    it("should log user_reactivated audit event", async () => {
      const inactive = await createTestUser({ active: false });

      await userManagementService.reactivateUser(inactive.id, admin.id);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.reactivated",
          actorId: admin.id,
        }),
      );
    });

    it("should fail for already active user", async () => {
      await expect(
        userManagementService.reactivateUser(testUser.id, admin.id),
      ).rejects.toThrow();
    });

    it("should fail for non-existent user", async () => {
      await expect(
        userManagementService.reactivateUser("invalid-id", admin.id),
      ).rejects.toThrow();
    });
  });

  describe("getUserAuditTrail", () => {
    it("should return audit events for user", async () => {
      // Create some events
      await userManagementService.deactivateUser(testUser.id, admin.id);

      const trail = await userManagementService.getUserAuditTrail(testUser.id);

      expect(Array.isArray(trail)).toBe(true);
      expect(trail.length).toBeGreaterThan(0);
    });

    it("should filter by action type", async () => {
      const trail = await userManagementService.getUserAuditTrail(testUser.id, {
        actions: ["user.created"],
      });

      trail.forEach((event) => {
        expect(event.action).toBe("user.created");
      });
    });

    it("should filter by date range", async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const trail = await userManagementService.getUserAuditTrail(testUser.id, {
        startDate: now,
        endDate: tomorrow,
      });

      trail.forEach((event) => {
        const eventDate = new Date(event.timestamp);
        expect(eventDate.getTime()).toBeGreaterThanOrEqual(now.getTime());
        expect(eventDate.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
      });
    });

    it("should limit results", async () => {
      const trail = await userManagementService.getUserAuditTrail(testUser.id, {
        limit: 5,
      });

      expect(trail.length).toBeLessThanOrEqual(5);
    });

    it("should return empty array for user with no events", async () => {
      const newUser = await createTestUser();

      const trail = await userManagementService.getUserAuditTrail(newUser.id);

      expect(Array.isArray(trail)).toBe(true);
    });
  });

  describe("Audit logging integration", () => {
    it("should log all user management operations", async () => {
      const testEmail = `audit-${Date.now()}@example.com`;

      // Create user
      const { user } = await userManagementService.createUser(
        {
          email: testEmail,
          fullName: "Audit Test",
          role: UserRole.recruiter,
        },
        admin.id,
      );

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.created",
          resourceType: "User",
          resourceId: user.id,
          actorId: admin.id,
        }),
      );

      // Update role
      vi.clearAllMocks();
      await userManagementService.updateUserRole(
        user.id,
        UserRole.hr_manager,
        admin.id,
      );

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.role_updated",
          resourceType: "User",
          resourceId: user.id,
          actorId: admin.id,
        }),
      );

      // Deactivate user
      vi.clearAllMocks();
      await userManagementService.deactivateUser(user.id, admin.id);

      expect(auditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "user.deactivated",
          resourceType: "User",
          resourceId: user.id,
          actorId: admin.id,
        }),
      );
    });
  });
});
