import { Request } from 'express';

export function extractIpAddress(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    return first ?? null;
  }

  return req.ip ?? null;
}

export function extractUserAgent(req: Request): string | null {
  const userAgent = req.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : null;
}
