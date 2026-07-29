/**
 * Test helpers for user management tests
 * Provides utilities for creating test data, authentication tokens, and cleanup
 */

import { prisma } from "@/db/prisma";
import bcrypt from "bcrypt";
import { jwtService } from "@/services/jwtService";
import type { User } from "@prisma/client";
import type { UserRole } from "@/types/user";

/**
 * Create test admin user
 */
export async function createTestAdmin(overrides: Partial<User> = {}): Promise<User> {
  const email = `admin-${Date.now()}@test.example.com`;
  const hashedPassword = await bcrypt.hash("testPassword123", 12);

  return await prisma.user.create({
    data: {
      email,
      fullName: "Test Admin",
      role: "admin" as UserRole,
      active: true,
      timezone: "UTC",
      password: hashedPassword,
      ...overrides,
    },
  });
}

/**
 * Create test user with specified role
 */
export async function createTestUser(
  overrides: Partial<User> = {},
): Promise<User> {
  const email = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@test.example.com`;
  const hashedPassword = await bcrypt.hash("testPassword123", 12);

  return await prisma.user.create({
    data: {
      email,
      fullName: "Test User",
      role: "recruiter" as UserRole,
      active: true,
      timezone: "UTC",
      password: hashedPassword,
      ...overrides,
    },
  });
}

/**
 * Create multiple test users
 */
export async function createTestUsers(
  count: number,
  overrides: Partial<User> = {},
): Promise<User[]> {
  const users: User[] = [];

  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      ...overrides,
      fullName: `Test User ${i + 1}`,
    });
    users.push(user);
  }

  return users;
}

/**
 * Generate JWT token for test user
 */
export function generateTestToken(user: User): string {
  return jwtService.sign({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
}

/**
 * Generate multiple test tokens
 */
export function generateTestTokens(users: User[]): Record<string, string> {
  const tokens: Record<string, string> = {};

  users.forEach((user) => {
    tokens[user.email] = generateTestToken(user);
  });

  return tokens;
}

/**
 * Create deactivated test user
 */
export async function createDeactivatedTestUser(
  overrides: Partial<User> = {},
): Promise<User> {
  return await createTestUser({
    active: false,
    ...overrides,
  });
}

/**
 * Clean up all test users
 */
export async function cleanupTestUsers(): Promise<void> {
  await prisma.user.deleteMany({
    where: {
      email: {
        endsWith: "@test.example.com",
      },
    },
  });
}

/**
 * Clean up all audit events from tests
 */
export async function cleanupAuditEvents(): Promise<void> {
  // Delete audit events created after test start
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  await prisma.auditEvent.deleteMany({
    where: {
      createdAt: {
        gte: oneHourAgo,
      },
    },
  });
}

/**
 * Get audit events for a resource
 */
export async function getAuditEventsForResource(
  resourceType: string,
  resourceId: string,
) {
  return await prisma.auditEvent.findMany({
    where: {
      resourceType,
      resourceId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Get audit events for an actor
 */
export async function getAuditEventsForActor(actorId: string) {
  return await prisma.auditEvent.findMany({
    where: {
      actorId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Verify audit event exists
 */
export async function verifyAuditEvent(criteria: {
  action: string;
  resourceType: string;
  resourceId?: string;
  actorId?: string;
}) {
  return await prisma.auditEvent.findFirst({
    where: {
      action: criteria.action,
      resourceType: criteria.resourceType,
      ...(criteria.resourceId && { resourceId: criteria.resourceId }),
      ...(criteria.actorId && { actorId: criteria.actorId }),
    },
  });
}

/**
 * Get user's current password hash (for testing password changes)
 */
export async function getUserPasswordHash(userId: string): Promise<string | null> {
  const credential = await prisma.userCredential.findFirst({
    where: {
      userId,
      type: "password",
    },
  });

  return credential?.value ?? null;
}

/**
 * Test setup function for integration tests
 */
export async function setupTestDatabase() {
  // Clean up any stale test data
  await cleanupTestUsers();
  await cleanupAuditEvents();
}

/**
 * Test teardown function for integration tests
 */
export async function teardownTestDatabase() {
  // Clean up test data after tests
  await cleanupTestUsers();
  await cleanupAuditEvents();
}
