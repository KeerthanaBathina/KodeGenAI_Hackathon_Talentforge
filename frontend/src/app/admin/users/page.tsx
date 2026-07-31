"use client";

import { UserListTable } from "@/components/admin/UserListTable";

/**
 * Admin User Management Page
 * User management dashboard.
 * Auth is enforced by the backend APIs used by the table actions.
 */
export default function AdminUsersPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="mt-2 text-gray-600">
              Create, manage, and deactivate platform users. View all users
              across all roles.
            </p>
          </div>

          {/* User List Table */}
          <UserListTable />
        </div>
      </div>
    </div>
  );
}
