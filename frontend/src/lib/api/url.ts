const LOCAL_API_FALLBACK = 'http://localhost:3001';

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function resolveApiBaseUrl(): string {
  const configuredBase = process.env.NEXT_PUBLIC_API_URL?.trim() ?? '';
  if (configuredBase.length > 0) {
    return trimTrailingSlash(configuredBase);
  }

  if (typeof window !== 'undefined' && isLocalHostname(window.location.hostname)) {
    return LOCAL_API_FALLBACK;
  }

  return '';
}

export function buildApiUrl(pathname: string): string {
  if (/^https?:\/\//i.test(pathname)) {
    return pathname;
  }

  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const base = resolveApiBaseUrl();

  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function resolveSocketBaseUrl(): string {
  const configuredSocketBase = process.env.NEXT_PUBLIC_WS_URL?.trim() ?? '';
  if (configuredSocketBase.length > 0) {
    return trimTrailingSlash(configuredSocketBase);
  }

  const apiBase = resolveApiBaseUrl();
  if (apiBase.length > 0) {
    return apiBase;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return '';
}