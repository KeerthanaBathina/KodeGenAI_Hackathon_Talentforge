import type { NextFunction, Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpsRedirect } from '../httpsRedirect';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    path: '/api/test',
    originalUrl: '/api/test',
    hostname: 'api.example.com',
    headers: {},
    ...overrides
  } as unknown as Request;
}

function makeRes(): {
  res: Response;
  isRedirected: () => boolean;
  getRedirectArgs: () => [number, string] | null;
} {
  let redirectCalled = false;
  let redirectArgs: [number, string] | null = null;

  const res = {
    redirect: (status: number, url: string) => {
      redirectCalled = true;
      redirectArgs = [status, url];
    }
  } as unknown as Response;

  return {
    res,
    isRedirected: () => redirectCalled,
    getRedirectArgs: () => redirectArgs
  };
}

describe('httpsRedirect', () => {
  const originalEnv = process.env['NODE_ENV'];

  afterEach(() => {
    process.env['NODE_ENV'] = originalEnv;
  });

  it('is a no-op in development', () => {
    process.env['NODE_ENV'] = 'development';

    const req = makeReq({
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.example.com'
      }
    });
    const { res, isRedirected } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    httpsRedirect(req, res, next);

    expect(isRedirected()).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('redirects HTTP to HTTPS with 301 in production', () => {
    process.env['NODE_ENV'] = 'production';

    const req = makeReq({
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.example.com'
      },
      originalUrl: '/api/jobs'
    });
    const { res, isRedirected, getRedirectArgs } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    httpsRedirect(req, res, next);

    expect(isRedirected()).toBe(true);
    expect(getRedirectArgs()).toEqual([301, 'https://api.example.com/api/jobs']);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not redirect HTTPS requests', () => {
    process.env['NODE_ENV'] = 'production';

    const req = makeReq({
      headers: {
        'x-forwarded-proto': 'https',
        host: 'api.example.com'
      }
    });
    const { res, isRedirected } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    httpsRedirect(req, res, next);

    expect(isRedirected()).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('exempts /health from redirect in production', () => {
    process.env['NODE_ENV'] = 'production';

    const req = makeReq({
      path: '/health',
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.example.com'
      }
    });
    const { res, isRedirected } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    httpsRedirect(req, res, next);

    expect(isRedirected()).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });

  it('exempts /ready from redirect in production', () => {
    process.env['NODE_ENV'] = 'production';

    const req = makeReq({
      path: '/ready',
      headers: {
        'x-forwarded-proto': 'http',
        host: 'api.example.com'
      }
    });
    const { res, isRedirected } = makeRes();
    const next = vi.fn() as unknown as NextFunction;

    httpsRedirect(req, res, next);

    expect(isRedirected()).toBe(false);
    expect(next).toHaveBeenCalledOnce();
  });
});
