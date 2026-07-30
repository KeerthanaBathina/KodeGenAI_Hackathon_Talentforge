import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { UserRole } from "@/types/user";
import { UserListTable } from "@/components/admin/UserListTable";

/**
 * Admin User Management Page
 * Protected route - admin role required
 * Server component for initial auth check, client component for interactive features
 */
export default async function AdminUsersPage() {
  const session = await getSession();

  // Redirect non-authenticated users
  if (!session) {
    redirect("/login");
  }

  // Redirect non-admin users
  if (session.role !== UserRole.admin) {
    redirect("/unauthorized");
  }

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
          <UserListTable currentUserId={session.userId} />
        </div>
      </div>
    </div>
  );
}
