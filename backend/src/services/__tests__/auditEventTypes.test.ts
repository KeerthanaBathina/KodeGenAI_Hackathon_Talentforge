import { describe, expect, it } from 'vitest';
import {
  AUDIT_EVENT_TYPE_LIST,
  AUDIT_EVENT_TYPES,
  CANONICAL_AUDIT_EVENT_PATTERN,
  isRegisteredAuditEventType,
  resolveCanonicalAuditEventType
} from '../../constants/auditEventTypes';

describe('auditEventTypes', () => {
  it('defines at least 20 canonical event types', () => {
    expect(AUDIT_EVENT_TYPE_LIST.length).toBeGreaterThanOrEqual(20);
  });

  it('enforces canonical domain.action naming', () => {
    for (const eventType of AUDIT_EVENT_TYPE_LIST) {
      expect(eventType).toMatch(CANONICAL_AUDIT_EVENT_PATTERN);
    }
  });

  it('maps legacy event names to canonical taxonomy', () => {
    expect(resolveCanonicalAuditEventType('privacy_consent_accepted').eventType).toBe(
      AUDIT_EVENT_TYPES.PRIVACY_CONSENT_ACCEPTED
    );
    expect(resolveCanonicalAuditEventType('APPROVAL_CHAIN_INITIATED').eventType).toBe(
      AUDIT_EVENT_TYPES.DECISION_APPROVAL_CHAIN_INITIATED
    );
    expect(resolveCanonicalAuditEventType('threshold.version_created').eventType).toBe(
      AUDIT_EVENT_TYPES.CONFIG_THRESHOLD_VERSION_CREATED
    );
  });

  it('normalizes unknown event names into canonical shape', () => {
    const normalized = resolveCanonicalAuditEventType('RETRY_POLICY_VIOLATION');

    expect(normalized.eventType).toBe('retry.policy_violation');
    expect(normalized.wasMapped).toBe(true);
    expect(normalized.isRegistered).toBe(false);
  });

  it('detects registered canonical event names', () => {
    expect(isRegisteredAuditEventType(AUDIT_EVENT_TYPES.AUTH_LOGIN)).toBe(true);
    expect(isRegisteredAuditEventType('custom.unknown_event')).toBe(false);
  });
});