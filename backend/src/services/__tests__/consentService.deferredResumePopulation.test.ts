import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
    candidateFindUnique: vi.fn(),
    privacyConsentFindFirst: vi.fn(),
    privacyConsentCreate: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
    logEvent: vi.fn(),
    applyLatestParsedResumeToProfile: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
    default: {
        candidate: {
            findUnique: prismaMocks.candidateFindUnique,
        },
        privacyConsent: {
            findFirst: prismaMocks.privacyConsentFindFirst,
            create: prismaMocks.privacyConsentCreate,
        },
    },
}));

vi.mock('../auditService', () => ({
    auditService: {
        logEvent: serviceMocks.logEvent,
    },
}));

vi.mock('../parseResultService', () => ({
    applyLatestParsedResumeToProfile: serviceMocks.applyLatestParsedResumeToProfile,
}));

vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import { ConsentError, recordConsent } from '../consentService';

describe('consentService deferred resume profile population', () => {
    let setImmediateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();

        setImmediateSpy = vi
            .spyOn(global, 'setImmediate')
            .mockImplementation(((callback: (...args: unknown[]) => void, ...args: unknown[]) => {
                callback(...args);
                return {} as NodeJS.Immediate;
            }) as typeof setImmediate);

        prismaMocks.candidateFindUnique.mockResolvedValue({
            id: 'candidate-1',
            email: 'candidate@example.com',
        });
        serviceMocks.logEvent.mockResolvedValue(undefined);
        serviceMocks.applyLatestParsedResumeToProfile.mockResolvedValue({
            status: 'no_parsed_resume',
        });
    });

    afterEach(() => {
        setImmediateSpy.mockRestore();
    });

    it('triggers deferred population when consent already exists for the policy version', async () => {
        const existingConsent = {
            id: 'consent-1',
            candidateId: 'candidate-1',
            policyVersion: '1.0',
            revokedAt: null,
        };
        prismaMocks.privacyConsentFindFirst.mockResolvedValue(existingConsent);

        const result = await recordConsent(
            'candidate-1',
            '1.0',
            '127.0.0.1',
            'test-agent'
        );

        expect(result).toEqual(existingConsent);
        expect(prismaMocks.privacyConsentCreate).not.toHaveBeenCalled();
        expect(serviceMocks.logEvent).not.toHaveBeenCalled();
        expect(serviceMocks.applyLatestParsedResumeToProfile).toHaveBeenCalledWith(
            'candidate-1',
            'consent_accept'
        );
    });

    it('creates consent and triggers deferred population for new acceptance', async () => {
        prismaMocks.privacyConsentFindFirst.mockResolvedValue(null);
        prismaMocks.privacyConsentCreate.mockResolvedValue({
            id: 'consent-2',
            candidateId: 'candidate-1',
            policyVersion: '1.0',
            ipAddress: '127.0.0.1',
            userAgent: 'test-agent',
        });

        const result = await recordConsent(
            'candidate-1',
            '1.0',
            '127.0.0.1',
            'test-agent'
        );

        expect(result.id).toBe('consent-2');
        expect(prismaMocks.privacyConsentCreate).toHaveBeenCalledWith({
            data: {
                candidateId: 'candidate-1',
                policyVersion: '1.0',
                ipAddress: '127.0.0.1',
                userAgent: 'test-agent',
            },
        });
        expect(serviceMocks.logEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: 'privacy_consent_accepted',
                actorId: 'candidate-1',
            })
        );
        expect(serviceMocks.applyLatestParsedResumeToProfile).toHaveBeenCalledWith(
            'candidate-1',
            'consent_accept'
        );
    });

    it('throws candidate not found and does not trigger deferred population', async () => {
        prismaMocks.candidateFindUnique.mockResolvedValue(null);

        await expect(
            recordConsent('missing-candidate', '1.0', '127.0.0.1')
        ).rejects.toBeInstanceOf(ConsentError);

        expect(serviceMocks.applyLatestParsedResumeToProfile).not.toHaveBeenCalled();
        expect(setImmediateSpy).not.toHaveBeenCalled();
    });
});
