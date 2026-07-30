---
id: task_003
us_id: us_005
epic: EP-001
title: "Implement Privacy Consent Service with Version and IP Tracking"
status: done
layer: backend
effort: 2h
priority: high
created: 2026-07-24
completed: 2026-07-24
---

# TASK-003 — Implement Privacy Consent Service with Version and IP Tracking

## Context

**User Story**: US-005 — Candidate Profile CRUD with Onboarding Checklist and Consent Management  
**Epic**: EP-001 — Candidate Onboarding and Identity  
**Addresses Acceptance Criteria**: Scenario 3 (privacy consent recorded with timestamp and version)

Explicit privacy consent must be recorded separately with policy version, acceptance timestamp, IP address, and user agent for GDPR compliance. Candidates can revoke consent, and the system must track the latest active consent.

---

## Objective

Create a service that:
- Records privacy policy acceptance with version, timestamp, and IP
- Retrieves latest active consent for a candidate
- Revokes consent (sets `revokedAt` timestamp)
- Validates consent state for profile completion checks
- Logs all consent actions to audit_events

---

## Technical Specifications

| Function | Input | Output | Side Effects |
|----------|-------|--------|--------------|
| `recordConsent` | candidateId, version, IP, userAgent | PrivacyConsent | Creates consent record, logs audit |
| `getActiveConsent` | candidateId | PrivacyConsent \| null | Read-only |
| `revokeConsent` | candidateId, actorId | boolean | Sets revokedAt, logs audit |
| `hasActiveConsent` | candidateId | boolean | Quick check for profile completion |
| `getConsentHistory` | candidateId | PrivacyConsent[] | Returns all consent records |

**Current Policy Version**: `1.0` (stored in environment or config)

---

## Implementation Steps

### Step 1 — Create Consent Service

Create `backend/src/services/consentService.ts`:

```typescript
import prisma from '../db/prisma';
import { auditService } from './auditService';
import logger from '../utils/logger';
import env from '../config/env';

export class ConsentError extends Error {
  constructor(
    message: string,
    public code: 'CANDIDATE_NOT_FOUND' | 'CONSENT_NOT_FOUND' | 'ALREADY_CONSENTED'
  ) {
    super(message);
    this.name = 'ConsentError';
  }
}

const CURRENT_POLICY_VERSION = env.PRIVACY_POLICY_VERSION || '1.0';

/**
 * Record privacy policy acceptance for a candidate.
 * Creates a new consent record with version, timestamp, and IP tracking.
 */
export async function recordConsent(
  candidateId: string,
  policyVersion: string,
  ipAddress: string,
  userAgent?: string
): Promise<any> {
  // Verify candidate exists
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, email: true },
  });

  if (!candidate) {
    throw new ConsentError('Candidate not found', 'CANDIDATE_NOT_FOUND');
  }

  // Check if already consented to this version
  const existingConsent = await prisma.privacyConsent.findFirst({
    where: {
      candidateId,
      policyVersion,
      revokedAt: null,
    },
  });

  if (existingConsent) {
    logger.info({ candidateId, policyVersion }, 'Candidate already consented to this policy version');
    return existingConsent;
  }

  // Create consent record
  const consent = await prisma.privacyConsent.create({
    data: {
      candidateId,
      policyVersion,
      ipAddress,
      userAgent,
    },
  });

  // Audit log
  await auditService.logEvent({
    eventType: 'privacy_consent_accepted',
    actorId: candidateId,
    actorRole: 'candidate',
    resourceType: 'privacy_consent',
    resourceId: consent.id,
    metadata: {
      candidateId,
      policyVersion,
      ipAddress,
    },
  });

  logger.info({ candidateId, policyVersion, consentId: consent.id }, 'Privacy consent recorded');

  return consent;
}

/**
 * Get the latest active consent for a candidate.
 * Returns null if no active consent exists.
 */
export async function getActiveConsent(candidateId: string): Promise<any | null> {
  const consent = await prisma.privacyConsent.findFirst({
    where: {
      candidateId,
      revokedAt: null,
    },
    orderBy: {
      acceptedAt: 'desc',
    },
  });

  return consent;
}

/**
 * Revoke privacy consent for a candidate.
 * Sets revokedAt timestamp and logs the action.
 */
export async function revokeConsent(
  candidateId: string,
  actorId: string,
  ipAddress?: string
): Promise<boolean> {
  const consent = await getActiveConsent(candidateId);

  if (!consent) {
    throw new ConsentError('No active consent found', 'CONSENT_NOT_FOUND');
  }

  await prisma.privacyConsent.update({
    where: { id: consent.id },
    data: {
      revokedAt: new Date(),
    },
  });

  // Audit log
  await auditService.logEvent({
    eventType: 'privacy_consent_revoked',
    actorId,
    actorRole: actorId === candidateId ? 'candidate' : 'admin',
    resourceType: 'privacy_consent',
    resourceId: consent.id,
    metadata: {
      candidateId,
      policyVersion: consent.policyVersion,
    },
    ipAddress,
  });

  logger.info({ candidateId, consentId: consent.id }, 'Privacy consent revoked');

  return true;
}

/**
 * Check if candidate has active consent (for profile completion checks).
 */
export async function hasActiveConsent(candidateId: string): Promise<boolean> {
  const consent = await getActiveConsent(candidateId);
  return consent !== null;
}

/**
 * Get full consent history for a candidate (accepted and revoked).
 */
export async function getConsentHistory(candidateId: string): Promise<any[]> {
  const consents = await prisma.privacyConsent.findMany({
    where: { candidateId },
    orderBy: {
      acceptedAt: 'desc',
    },
  });

  return consents;
}

/**
 * Get current policy version (from environment or config).
 */
export function getCurrentPolicyVersion(): string {
  return CURRENT_POLICY_VERSION;
}
```

### Step 2 — Add Environment Variable

Update `backend/src/config/env.ts`:

```typescript
export default {
  // ... existing vars ...
  
  PRIVACY_POLICY_VERSION: process.env.PRIVACY_POLICY_VERSION || '1.0',
};
```

Update `.env.example`:
```bash
# Privacy Policy
PRIVACY_POLICY_VERSION=1.0
```

---

## Acceptance Criteria

- [x] `consentService.ts` created with record, get, revoke, and check functions
- [x] Consent records include policyVersion, acceptedAt, ipAddress, userAgent
- [x] Duplicate consent for same version returns existing record (idempotent)
- [x] Revoke sets `revokedAt` timestamp without deleting record
- [x] `hasActiveConsent` returns boolean for profile completion checks
- [x] All consent actions logged to `audit_events` table
- [x] Current policy version configurable via environment variable

---

## Dependencies

- TASK-001 (PrivacyConsent schema)
- auditService for event logging

## Testing Notes

Unit tests should cover:
```typescript
describe('consentService', () => {
  it('records consent with version and IP');
  it('returns existing consent if already accepted');
  it('returns latest active consent');
  it('revokes consent and sets revokedAt');
  it('returns false for hasActiveConsent after revocation');
  it('returns full history including revoked consents');
});
```
