import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from '../securityHeaders';

function buildTestApp() {
  const app = express();
  app.use(buildSecurityHeaders());
  app.get('/test', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('buildSecurityHeaders', () => {
  it('sets Strict-Transport-Security with max-age 63072000', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['strict-transport-security']).toContain('max-age=63072000');
    expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(res.headers['strict-transport-security']).toContain('preload');
  });

  it('sets X-Frame-Options to DENY', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('sets X-Content-Type-Options to nosniff', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets Referrer-Policy to strict-origin', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['referrer-policy']).toBe('strict-origin');
  });

  it('sets Content-Security-Policy with default-src none', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('removes X-Powered-By header', async () => {
    const res = await request(buildTestApp()).get('/test');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
