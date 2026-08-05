import { getAuthToken } from '@/lib/auth';
import { buildApiUrl } from '@/lib/api/url';

export interface PipelineAnalyticsData {
  totalApplications: number;
  shortlistRatePct: number;
  avgTimeToHireDays: number;
  offerAcceptanceRatePct: number;
  lastRefreshedAt: string | null;
  generatedAt: string;
}

export interface RequisitionOption {
  id: string;
  title: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = 'Request failed';

    try {
      const body = await response.json();
      message = body?.error?.message ?? body?.message ?? message;
    } catch {
      // Ignore parsing errors for non-JSON responses.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function authHeaders(): HeadersInit | undefined {
  const token = getAuthToken();
  if (!token) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

export async function fetchPipelineAnalytics(requisitionId?: string): Promise<PipelineAnalyticsData> {
  const query = requisitionId ? `?requisitionId=${encodeURIComponent(requisitionId)}` : '';
  const response = await fetch(buildApiUrl(`/api/analytics/pipeline${query}`), {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders()
  });

  return handleResponse<PipelineAnalyticsData>(response);
}

export async function fetchOpenRequisitions(): Promise<RequisitionOption[]> {
  const response = await fetch(buildApiUrl('/api/requisitions?page=1&pageSize=100&status=open'), {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders()
  });

  const payload = await handleResponse<{ data?: RequisitionOption[]; requisitions?: RequisitionOption[] }>(response);
  return payload.data ?? payload.requisitions ?? [];
}
