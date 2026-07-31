"use client";

import { useEffect, useState } from "react";
import type { User, UserFilters, UserStatus } from "@/types/user";
import { ROLE_LABELS, UserRole } from "@/types/user";
import { adminUserService } from "@/services/adminUserService";
import { useToast } from "@/contexts/ToastContext";
import { CreateUserModal } from "./CreateUserModal";
import { EditUserRoleModal } from "./EditUserRoleModal";
import { DeactivateUserModal } from "./DeactivateUserModal";

interface UserListTableProps {
  currentUserId?: string;
}

const ITEMS_PER_PAGE = 20;

type SortField = "name" | "email" | "created";
type SortDirection = "asc" | "desc";

export function UserListTable({ currentUserId }: UserListTableProps) {
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Filter state
  const [roleFilter, setRoleFilter] = useState<UserRole | "">();
  const [statusFilter, setStatusFilter] = useState<UserStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState<User | null>(null);
  const [selectedUserForDeactivate, setSelectedUserForDeactivate] =
    useState<User | null>(null);

  // Load users
  const loadUsers = async () => {
    setIsLoading(true);
    setError("");

    try {
      const filters: UserFilters = {
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
      };

      if (roleFilter) filters.role = roleFilter;
      if (statusFilter !== "all") {
        filters.active = statusFilter === "active";
      }
      if (searchTerm) filters.search = searchTerm;

      const loadedUsers = await adminUserService.getUsers(filters);
      setUsers(loadedUsers);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load users";
      setError(message);
      addToast({
        type: "error",
        title: "Failed to load users",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, statusFilter, searchTerm]);

  useEffect(() => {
    loadUsers();
  }, [roleFilter, statusFilter, searchTerm, currentPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortedUsers = () => {
    const sorted = [...users].sort((a, b) => {
      let aValue: string | Date;
      let bValue: string | Date;

      switch (sortField) {
        case "name":
          aValue = a.fullName;
          bValue = b.fullName;
          break;
        case "email":
          aValue = a.email;
          bValue = b.email;
          break;
        case "created":
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
      }

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  };

  const sortedUsers = getSortedUsers();

  const handleReactivate = async (userId: string, userName: string) => {
    try {
      await adminUserService.reactivateUser(userId);
      addToast({
        type: "success",
        title: "User reactivated",
        message: `User ${userName} has been reactivated`,
      });
      await loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reactivate user";
      addToast({
        type: "error",
        title: "Reactivation failed",
        message,
      });
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-400">↕</span>;
    return sortDirection === "asc" ? <span>↑</span> : <span>↓</span>;
  };

  if (error && users.length === 0) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              value={roleFilter || ""}
              onChange={(e) =>
                setRoleFilter((e.target.value as UserRole) || undefined)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Roles</option>
              {Object.entries(ROLE_LABELS).map(([roleKey, roleLabel]) => (
                <option key={roleKey} value={roleKey}>
                  {roleLabel}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as UserStatus)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
            >
              + Create User
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No users found. Try adjusting your filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button
                        onClick={() => handleSort("name")}
                        className="flex items-center gap-2 hover:text-blue-600"
                      >
                        Full Name
                        <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button
                        onClick={() => handleSort("email")}
                        className="flex items-center gap-2 hover:text-blue-600"
                      >
                        Email
                        <SortIcon field="email" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      <button
                        onClick={() => handleSort("created")}
                        className="flex items-center gap-2 hover:text-blue-600"
                      >
                        Created
                        <SortIcon field="created" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {user.fullName}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {ROLE_LABELS[user.role]}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {user.active ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedUserForRole(user)}
                            disabled={currentUserId === user.id}
                            className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Edit Role
                          </button>
                          {user.active ? (
                            <button
                              onClick={() =>
                                setSelectedUserForDeactivate(user)
                              }
                              disabled={currentUserId === user.id}
                              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                handleReactivate(user.id, user.fullName)
                              }
                              className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                Showing {sortedUsers.length} of {users.length} users
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-600">
                  Page {currentPage}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => p + 1)}
                  disabled={sortedUsers.length < ITEMS_PER_PAGE}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onUserCreated={() => {
          setIsCreateModalOpen(false);
          loadUsers();
        }}
      />

      <EditUserRoleModal
        isOpen={!!selectedUserForRole}
        user={selectedUserForRole}
        onClose={() => setSelectedUserForRole(null)}
        onRoleUpdated={() => {
          setSelectedUserForRole(null);
          loadUsers();
        }}
      />

      <DeactivateUserModal
        isOpen={!!selectedUserForDeactivate}
        user={selectedUserForDeactivate}
        currentUserId={currentUserId}
        onClose={() => setSelectedUserForDeactivate(null)}
        onUserDeactivated={() => {
          setSelectedUserForDeactivate(null);
          loadUsers();
        }}
      />
    </>
  );
}
