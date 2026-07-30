import { getAuthToken } from '@/lib/auth';

export interface ConfusionMatrixAnalyticsData {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  accuracy: number;
  lastRefreshedAt: string | null;
  generatedAt: string;
}

function getApiUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (!base || (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1')) {
    return pathname;
  }

  return `${base}${pathname}`;
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

export async function fetchConfusionMatrixAnalytics(requisitionId?: string): Promise<ConfusionMatrixAnalyticsData> {
  const query = requisitionId ? `?requisitionId=${encodeURIComponent(requisitionId)}` : '';
  const response = await fetch(getApiUrl(`/api/analytics/confusion-matrix${query}`), {
    method: 'GET',
    credentials: 'include',
    headers: authHeaders()
  });

  return handleResponse<ConfusionMatrixAnalyticsData>(response);
}
