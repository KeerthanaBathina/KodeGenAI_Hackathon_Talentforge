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
} from '@/types/policy';
import { buildApiUrl } from '@/lib/api/url';

// ============================================================================
// Error Handling
// ============================================================================

async function parseJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await parseJsonSafely<
      ApiErrorResponse & {
        message?: string;
        error?: {
          message?: string;
          details?: string[];
        };
      }
    >(response);
    const message = error?.error?.message || error?.message || 'An error occurred';
    const details = error?.error?.details || [];

    const err = new Error(message) as Error & { details?: string[] };
    err.details = details;
    throw err;
  }

  const payload = await parseJsonSafely<T>(response);
  if (payload === null) {
    throw new Error('Invalid API response payload');
  }

  return payload;
}

// ============================================================================
// Screening Thresholds
// ============================================================================

async function getActiveScreeningThreshold(): Promise<ScreeningThreshold> {
  const response = await fetch(buildApiUrl('/api/admin/screening-thresholds/active'), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse<ScreeningThreshold>(response);
}

async function getScreeningThresholdHistory(
  limit: number = 50,
): Promise<ScreeningThreshold[]> {
  const response = await fetch(buildApiUrl(`/api/admin/screening-thresholds/history?limit=${limit}`), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await handleResponse<{ thresholds?: ScreeningThreshold[] }>(response);
  return data.thresholds || [];
}

async function createScreeningThreshold(
  data: CreateScreeningThresholdInput,
): Promise<ScreeningThreshold> {
  const response = await fetch(buildApiUrl('/api/admin/screening-thresholds'), {
    method: 'POST',
    credentials: 'include',
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
  const response = await fetch(buildApiUrl('/api/job-families'), {
    credentials: 'include',
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

  const response = await fetch(buildApiUrl(url), {
    credentials: 'include',
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
    buildApiUrl(`/api/admin/scoring-thresholds/${jobFamilyId}/effective`),
    {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
  return handleResponse<ScoringThreshold>(response);
}

async function getScoringThresholdHistory(
  jobFamilyIdOrLimit?: string | number,
  limit: number = 50,
): Promise<ScoringThreshold[]> {
  if (typeof jobFamilyIdOrLimit === 'string') {
    const response = await fetch(
      buildApiUrl(`/api/admin/scoring-thresholds/${jobFamilyIdOrLimit}/history?limit=${limit}`),
      {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const data = await handleResponse<{ versions?: ScoringThreshold[] }>(response);
    return (data.versions || []).map((version) => ({
      ...version,
      jobFamilyId: version.jobFamilyId || jobFamilyIdOrLimit,
    }));
  }

  const effectiveLimit = typeof jobFamilyIdOrLimit === 'number' ? jobFamilyIdOrLimit : limit;
  const jobFamilies = await getJobFamilies();
  const histories = await Promise.all(
    jobFamilies.map(async (jobFamily) => {
      const response = await fetch(
        buildApiUrl(`/api/admin/scoring-thresholds/${jobFamily.id}/history?limit=${effectiveLimit}`),
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      const data = await handleResponse<{ versions?: ScoringThreshold[] }>(response);
      return (data.versions || []).map((version) => ({
        ...version,
        jobFamilyId: version.jobFamilyId || jobFamily.id,
      }));
    }),
  );

  return histories.flat();
}

async function createScoringThreshold(
  data: CreateScoringThresholdInput,
): Promise<ScoringThreshold> {
  const response = await fetch(buildApiUrl('/api/admin/scoring-thresholds'), {
    method: 'POST',
    credentials: 'include',
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
  const response = await fetch(buildApiUrl('/api/admin/approval-policies'), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return handleResponse(response);
}

async function getApprovalPoliciesHistory(
  limit: number = 50,
): Promise<ApprovalPolicy[]> {
  const response = await fetch(buildApiUrl(`/api/admin/approval-policies/history?limit=${limit}`), {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const data = await handleResponse<{ policies?: ApprovalPolicy[] }>(response);
  return data.policies || [];
}

async function createApprovalPolicy(
  data: CreateApprovalPolicyInput,
): Promise<ApprovalPolicy> {
  const response = await fetch(buildApiUrl('/api/admin/approval-policies'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse<ApprovalPolicy>(response);
}

async function deactivateApprovalPolicy(policyId: string): Promise<ApprovalPolicy> {
  const response = await fetch(buildApiUrl(`/api/admin/approval-policies/${policyId}/deactivate`), {
    method: 'PATCH',
    credentials: 'include',
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
