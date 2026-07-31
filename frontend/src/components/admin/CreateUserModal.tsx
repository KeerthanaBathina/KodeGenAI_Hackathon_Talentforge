"use client";

import { useState } from "react";
import type { CreateUserInput, UserRole } from "@/types/user";
import { ROLE_LABELS, UserRole as UserRoleEnum } from "@/types/user";
import { adminUserService } from "@/services/adminUserService";
import { useToast } from "@/contexts/ToastContext";

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserCreated: () => void;
}

const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Europe/London", label: "London (GMT)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEDT)" },
];

export function CreateUserModal({
  isOpen,
  onClose,
  onUserCreated,
}: CreateUserModalProps) {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [createdUserEmail, setCreatedUserEmail] = useState<string>("");
  const [formData, setFormData] = useState<CreateUserInput>({
    email: "",
    fullName: "",
    role: UserRoleEnum.candidate,
    timezone: "UTC",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateUserInput, string>>>({});

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.fullName.trim()) {
      newErrors.fullName = "Full name is required";
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = "Full name must be at least 2 characters";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const response = await adminUserService.createUser(formData);

      setTemporaryPassword(response.temporaryPassword || "");
      setCreatedUserEmail(response.user.email);

      addToast({
        type: "success",
        title: "User created",
        message: `User created successfully. Onboarding email sent to ${response.user.email}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create user";

      if (error instanceof Error && "status" in error && error.status === 409) {
        setErrors({
          email: "A user with this email already exists",
        });
      } else {
        addToast({
          type: "error",
          title: "User creation failed",
          message,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyPassword = async () => {
    if (temporaryPassword) {
      try {
        await navigator.clipboard.writeText(temporaryPassword);
        addToast({
          type: "success",
          title: "Password copied",
          message: "Password copied to clipboard",
        });
      } catch {
        addToast({
          type: "error",
          title: "Copy failed",
          message: "Failed to copy password",
        });
      }
    }
  };

  const handleClose = () => {
    // Reset form when closing
    setFormData({
      email: "",
      fullName: "",
      role: UserRoleEnum.candidate,
      timezone: "UTC",
    });
    setErrors({});
    setTemporaryPassword(null);
    setCreatedUserEmail("");
    onClose();
  };

  const handleFinalClose = () => {
    handleClose();
    onUserCreated();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-96 overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Create New User</h2>

          {temporaryPassword ? (
            // Success state - show temporary password
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                User{" "}
                <span className="font-semibold">{createdUserEmail}</span> has
                been created successfully.
              </p>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="font-medium text-gray-900 mb-2">Temporary Password</p>
                <code className="block bg-gray-100 px-3 py-2 rounded font-mono text-sm break-all mb-3">
                  {temporaryPassword}
                </code>
                <button
                  onClick={handleCopyPassword}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium transition-colors"
                >
                  Copy to Clipboard
                </button>
                <p className="text-xs text-yellow-800 mt-3">
                  ⚠️ Save this password now. It will not be shown again.
                </p>
              </div>

              <button
                onClick={handleFinalClose}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            // Form state
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-lg font-base ${
                    errors.fullName
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                  placeholder="John Doe"
                />
                {errors.fullName && (
                  <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className={`w-full px-3 py-2 border rounded-lg font-base ${
                    errors.email ? "border-red-300 bg-red-50" : "border-gray-300"
                  }`}
                  placeholder="john@example.com"
                />
                {errors.email && (
                  <p className="text-red-600 text-sm mt-1">{errors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      role: e.target.value as UserRole,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.values(UserRoleEnum).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role as UserRole]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone
                </label>
                <select
                  value={formData.timezone || "UTC"}
                  onChange={(e) =>
                    setFormData({ ...formData, timezone: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TIMEZONE_OPTIONS.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
