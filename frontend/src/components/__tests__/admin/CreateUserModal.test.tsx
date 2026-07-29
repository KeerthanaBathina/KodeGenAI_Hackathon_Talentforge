import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateUserModal } from "@/components/admin/CreateUserModal";
import * as adminUserService from "@/services/adminUserService";
import { ToastProvider } from "@/contexts/ToastContext";
import { UserRole } from "@/types/user";

vi.mock("@/services/adminUserService");

const mockShowToast = vi.fn();
vi.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("CreateUserModal", () => {
  const mockOnClose = vi.fn();
  const mockOnUserCreated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(
      <CreateUserModal
        isOpen={false}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    expect(screen.queryByText("Create New User")).not.toBeInTheDocument();
  });

  it("renders form when isOpen is true", () => {
    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    expect(screen.getByText("Create New User")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("john@example.com")).toBeInTheDocument();
  });

  it("validates required fields", async () => {
    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText("Full name is required")).toBeInTheDocument();
      expect(screen.getByText("Email is required")).toBeInTheDocument();
    });
  });

  it("validates email format", async () => {
    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "invalid-email" } });

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(
        screen.getByText("Please enter a valid email address")
      ).toBeInTheDocument();
    });
  });

  it("validates minimum name length", async () => {
    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "J" } });

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "j@example.com" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(
        screen.getByText("Full name must be at least 2 characters")
      ).toBeInTheDocument();
    });
  });

  it("submits form with valid data", async () => {
    const mockResponse = {
      user: {
        id: "user-1",
        email: "john@example.com",
        fullName: "John Doe",
        role: UserRole.recruiter,
        timezone: "UTC",
        active: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        temporaryPassword: "temp-password-123",
      },
      temporaryPassword: "temp-password-123",
    };

    vi.mocked(adminUserService.adminUserService.createUser).mockResolvedValueOnce(
      mockResponse as any
    );

    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(adminUserService.adminUserService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "john@example.com",
          fullName: "John Doe",
        })
      );
    });
  });

  it("displays temporary password after successful creation", async () => {
    const mockResponse = {
      user: {
        id: "user-1",
        email: "john@example.com",
        fullName: "John Doe",
        role: UserRole.recruiter,
        timezone: "UTC",
        active: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        temporaryPassword: "super-secret-password",
      },
      temporaryPassword: "super-secret-password",
    };

    vi.mocked(adminUserService.adminUserService.createUser).mockResolvedValueOnce(
      mockResponse as any
    );

    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText("Temporary Password")).toBeInTheDocument();
      expect(screen.getByText("super-secret-password")).toBeInTheDocument();
    });
  });

  it("shows success toast on user creation", async () => {
    const mockResponse = {
      user: {
        id: "user-1",
        email: "john@example.com",
        fullName: "John Doe",
        role: UserRole.recruiter,
        timezone: "UTC",
        active: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        temporaryPassword: "temp-password",
      },
      temporaryPassword: "temp-password",
    };

    vi.mocked(adminUserService.adminUserService.createUser).mockResolvedValueOnce(
      mockResponse as any
    );

    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "success",
          message: expect.stringContaining("john@example.com"),
        })
      );
    });
  });

  it("handles duplicate email error", async () => {
    const error = new Error("A user with this email already exists");
    (error as any).status = 409;

    vi.mocked(adminUserService.adminUserService.createUser).mockRejectedValueOnce(
      error
    );

    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(
        screen.getByText("A user with this email already exists")
      ).toBeInTheDocument();
    });
  });

  it("has copy to clipboard button for password", async () => {
    const mockResponse = {
      user: {
        id: "user-1",
        email: "john@example.com",
        fullName: "John Doe",
        role: UserRole.recruiter,
        timezone: "UTC",
        active: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        temporaryPassword: "temp-password",
      },
      temporaryPassword: "temp-password",
    };

    vi.mocked(adminUserService.adminUserService.createUser).mockResolvedValueOnce(
      mockResponse as any
    );

    render(
      <CreateUserModal
        isOpen={true}
        onClose={mockOnClose}
        onUserCreated={mockOnUserCreated}
      />
    );

    const nameInput = screen.getByPlaceholderText("John Doe");
    fireEvent.change(nameInput, { target: { value: "John Doe" } });

    const emailInput = screen.getByPlaceholderText("john@example.com");
    fireEvent.change(emailInput, { target: { value: "john@example.com" } });

    const createButton = screen.getByText("Create User");
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(screen.getByText("Copy to Clipboard")).toBeInTheDocument();
    });
  });
});
