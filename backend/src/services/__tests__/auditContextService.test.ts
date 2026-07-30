import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import {
  buildAuditContext,
  buildAuditContextFromRequest,
  buildServiceAuditContext
} from '../auditContextService';

function toRequest(partial: Partial<Request>): Request {
  return partial as Request;
}

describe('auditContextService', () => {
  it('extracts actor and request metadata from an HTTP request', () => {
    const req = toRequest({
      headers: {
        'x-forwarded-for': '203.0.113.10, 198.51.100.11',
        'user-agent': 'Mozilla/5.0'
      },
      ip: '::ffff:10.0.0.1',
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@example.com',
        role: 'admin'
      }
    });

    const context = buildAuditContextFromRequest(req);

    expect(context).toEqual({
      actorId: '11111111-1111-1111-1111-111111111111',
      actorRole: 'admin',
      actorEmail: 'admin@example.com',
      ipAddress: '203.0.113.10',
      userAgent: 'Mozilla/5.0'
    });
  });

  it('uses request ip when x-forwarded-for header is absent', () => {
    const req = toRequest({
      headers: {
        'user-agent': 'Vitest/1.0'
      },
      ip: '::ffff:192.0.2.44'
    });

    const context = buildAuditContextFromRequest(req);
    expect(context.ipAddress).toBe('192.0.2.44');
  });

  it('supports service-level context without request object', () => {
    const context = buildServiceAuditContext({
      actorId: 'system-scheduler',
      actorRole: 'system',
      actorEmail: 'system@internal.local',
      ipAddress: '127.0.0.1',
      userAgent: 'worker/1.0'
    });

    expect(context).toEqual({
      actorId: 'system-scheduler',
      actorRole: 'system',
      actorEmail: 'system@internal.local',
      ipAddress: '127.0.0.1',
      userAgent: 'worker/1.0'
    });
  });

  it('allows explicit overrides to win over request-derived values', () => {
    const req = toRequest({
      headers: {
        'x-forwarded-for': '198.51.100.22',
        'user-agent': 'Mozilla/5.0'
      },
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'admin@example.com',
        role: 'admin'
      }
    });

    const context = buildAuditContext({
      req,
      actorId: '22222222-2222-2222-2222-222222222222',
      actorRole: 'recruiter',
      ipAddress: '203.0.113.80'
    });

    expect(context.actorId).toBe('22222222-2222-2222-2222-222222222222');
    expect(context.actorRole).toBe('recruiter');
    expect(context.ipAddress).toBe('203.0.113.80');
    expect(context.actorEmail).toBe('admin@example.com');
  });

  it('normalizes empty override strings to null', () => {
    const context = buildAuditContext({
      actorId: ' ',
      actorRole: '',
      ipAddress: '   '
    });

    expect(context.actorId).toBeNull();
    expect(context.actorRole).toBeNull();
    expect(context.ipAddress).toBeNull();
  });
});