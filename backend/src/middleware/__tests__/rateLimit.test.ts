import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../rateLimiter', () => ({
  publicLimiter: {
    limit: vi.fn()
  },
  authLimiter: {
    limit: vi.fn()
  }
}));

import { rateLimitMiddleware } from '../rateLimit.middleware';
import { publicLimiter } from '../rateLimiter';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/test',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides
  } as unknown as Request;
}

function makeRes(): {
  res: Response;
  headers: Record<string, string>;
  getStatusCode: () => number | null;
  getBody: () => unknown;
} {
  const headers: Record<string, string> = {};
  let statusCode: number | null = null;
  let body: unknown = null;

  const res = {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: unknown) => {
      body = data;
    }
  } as unknown as Response;

  return {
    res,
    headers,
    getStatusCode: () => statusCode,
    getBody: () => body
  };
}

describe('rateLimitMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bypasses limiter for /health', async () => {
    const req = makeReq({ path: '/health' });
    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(publicLimiter.limit).not.toHaveBeenCalled();
  });

  it('bypasses limiter for /ready', async () => {
    const req = makeReq({ path: '/ready' });
    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(publicLimiter.limit).not.toHaveBeenCalled();
  });

  it('returns 429 and Retry-After when denied', async () => {
    vi.mocked(publicLimiter.limit).mockResolvedValueOnce({
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 30_000,
      pending: Promise.resolve()
    });

    const req = makeReq({ path: '/api/data' });
    const { res, headers, getStatusCode } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(getStatusCode()).toBe(429);
    expect(headers['Retry-After']).toBeDefined();
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('calls next for allowed request', async () => {
    vi.mocked(publicLimiter.limit).mockResolvedValueOnce({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve()
    });

    const req = makeReq({ path: '/api/data' });
    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('fails open when limiter throws', async () => {
    vi.mocked(publicLimiter.limit).mockRejectedValueOnce(new Error('Redis timeout'));

    const req = makeReq({ path: '/api/data' });
    const { res } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    await rateLimitMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
