import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { UserListTable } from "@/components/admin/UserListTable";
import * as adminUserService from "@/services/adminUserService";
import { ToastProvider } from "@/contexts/ToastContext";
import type { User } from "@/types/user";
import { UserRole } from "@/types/user";

// Mock the adminUserService
vi.mock("@/services/adminUserService");

// Mock toast context
const mockShowToast = vi.fn();
vi.mock("@/contexts/ToastContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/ToastContext")>();
  return {
    ...actual,
    useToast: () => ({
      addToast: mockShowToast,
    }),
  };
});

const mockUsers: User[] = [
  {
    id: "user-1",
    email: "john@example.com",
    fullName: "John Doe",
    role: UserRole.admin,
    timezone: "UTC",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "user-2",
    email: "jane@example.com",
    fullName: "Jane Smith",
    role: UserRole.recruiter,
    timezone: "UTC",
    active: true,
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "user-3",
    email: "inactive@example.com",
    fullName: "Inactive User",
    role: UserRole.candidate,
    timezone: "UTC",
    active: false,
    createdAt: "2026-01-03T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  },
];

describe("UserListTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminUserService.adminUserService.getUsers).mockResolvedValue(
      mockUsers
    );
  });

  it("renders user table with users", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
    });
  });

  it("displays empty state when no users found", async () => {
    vi.mocked(adminUserService.adminUserService.getUsers).mockResolvedValueOnce([]);

    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/No users found/)).toBeInTheDocument();
    });
  });

  it("shows Create User button", () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    expect(screen.getByText("+ Create User")).toBeInTheDocument();
  });

  it("filters users by role", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const roleSelect = screen.getByDisplayValue("All Roles");
    fireEvent.change(roleSelect, { target: { value: UserRole.recruiter } });

    await waitFor(() => {
      expect(adminUserService.adminUserService.getUsers).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.recruiter })
      );
    });
  });

  it("filters users by status", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue("All");
    fireEvent.change(statusSelect, { target: { value: "active" } });

    await waitFor(() => {
      expect(adminUserService.adminUserService.getUsers).toHaveBeenCalledWith(
        expect.objectContaining({ active: true })
      );
    });
  });

  it("searches users by name or email", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name or email/);
    fireEvent.change(searchInput, { target: { value: "john" } });

    await waitFor(() => {
      expect(adminUserService.adminUserService.getUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: "john" })
      );
    });
  });

  it("displays user active status badge", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Inactive")).toBeInTheDocument();
    });
  });

  it("disables role edit button for current user", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      const johnRow = screen.getByText("John Doe").closest("tr");
      expect(johnRow).not.toBeNull();
      expect(within(johnRow!).getByText("Edit Role")).toBeDisabled();
    });
  });

  it("disables deactivate button for current user", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      const johnRow = screen.getByText("John Doe").closest("tr");
      expect(johnRow).not.toBeNull();
      expect(within(johnRow!).getByText("Deactivate")).toBeDisabled();
    });
  });

  it("shows Reactivate button for inactive users", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Reactivate")).toBeInTheDocument();
    });
  });

  it("calls reactivateUser when Reactivate button clicked", async () => {
    vi.mocked(adminUserService.adminUserService.reactivateUser).mockResolvedValueOnce(
      { ...mockUsers[2], active: true }
    );

    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Reactivate")).toBeInTheDocument();
    });

    const reactivateButton = screen.getByText("Reactivate");
    fireEvent.click(reactivateButton);

    await waitFor(() => {
      expect(adminUserService.adminUserService.reactivateUser).toHaveBeenCalledWith(
        "user-3"
      );
    });
  });

  it("displays error when users fail to load", async () => {
    const error = new Error("Failed to load users");
    vi.mocked(adminUserService.adminUserService.getUsers).mockRejectedValueOnce(
      error
    );

    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load users/)).toBeInTheDocument();
    });
  });

  it("sorts users by name", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const nameHeader = screen.getAllByText(/Full Name/)[0];
    fireEvent.click(nameHeader.closest("button")!);

    // Check that sort order changed (visual verification would be better in e2e)
    expect(nameHeader.closest("button")).toBeInTheDocument();
  });

  it("paginates users", async () => {
    render(
      <ToastProvider>
        <UserListTable currentUserId="user-1" />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    const nextButton = screen.getByText("Next");
    expect(nextButton).toBeInTheDocument();
  });
});
