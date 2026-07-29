/**
 * User type definitions for admin user management
 * Defines domain models, enums, and API contracts
 */

export enum UserRole {
  candidate = "candidate",
  recruiter = "recruiter",
  hr_reviewer = "hr_reviewer",
  hr_manager = "hr_manager",
  tech_interviewer = "tech_interviewer",
  admin = "admin",
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.candidate]: "Candidate",
  [UserRole.recruiter]: "Recruiter",
  [UserRole.hr_reviewer]: "HR Reviewer",
  [UserRole.hr_manager]: "HR Manager",
  [UserRole.tech_interviewer]: "Tech Interviewer",
  [UserRole.admin]: "Administrator",
};

export interface User {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
  timezone: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  role: UserRole;
  timezone?: string;
}

export interface CreateUserResponse {
  user: User;
  temporaryPassword: string;
}

export interface UpdateUserRoleInput {
  newRole: UserRole;
}

export interface UserFilters {
  role?: UserRole;
  active?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedUsers {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export type UserStatus = "active" | "inactive" | "all";

/**
 * API error response shape
 */
export interface ApiErrorResponse {
  status: number;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}
