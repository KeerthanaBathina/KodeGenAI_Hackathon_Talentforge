"use client";

import React, { useEffect, useMemo, useState } from "react";
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

const ROLE_TONE_CLASSES: Record<UserRole, string> = {
  [UserRole.admin]: "border-orange-200 bg-orange-50 text-orange-700",
  [UserRole.hr_reviewer]: "border-sky-200 bg-sky-50 text-sky-700",
  [UserRole.hr_manager]: "border-indigo-200 bg-indigo-50 text-indigo-700",
  [UserRole.recruiter]: "border-violet-200 bg-violet-50 text-violet-700",
  [UserRole.tech_interviewer]: "border-emerald-200 bg-emerald-50 text-emerald-700",
  [UserRole.compliance]: "border-amber-200 bg-amber-50 text-amber-700",
  [UserRole.candidate]: "border-slate-200 bg-slate-100 text-slate-700",
};

function getInitials(fullName: string): string {
  const parts = fullName
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "NA";
  }

  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("");
}

function formatDate(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "N/A";
  }

  return parsedDate.toLocaleDateString();
}

function formatDateWithTime(value: string): string {
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return "N/A";
  }

  return parsedDate.toLocaleString();
}

function getStatusChip(active: boolean) {
  if (active) {
    return {
      dotClassName: "bg-emerald-500",
      textClassName: "text-emerald-700",
      label: "Active",
    };
  }

  return {
    dotClassName: "bg-slate-400",
    textClassName: "text-slate-600",
    label: "Inactive",
  };
}

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

  // Selection state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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
      setSelectedUserId((previousValue) => {
        if (previousValue && loadedUsers.some((user) => user.id === previousValue)) {
          return previousValue;
        }

        const [firstUser] = loadedUsers;
        return firstUser ? firstUser.id : null;
      });
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

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
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
  }, [users, sortField, sortDirection]);

  const selectedUser = useMemo(() => {
    return sortedUsers.find((user) => user.id === selectedUserId) || sortedUsers[0] || null;
  }, [sortedUsers, selectedUserId]);

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

  const handleTriggerPasswordReset = (user: User) => {
    addToast({
      type: "info",
      title: "Password reset",
      message: `Password reset flow for ${user.fullName} is not yet configured in this environment.`,
    });
  };

  const handleRevokeSessions = (user: User) => {
    addToast({
      type: "info",
      title: "Sessions revoked",
      message: `Session revocation for ${user.fullName} will be available when session controls are enabled.`,
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="text-gray-400">↕</span>;
    return sortDirection === "asc" ? <span>↑</span> : <span>↓</span>;
  };

  if (error && users.length === 0) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] shadow-[var(--admin-shadow-sm)]">
          <div className="border-b border-[var(--admin-color-border)] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-end gap-2">
              <div className="relative min-w-[220px] flex-1">
                <label className="sr-only" htmlFor="user-search-input">Search by name or email</label>
                <input
                  id="user-search-input"
                  type="text"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 w-full rounded-lg border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-3 text-sm text-[var(--admin-color-ink-primary)] placeholder:text-[var(--admin-color-ink-tertiary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                />
              </div>

              <div className="min-w-[150px]">
                <label className="sr-only" htmlFor="role-filter-select">Filter by role</label>
                <select
                  id="role-filter-select"
                  value={roleFilter || ""}
                  onChange={(e) =>
                    setRoleFilter((e.target.value as UserRole) || undefined)
                  }
                  className="h-10 w-full rounded-lg border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                >
                  <option value="">All Roles</option>
                  {Object.entries(ROLE_LABELS).map(([roleKey, roleLabel]) => (
                    <option key={roleKey} value={roleKey}>
                      {roleLabel}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[150px]">
                <label className="sr-only" htmlFor="status-filter-select">Filter by status</label>
                <select
                  id="status-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as UserStatus)}
                  className="h-10 w-full rounded-lg border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] px-2.5 text-sm text-[var(--admin-color-ink-primary)] focus:border-[var(--admin-color-brand-primary)] focus:outline-none"
                >
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="h-10 rounded-lg bg-[var(--admin-color-brand-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--admin-color-brand-primary-hover)]"
              >
                + Create User
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-10 text-center text-sm text-[var(--admin-color-ink-secondary)]">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center text-sm text-[var(--admin-color-ink-secondary)]">
              No users found. Try adjusting your filters.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-[var(--admin-color-surface-2)]">
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">
                        <button
                          onClick={() => handleSort("name")}
                          className="inline-flex items-center gap-2 text-[var(--admin-color-ink-secondary)] hover:text-[var(--admin-color-ink-primary)]"
                        >
                          Full Name
                          <SortIcon field="name" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">
                        <button
                          onClick={() => handleSort("created")}
                          className="inline-flex items-center gap-2 text-[var(--admin-color-ink-secondary)] hover:text-[var(--admin-color-ink-primary)]"
                        >
                          Created
                          <SortIcon field="created" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">
                        Last Activity
                      </th>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--admin-color-ink-tertiary)] sm:px-5">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((user) => {
                      const isCurrentUser = currentUserId === user.id;
                      const statusChip = getStatusChip(user.active);
                      const isSelected = selectedUser?.id === user.id;

                      return (
                        <tr
                          key={user.id}
                          className={`border-t border-[var(--admin-color-border)] align-top transition ${
                            isSelected ? 'bg-indigo-50' : 'hover:bg-[var(--admin-color-surface-1)]'
                          }`}
                        >
                          <td className="px-4 py-3 sm:px-5">
                            <button
                              type="button"
                              onClick={() => setSelectedUserId(user.id)}
                              className="flex items-start gap-3 text-left"
                            >
                              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--admin-color-brand-primary)] text-[11px] font-semibold text-white">
                                {getInitials(user.fullName)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-[var(--admin-color-ink-primary)]">
                                  {user.fullName}
                                </span>
                                <span className="block truncate text-xs text-[var(--admin-color-ink-secondary)]">
                                  {user.email}
                                </span>
                                {isCurrentUser ? (
                                  <span className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
                                    You
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </td>
                          <td className="px-4 py-3 text-sm sm:px-5">
                            <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${ROLE_TONE_CLASSES[user.role]}`}>
                              {ROLE_LABELS[user.role]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm sm:px-5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className={`inline-block h-2 w-2 rounded-full ${statusChip.dotClassName}`}></span>
                              <span className={`text-xs font-semibold ${statusChip.textClassName}`}>
                                {statusChip.label}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--admin-color-ink-secondary)] sm:px-5">
                            {formatDate(user.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-[var(--admin-color-ink-secondary)] sm:px-5">
                            {formatDate(user.updatedAt)}
                          </td>
                          <td className="px-4 py-3 text-sm sm:px-5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => setSelectedUserForRole(user)}
                                disabled={isCurrentUser}
                                className="rounded-md border border-[var(--admin-color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--admin-color-brand-primary)] hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Edit Role
                              </button>
                              <button
                                onClick={() => setSelectedUserId(user.id)}
                                className="rounded-md border border-[var(--admin-color-border)] px-2.5 py-1 text-xs font-semibold text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]"
                              >
                                View
                              </button>
                              {user.active ? (
                                <button
                                  onClick={() =>
                                    setSelectedUserForDeactivate(user)
                                  }
                                  disabled={isCurrentUser}
                                  className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    handleReactivate(user.id, user.fullName)
                                  }
                                  className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                >
                                  Reactivate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col items-start justify-between gap-3 border-t border-[var(--admin-color-border)] px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                <p className="text-sm text-[var(--admin-color-ink-secondary)]">
                  Showing {sortedUsers.length} of {users.length} users
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-md border border-[var(--admin-color-border)] px-3 py-1.5 text-sm font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="rounded-md bg-[var(--admin-color-surface-2)] px-3 py-1.5 text-sm font-semibold text-[var(--admin-color-ink-secondary)]">
                    Page {currentPage}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={sortedUsers.length < ITEMS_PER_PAGE}
                    className="rounded-md border border-[var(--admin-color-border)] px-3 py-1.5 text-sm font-medium text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="rounded-2xl border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] p-5 shadow-[var(--admin-shadow-sm)]">
          {selectedUser ? (
            <>
              <div className="mb-4 text-center">
                <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white">
                  {getInitials(selectedUser.fullName)}
                </span>
                <h2 className="admin-heading mt-3 text-lg font-bold text-[var(--admin-color-ink-primary)]">
                  {selectedUser.fullName}
                </h2>
                <p className="text-sm text-[var(--admin-color-ink-secondary)]">{selectedUser.email}</p>
              </div>

              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between border-b border-[var(--admin-color-border)] pb-1.5">
                  <dt className="text-[var(--admin-color-ink-secondary)]">Role</dt>
                  <dd className="font-semibold text-[var(--admin-color-ink-primary)]">{ROLE_LABELS[selectedUser.role]}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--admin-color-border)] pb-1.5">
                  <dt className="text-[var(--admin-color-ink-secondary)]">Timezone</dt>
                  <dd className="font-semibold text-[var(--admin-color-ink-primary)]">{selectedUser.timezone || 'UTC'}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--admin-color-border)] pb-1.5">
                  <dt className="text-[var(--admin-color-ink-secondary)]">Status</dt>
                  <dd className={`font-semibold ${selectedUser.active ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {selectedUser.active ? 'Active' : 'Inactive'}
                  </dd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--admin-color-border)] pb-1.5">
                  <dt className="text-[var(--admin-color-ink-secondary)]">Created</dt>
                  <dd className="text-right font-semibold text-[var(--admin-color-ink-primary)]">{formatDateWithTime(selectedUser.createdAt)}</dd>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--admin-color-border)] pb-1.5">
                  <dt className="text-[var(--admin-color-ink-secondary)]">Last Activity</dt>
                  <dd className="text-right font-semibold text-[var(--admin-color-ink-primary)]">{formatDateWithTime(selectedUser.updatedAt)}</dd>
                </div>
                <div className="flex items-center justify-between pb-1.5">
                  <dt className="text-[var(--admin-color-ink-secondary)]">Sessions</dt>
                  <dd className="font-semibold text-[var(--admin-color-ink-primary)]">1 active</dd>
                </div>
              </dl>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForRole(selectedUser)}
                  disabled={selectedUser.id === currentUserId}
                  className="h-9 w-full rounded-lg bg-[var(--admin-color-brand-primary)] text-sm font-semibold text-white transition hover:bg-[var(--admin-color-brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Edit User
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerPasswordReset(selectedUser)}
                  className="h-9 w-full rounded-lg border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] text-sm font-semibold text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => handleRevokeSessions(selectedUser)}
                  className="h-9 w-full rounded-lg border border-[var(--admin-color-border)] bg-[var(--admin-color-surface-0)] text-sm font-semibold text-[var(--admin-color-ink-secondary)] hover:bg-[var(--admin-color-surface-1)]"
                >
                  Revoke Sessions
                </button>
                {selectedUser.active ? (
                  <button
                    type="button"
                    onClick={() => setSelectedUserForDeactivate(selectedUser)}
                    disabled={selectedUser.id === currentUserId}
                    className="h-9 w-full rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Deactivate Account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleReactivate(selectedUser.id, selectedUser.fullName)}
                    className="h-9 w-full rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    Reactivate Account
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--admin-color-border)] bg-[var(--admin-color-surface-1)] px-4 py-8 text-center">
              <p className="text-sm text-[var(--admin-color-ink-secondary)]">Select a user to view details.</p>
            </div>
          )}
        </aside>
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
