"use client";

import { useState } from "react";
import type { User, UserRole } from "@/types/user";
import { ROLE_LABELS } from "@/types/user";
import { adminUserService } from "@/services/adminUserService";
import { useToast } from "@/contexts/ToastContext";

interface EditUserRoleModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onRoleUpdated: () => void;
}

export function EditUserRoleModal({
  isOpen,
  user,
  onClose,
  onRoleUpdated,
}: EditUserRoleModalProps) {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [newRole, setNewRole] = useState<UserRole | "">(
    user?.role || ""
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !newRole) return;

    if (newRole === user.role) {
      setError("New role must be different from current role");
      return;
    }

    if (!confirmed) {
      setError("Please confirm that you understand this change");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await adminUserService.updateUserRole(user.id, { newRole });

      addToast({
        type: "success",
        title: "Role updated",
        message: `Role updated to ${ROLE_LABELS[newRole]}. Changes will take effect on next login.`,
      });

      onClose();
      onRoleUpdated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update role";

      if (err instanceof Error && "status" in err && err.status === 403) {
        setError("You cannot change your own role");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setNewRole(user?.role || "");
    setConfirmed(false);
    setError("");
    onClose();
  };

  if (!isOpen || !user) return null;

  const isValid = newRole && newRole !== user.role && confirmed;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Change User Role</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                User: <span className="font-semibold">{user.fullName}</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Role
              </label>
              <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-700">
                {ROLE_LABELS[user.role]}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                New Role *
              </label>
              <select
                value={newRole}
                onChange={(e) => {
                  setNewRole(e.target.value as UserRole);
                  setError("");
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a role...</option>
                {Object.entries(ROLE_LABELS).map(([roleKey, roleLabel]) => (
                  <option key={roleKey} value={roleKey} disabled={roleKey === user.role}>
                    {roleLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="confirm"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  setError("");
                }}
                className="mt-1"
              />
              <label
                htmlFor="confirm"
                className="text-sm text-gray-700 flex-1"
              >
                I understand this change will take effect on the user's next login
              </label>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

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
                disabled={!isValid || isLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Updating..." : "Update Role"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
