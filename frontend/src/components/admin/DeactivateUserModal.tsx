"use client";

import { useState } from "react";
import type { User } from "@/types/user";
import { adminUserService } from "@/services/adminUserService";
import { useToast } from "@/contexts/ToastContext";

interface DeactivateUserModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onUserDeactivated: () => void;
  currentUserId?: string;
}

export function DeactivateUserModal({
  isOpen,
  user,
  onClose,
  onUserDeactivated,
  currentUserId,
}: DeactivateUserModalProps) {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");

  if (!isOpen || !user) return null;

  const isSelfDeactivation = currentUserId === user.id;

  const handleDeactivate = async () => {
    if (isSelfDeactivation) {
      setError("You cannot deactivate your own account");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await adminUserService.deactivateUser(user.id);

      addToast({
        type: "success",
        title: "User deactivated",
        message: `User ${user.fullName} has been deactivated successfully`,
      });

      onClose();
      onUserDeactivated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to deactivate user";

      if (err instanceof Error && "status" in err && err.status === 403) {
        setError("You cannot deactivate your own account");
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          {isSelfDeactivation ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Cannot Deactivate Account
              </h2>
              <p className="text-gray-700 mb-6">
                You cannot deactivate your own account. Contact another administrator
                if you need help.
              </p>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors"
              >
                Close
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                Deactivate User?
              </h2>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="font-medium text-gray-900 mb-2">
                  Are you sure you want to deactivate {user.fullName}?
                </p>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  <li>User will be immediately logged out on their next API call</li>
                  <li>User will be unable to log in until reactivated</li>
                  <li>All historical data will be preserved</li>
                </ul>
                <p className="text-sm text-gray-600 mt-3">
                  This action can be reversed by reactivating the account.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeactivate}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? "Deactivating..." : "Deactivate User"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
