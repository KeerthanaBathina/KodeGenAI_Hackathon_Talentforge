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
