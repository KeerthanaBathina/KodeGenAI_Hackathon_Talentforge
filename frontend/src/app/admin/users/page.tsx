"use client";

import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { UserListTable } from "@/components/admin/UserListTable";

/**
 * Admin User Management Page
 * User management dashboard.
 * Auth is enforced by the backend APIs used by the table actions.
 */
export default function AdminUsersPage() {
  return (
    <AdminPageShell
      title="User Management"
      description="Create, manage, and deactivate platform users. Review account status and role assignments across all teams."
    >
      <UserListTable />
    </AdminPageShell>
  );
}
