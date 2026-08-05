import { getAuthToken } from '@/lib/auth';
import { buildApiUrl } from '@/lib/api/url';

export interface NoShowTrendData {
  date: string;
  scheduledCount: number;
  noShowCount: number;
  noShowRatePct: number;
}

export interface NoShowAnalyticsData {
  noShowRatePct: number;
  noShowCount: number;
  scheduledCount: number;
  trend30d: NoShowTrendData[];
  lastRefreshedAt: string | null;
  generatedAt: string;
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

export async function fetchNoShowAnalytics(requisitionId?: string): Promise<NoShowAnalyticsData> {
  const query = requisitionId ? `?requisitionId=${encodeURIComponent(requisitionId)}` : '';
  const response = await fetch(buildApiUrl(`/api/analytics/no-show${query}`), {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders()
  });

  return handleResponse<NoShowAnalyticsData>(response);
}
