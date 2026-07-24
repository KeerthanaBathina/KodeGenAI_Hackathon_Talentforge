import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import * as consentService from '../consentService';

describe('consentService', () => {
    let testCandidate: any;

    beforeEach(async () => {
        testCandidate = await prisma.candidate.create({
            data: {
                email: `consent-test-${Date.now()}@example.com`,
                fullName: 'Test User',
                phoneNumber: null,
                status: 'active',
            },
        });
    });

    afterEach(async () => {
        await prisma.privacyConsent.deleteMany({ where: { candidateId: testCandidate.id } });
        await prisma.candidate.delete({ where: { id: testCandidate.id } });
    });

    describe('recordConsent', () => {
        it('records consent with version and IP', async () => {
            const consent = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            expect(consent.candidateId).toBe(testCandidate.id);
            expect(consent.policyVersion).toBe('1.0');
            expect(consent.ipAddress).toBe('192.168.1.1');
            expect(consent.userAgent).toBe('Mozilla/5.0');
            expect(consent.acceptedAt).toBeInstanceOf(Date);
            expect(consent.revokedAt).toBeNull();
        });

        it('returns existing consent if already accepted (idempotent)', async () => {
            const first = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            const second = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            expect(first.id).toBe(second.id);
            expect(first.acceptedAt).toEqual(second.acceptedAt);
        });

        it('creates new consent record after previous was revoked', async () => {
            const first = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            await consentService.revokeConsent(testCandidate.id);

            const second = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            expect(second.id).not.toBe(first.id);
            expect(second.revokedAt).toBeNull();
        });

        it('records IP address and user agent correctly', async () => {
            const consent = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '203.0.113.42',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            );

            expect(consent.ipAddress).toBe('203.0.113.42');
            expect(consent.userAgent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        });
    });

    describe('getActiveConsent', () => {
        it('returns active consent when it exists', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            const active = await consentService.getActiveConsent(testCandidate.id);

            expect(active).not.toBeNull();
            expect(active?.candidateId).toBe(testCandidate.id);
            expect(active?.revokedAt).toBeNull();
        });

        it('returns null when no consent exists', async () => {
            const active = await consentService.getActiveConsent(testCandidate.id);

            expect(active).toBeNull();
        });

        it('returns null when consent was revoked', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            await consentService.revokeConsent(testCandidate.id);

            const active = await consentService.getActiveConsent(testCandidate.id);

            expect(active).toBeNull();
        });
    });

    describe('revokeConsent', () => {
        it('revokes consent and sets revokedAt timestamp', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            const revoked = await consentService.revokeConsent(testCandidate.id);

            expect(revoked.revokedAt).toBeInstanceOf(Date);
            expect(revoked.revokedAt).not.toBeNull();
        });

        it('throws error when no active consent to revoke', async () => {
            await expect(
                consentService.revokeConsent(testCandidate.id)
            ).rejects.toThrow('No active consent found to revoke');
        });

        it('cannot revoke already revoked consent', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            await consentService.revokeConsent(testCandidate.id);

            await expect(
                consentService.revokeConsent(testCandidate.id)
            ).rejects.toThrow('No active consent found to revoke');
        });
    });

    describe('hasActiveConsent', () => {
        it('returns true when active consent exists', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            const hasConsent = await consentService.hasActiveConsent(testCandidate.id);

            expect(hasConsent).toBe(true);
        });

        it('returns false when no consent exists', async () => {
            const hasConsent = await consentService.hasActiveConsent(testCandidate.id);

            expect(hasConsent).toBe(false);
        });

        it('returns false when consent was revoked', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            await consentService.revokeConsent(testCandidate.id);

            const hasConsent = await consentService.hasActiveConsent(testCandidate.id);

            expect(hasConsent).toBe(false);
        });
    });

    describe('getConsentHistory', () => {
        it('returns empty array when no consents exist', async () => {
            const history = await consentService.getConsentHistory(testCandidate.id);

            expect(history).toEqual([]);
        });

        it('returns all consents for candidate', async () => {
            await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            await consentService.revokeConsent(testCandidate.id);

            await consentService.recordConsent(
                testCandidate.id,
                '1.1',
                '192.168.1.2',
                'Chrome/91.0'
            );

            const history = await consentService.getConsentHistory(testCandidate.id);

            expect(history).toHaveLength(2);
            expect(history[0].policyVersion).toBe('1.1');
            expect(history[0].revokedAt).toBeNull();
            expect(history[1].policyVersion).toBe('1.0');
            expect(history[1].revokedAt).not.toBeNull();
        });

        it('orders history by most recent first', async () => {
            const first = await consentService.recordConsent(
                testCandidate.id,
                '1.0',
                '192.168.1.1',
                'Mozilla/5.0'
            );

            await new Promise((resolve) => setTimeout(resolve, 10));

            await consentService.revokeConsent(testCandidate.id);

            const second = await consentService.recordConsent(
                testCandidate.id,
                '1.1',
                '192.168.1.2',
                'Chrome/91.0'
            );

            const history = await consentService.getConsentHistory(testCandidate.id);

            expect(history[0].id).toBe(second.id);
            expect(history[1].id).toBe(first.id);
        });
    });

    describe('getCurrentPolicyVersion', () => {
        it('returns policy version from environment', () => {
            const version = consentService.getCurrentPolicyVersion();

            expect(version).toBe('1.0');
            expect(typeof version).toBe('string');
        });
    });
});
