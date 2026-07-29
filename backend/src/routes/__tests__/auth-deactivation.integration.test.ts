/**
 * Integration tests for authentication with deactivated users
 * Verifies that deactivated users cannot authenticate
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "@/app";
import {
  createTestAdmin,
  createTestUser,
  createDeactivatedTestUser,
  setupTestDatabase,
  teardownTestDatabase,
  generateTestToken,
} from "../helpers/userTestData";
import { prisma } from "@/db/prisma";
import type { User } from "@prisma/client";
import { UserRole } from "@/types/user";
import bcrypt from "bcrypt";

describe("Authentication with Deactivated Users", () => {
  let admin: User;
  let activeUser: User;
  let deactivatedUser: User;

  beforeEach(async () => {
    await setupTestDatabase();
    admin = await createTestAdmin();
    activeUser = await createTestUser({
      email: "active@example.com",
      fullName: "Active User",
    });
    deactivatedUser = await createDeactivatedTestUser({
      email: "deactivated@example.com",
      fullName: "Deactivated User",
    });
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  describe("Login Prevention for Deactivated Users", () => {
    it("should prevent login for deactivated user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: "testPassword123",
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain("deactivated");
    });

    it("should show specific error message for deactivated account", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: "testPassword123",
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain(
        "account has been deactivated — contact your administrator",
      );
    });

    it("should not reveal whether deactivated email exists", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: "testPassword123",
        });

      const invalidResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "testPassword123",
        });

      // Both should be 401, not revealing which reason
      expect(loginResponse.status).toBe(401);
      expect(invalidResponse.status).toBe(401);
    });

    it("should allow active user to login", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: activeUser.email,
          password: "testPassword123",
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
    });
  });

  describe("Session Invalidation on Deactivation", () => {
    it("should invalidate existing token when user is deactivated", async () => {
      // Get token for active user
      const token = generateTestToken(activeUser);

      // Verify token works
      const beforeResponse = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);

      expect(beforeResponse.status).toBe(200);

      // Deactivate user
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { active: false },
      });

      // Verify token no longer works
      const afterResponse = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);

      expect(afterResponse.status).toBe(401);
      expect(afterResponse.body.message).toContain("deactivated");
    });

    it("should immediately reject API calls from deactivated users", async () => {
      const token = generateTestToken(deactivatedUser);

      const response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toContain("deactivated");
    });

    it("should check deactivation status on every authenticated request", async () => {
      const token = generateTestToken(activeUser);

      // First request should work
      let response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);

      // Deactivate user
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { active: false },
      });

      // Second request with same token should fail
      response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(401);

      // Reactivate user
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { active: true },
      });

      // Third request with same token should work again
      response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
    });
  });

  describe("Role Change Effect on Login", () => {
    it("should reflect updated role after login", async () => {
      const originalRole = activeUser.role;

      // Login and get token
      let response = await request(app)
        .post("/api/auth/login")
        .send({
          email: activeUser.email,
          password: "testPassword123",
        });

      expect(response.status).toBe(200);
      const firstToken = response.body.token;

      // Decode first token to check role
      const decoded1 = JSON.parse(
        Buffer.from(firstToken.split(".")[1], "base64").toString(),
      );
      expect(decoded1.role).toBe(originalRole);

      // Change role
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { role: UserRole.admin },
      });

      // Login again with same credentials
      response = await request(app)
        .post("/api/auth/login")
        .send({
          email: activeUser.email,
          password: "testPassword123",
        });

      expect(response.status).toBe(200);
      const secondToken = response.body.token;

      // Decode second token to check new role
      const decoded2 = JSON.parse(
        Buffer.from(secondToken.split(".")[1], "base64").toString(),
      );
      expect(decoded2.role).toBe(UserRole.admin);
    });

    it("should require new login to get updated role", async () => {
      const originalToken = generateTestToken(activeUser);

      // Change role in database
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { role: UserRole.admin },
      });

      // Old token should still have old role
      const decoded = JSON.parse(
        Buffer.from(originalToken.split(".")[1], "base64").toString(),
      );
      expect(decoded.role).not.toBe(UserRole.admin);

      // User needs to login again to get new role
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: activeUser.email,
          password: "testPassword123",
        });

      const newToken = response.body.token;
      const decodedNew = JSON.parse(
        Buffer.from(newToken.split(".")[1], "base64").toString(),
      );
      expect(decodedNew.role).toBe(UserRole.admin);
    });
  });

  describe("Deactivation During Session", () => {
    it("should prevent continued use of valid JWT after deactivation", async () => {
      const token = generateTestToken(activeUser);

      // Make authenticated request
      let response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);

      // Deactivate user outside of API (simulating admin action)
      await prisma.user.update({
        where: { id: activeUser.id },
        data: { active: false },
      });

      // Same JWT should now be rejected
      response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body.message).toContain("deactivated");
    });

    it("should log failed deactivation attempts", async () => {
      const token = generateTestToken(deactivatedUser);

      // Attempt to use deactivated user's token
      const response = await request(app)
        .get("/api/profile")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(401);

      // Verify audit event was logged
      const auditEvents = await prisma.auditEvent.findMany({
        where: {
          action: "login_blocked",
          actorId: deactivatedUser.id,
        },
      });

      expect(auditEvents.length).toBeGreaterThan(0);
    });
  });

  describe("Error Message Consistency", () => {
    it("should return consistent error for deactivated users", async () => {
      const response1 = await request(app)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: "testPassword123",
        });

      const response2 = await request(app)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: "wrongPassword",
        });

      // Both should mention deactivation
      expect(response1.body.message).toContain("deactivated");
      expect(response2.body.message).toContain("deactivated");

      // Status should be same
      expect(response1.status).toBe(response2.status);
    });

    it("should not expose whether account exists", async () => {
      const response1 = await request(app)
        .post("/api/auth/login")
        .send({
          email: deactivatedUser.email,
          password: "testPassword123",
        });

      const response2 = await request(app)
        .post("/api/auth/login")
        .send({
          email: "definitely_does_not_exist_xyz@example.com",
          password: "testPassword123",
        });

      // Should not reveal which is which
      expect(response1.status).toBe(401);
      expect(response2.status).toBe(401);
      // Messages should be generic/similar
      expect(response1.body.message).toBe(response2.body.message);
    });
  });
});
