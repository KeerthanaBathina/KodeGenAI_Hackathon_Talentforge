/**
 * Policy API service
 *
 * Client-side API methods for policy management endpoints
 */

import type {
  CreateScreeningThresholdInput,
  CreateScoringThresholdInput,
  CreateApprovalPolicyInput,
  ScreeningThreshold,
  ScoringThreshold,
  ApprovalPolicy,
  JobFamily,
  ApiErrorResponse,
  PolicyValidationError,
} from '@/types/policy';

// ============================================================================
// Error Handling
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = (await response.json()) as ApiErrorResponse;
    const message = error.error?.message || 'An error occurred';
    const details = error.error?.details || [];

    const err = new Error(message) as Error & { details?: string[] };
    err.details = details;
    throw err;
  }
  return response.json() as Promise<T>;
}

// ============================================================================
// Screening Thresholds
// ============================================================================

async function getActiveScreeningThreshold(): Promise<ScreeningThreshold> {
  const response = await fetch('/api/admin/screening-thresholds/active', {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<ScreeningThreshold>(response);
}

async function getScreeningThresholdHistory(
  limit: number = 50,
): Promise<{ thresholds: ScreeningThreshold[]; total: number }> {
  const response = await fetch(`/api/admin/screening-thresholds/history?limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse(response);
}

async function createScreeningThreshold(
  data: CreateScreeningThresholdInput,
): Promise<ScreeningThreshold> {
  const response = await fetch('/api/admin/screening-thresholds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ScreeningThreshold>(response);
}

// ============================================================================
// Scoring Thresholds
// ============================================================================

async function getJobFamilies(): Promise<JobFamily[]> {
  const response = await fetch('/api/job-families', {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch job families');
  }
  const data = (await response.json()) as { jobFamilies?: JobFamily[] } | JobFamily[];
  return Array.isArray(data) ? data : data.jobFamilies || [];
}

async function getScoringThresholds(
  jobFamilyId?: string,
): Promise<{ thresholds: ScoringThreshold[]; total: number }> {
  const url = jobFamilyId
    ? `/api/admin/scoring-thresholds?jobFamilyId=${jobFamilyId}`
    : '/api/admin/scoring-thresholds';

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse(response);
}

async function getEffectiveScoringThreshold(
  jobFamilyId: string,
): Promise<ScoringThreshold> {
  const response = await fetch(
    `/api/admin/scoring-thresholds/${jobFamilyId}/effective`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  return handleResponse<ScoringThreshold>(response);
}

async function getScoringThresholdHistory(
  jobFamilyId: string,
  limit: number = 50,
): Promise<{ versions: ScoringThreshold[]; total: number }> {
  const response = await fetch(
    `/api/admin/scoring-thresholds/${jobFamilyId}/history?limit=${limit}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  return handleResponse(response);
}

async function createScoringThreshold(
  data: CreateScoringThresholdInput,
): Promise<ScoringThreshold> {
  const response = await fetch('/api/admin/scoring-thresholds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ScoringThreshold>(response);
}

// ============================================================================
// Approval Policies
// ============================================================================

async function getApprovalPolicies(): Promise<{ policies: ApprovalPolicy[]; total: number }> {
  const response = await fetch('/api/admin/approval-policies', {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse(response);
}

async function getApprovalPoliciesHistory(
  limit: number = 50,
): Promise<{ policies: ApprovalPolicy[]; total: number }> {
  const response = await fetch(`/api/admin/approval-policies/history?limit=${limit}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse(response);
}

async function createApprovalPolicy(
  data: CreateApprovalPolicyInput,
): Promise<ApprovalPolicy> {
  const response = await fetch('/api/admin/approval-policies', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ApprovalPolicy>(response);
}

async function deactivateApprovalPolicy(policyId: string): Promise<ApprovalPolicy> {
  const response = await fetch(`/api/admin/approval-policies/${policyId}/deactivate`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<ApprovalPolicy>(response);
}

// ============================================================================
// Export Service Object
// ============================================================================

export const policyService = {
  // Screening Thresholds
  getActiveScreeningThreshold,
  getScreeningThresholdHistory,
  createScreeningThreshold,

  // Scoring Thresholds
  getJobFamilies,
  getScoringThresholds,
  getEffectiveScoringThreshold,
  getScoringThresholdHistory,
  createScoringThreshold,

  // Approval Policies
  getApprovalPolicies,
  getApprovalPoliciesHistory,
  createApprovalPolicy,
  deactivateApprovalPolicy,
};
