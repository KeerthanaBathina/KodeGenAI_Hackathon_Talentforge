import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { adminUserService } from "@/services/adminUserService";
import type { User, CreateUserInput } from "@/types/user";
import { UserRole } from "@/types/user";

// Mock fetch
global.fetch = vi.fn();

const mockUser: User = {
  id: "user-1",
  email: "john@example.com",
  fullName: "John Doe",
  role: UserRole.admin,
  timezone: "UTC",
  active: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("adminUserService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUsers", () => {
    it("fetches users without filters", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUser],
      } as any);

      const result = await adminUserService.getUsers();

      expect(result).toEqual([mockUser]);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users"),
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        })
      );
    });

    it("fetches users with role filter", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUser],
      } as any);

      await adminUserService.getUsers({ role: UserRole.recruiter });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("role=recruiter"),
        expect.any(Object)
      );
    });

    it("fetches users with active filter", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUser],
      } as any);

      await adminUserService.getUsers({ active: true });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("active=true"),
        expect.any(Object)
      );
    });

    it("fetches users with search filter", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUser],
      } as any);

      await adminUserService.getUsers({ search: "john" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("search=john"),
        expect.any(Object)
      );
    });

    it("fetches users with pagination", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUser],
      } as any);

      await adminUserService.getUsers({ page: 2, pageSize: 50 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("pageSize=50"),
        expect.any(Object)
      );
    });

    it("throws error on 404 response", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: "Not found" }),
      } as any);

      await expect(adminUserService.getUsers()).rejects.toThrow();
    });
  });

  describe("getUserById", () => {
    it("fetches single user by id", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      } as any);

      const result = await adminUserService.getUserById("user-1");

      expect(result).toEqual(mockUser);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users/user-1"),
        expect.any(Object)
      );
    });

    it("throws error on 404 when user not found", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: "User not found" }),
      } as any);

      await expect(adminUserService.getUserById("invalid-id")).rejects.toThrow(
        "User not found"
      );
    });
  });

  describe("createUser", () => {
    it("creates user with valid data", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const responseData = {
        user: mockUser,
        temporaryPassword: "temp-password-123",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseData,
      } as any);

      const createInput: CreateUserInput = {
        email: "john@example.com",
        fullName: "John Doe",
        role: UserRole.admin,
        timezone: "UTC",
      };

      const result = await adminUserService.createUser(createInput);

      expect(result).toEqual(responseData);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(createInput),
        })
      );
    });

    it("throws error on 409 conflict (duplicate email)", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ message: "User already exists" }),
      } as any);

      const createInput: CreateUserInput = {
        email: "existing@example.com",
        fullName: "Existing User",
        role: UserRole.candidate,
      };

      await expect(adminUserService.createUser(createInput)).rejects.toMatchObject({
        status: 409,
      });
    });

    it("throws error on 400 validation error", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: "Invalid email format" }),
      } as any);

      const createInput: CreateUserInput = {
        email: "invalid-email",
        fullName: "John Doe",
        role: UserRole.candidate,
      };

      await expect(adminUserService.createUser(createInput)).rejects.toThrow();
    });
  });

  describe("updateUserRole", () => {
    it("updates user role", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const updatedUser = { ...mockUser, role: UserRole.recruiter };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedUser,
      } as any);

      const result = await adminUserService.updateUserRole("user-1", {
        newRole: UserRole.recruiter,
      });

      expect(result).toEqual(updatedUser);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users/user-1/role"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ role: UserRole.recruiter }),
        })
      );
    });

    it("throws error on 403 forbidden (self-modification)", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          message: "Cannot change your own role",
        }),
      } as any);

      await expect(
        adminUserService.updateUserRole("user-1", { newRole: UserRole.recruiter })
      ).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe("deactivateUser", () => {
    it("deactivates user", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const deactivatedUser = { ...mockUser, active: false };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => deactivatedUser,
      } as any);

      const result = await adminUserService.deactivateUser("user-1");

      expect(result).toEqual(deactivatedUser);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users/user-1/deactivate"),
        expect.objectContaining({
          method: "PATCH",
        })
      );
    });

    it("throws error on 403 when trying to deactivate self", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          message: "Cannot deactivate your own account",
        }),
      } as any);

      await expect(adminUserService.deactivateUser("user-1")).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe("reactivateUser", () => {
    it("reactivates user", async () => {
      const mockFetch = vi.mocked(global.fetch);
      const reactivatedUser = { ...mockUser, active: true };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => reactivatedUser,
      } as any);

      const result = await adminUserService.reactivateUser("user-1");

      expect(result).toEqual(reactivatedUser);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/admin/users/user-1/reactivate"),
        expect.objectContaining({
          method: "PATCH",
        })
      );
    });

    it("throws error on 404 when user not found", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ message: "User not found" }),
      } as any);

      await expect(adminUserService.reactivateUser("invalid-id")).rejects.toThrow(
        "User not found"
      );
    });
  });

  describe("error handling", () => {
    it("returns user-friendly error for 403", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({}),
      } as any);

      try {
        await adminUserService.getUsers();
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("permission");
      }
    });

    it("returns user-friendly error for 409", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({}),
      } as any);

      try {
        await adminUserService.getUsers();
        expect.fail("Should have thrown");
      } catch (error: any) {
        expect(error.message).toContain("already exists");
      }
    });

    it("includes credentials in all requests", async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockUser],
      } as any);

      await adminUserService.getUsers();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: "include",
        })
      );
    });
  });
});
