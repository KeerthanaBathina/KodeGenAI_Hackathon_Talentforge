/**
 * Admin User Management API Service
 * Handles all API calls for user CRUD operations
 */

import type {
  User,
  CreateUserInput,
  CreateUserResponse,
  UpdateUserRoleInput,
  UserFilters,
  ApiErrorResponse,
} from "@/types/user";
import { resolveApiBaseUrl } from "@/lib/api/url";

const API_BASE_URL = resolveApiBaseUrl();

/**
 * Parse API error response and provide user-friendly message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Response || (typeof error === "object" && error !== null && "status" in error)) {
    const status = error instanceof Response
      ? error.status
      : Number((error as { status?: unknown }).status);

    switch (status) {
      case 403:
        return "You don't have permission to perform this action";
      case 409:
        return "A user with this email already exists";
      case 404:
        return "User not found";
      case 400:
        return "Invalid request data. Please check your input.";
      case 500:
        return "An error occurred on the server. Please try again later.";
      default:
        return "An unexpected error occurred. Please try again.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred";
}

/**
 * Handle API response and throw on error
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorResponse = (await response.json().catch(() => ({}))) as Partial<
      ApiErrorResponse
    > & {
      error?: {
        code?: string;
        message?: string;
      };
    };
    const error = new Error(
      errorResponse.message || errorResponse.error?.message || getErrorMessage(response)
    ) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = errorResponse.code || errorResponse.error?.code;
    throw error;
  }

  return response.json() as Promise<T>;
}

function unwrapUserList(payload: unknown): User[] {
  if (Array.isArray(payload)) {
    return payload as User[];
  }

  if (payload && typeof payload === "object") {
    const data = payload as { users?: unknown };
    if (Array.isArray(data.users)) {
      return data.users as User[];
    }
  }

  return [];
}

function unwrapUser(payload: unknown): User {
  if (payload && typeof payload === "object") {
    const data = payload as { user?: unknown };
    if (data.user && typeof data.user === "object") {
      return data.user as User;
    }
  }

  return payload as User;
}

export const adminUserService = {
  /**
   * Fetch all users with optional filters
   * GET /api/admin/users?role=&active=&search=&page=&pageSize=
   */
  async getUsers(filters?: UserFilters): Promise<User[]> {
    const params = new URLSearchParams();

    if (filters?.role) params.append("role", filters.role);
    if (filters?.active !== undefined)
      params.append("active", String(filters.active));
    if (filters?.search) params.append("search", filters.search);
    if (filters?.page) params.append("page", String(filters.page));
    if (filters?.pageSize) params.append("pageSize", String(filters.pageSize));

    const queryString = params.toString();
    const url = `${API_BASE_URL}/api/admin/users${queryString ? `?${queryString}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = await handleResponse<unknown>(response);
    return unwrapUserList(payload);
  },

  /**
   * Fetch single user by ID
   * GET /api/admin/users/:id
   */
  async getUserById(id: string): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const payload = await handleResponse<unknown>(response);
    return unwrapUser(payload);
  },

  /**
   * Create new user
   * POST /api/admin/users
   * Returns user object and temporary password (shown once only)
   */
  async createUser(data: CreateUserInput): Promise<CreateUserResponse> {
    const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    return handleResponse<CreateUserResponse>(response);
  },

  /**
   * Update user role
   * PATCH /api/admin/users/:id/role
   * Changes take effect on user's next login
   */
  async updateUserRole(userId: string, input: UpdateUserRoleInput): Promise<User> {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/users/${userId}/role`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: input.newRole }),
      }
    );

    const payload = await handleResponse<unknown>(response);
    return unwrapUser(payload);
  },

  /**
   * Deactivate user - immediate logout on next API call
   * PATCH /api/admin/users/:id/deactivate
   */
  async deactivateUser(userId: string): Promise<User> {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/users/${userId}/deactivate`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const payload = await handleResponse<unknown>(response);
    return unwrapUser(payload);
  },

  /**
   * Reactivate user
   * PATCH /api/admin/users/:id/reactivate
   */
  async reactivateUser(userId: string): Promise<User> {
    const response = await fetch(
      `${API_BASE_URL}/api/admin/users/${userId}/reactivate`,
      {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const payload = await handleResponse<unknown>(response);
    return unwrapUser(payload);
  },
};
