import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
    resumeFindUnique: vi.fn(),
    resumeUpdate: vi.fn(),
    profileFindUnique: vi.fn(),
    profileUpdate: vi.fn(),
    profileCreate: vi.fn(),
    privacyConsentFindFirst: vi.fn(),
    applicationFindUnique: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
    auditEvent: vi.fn(),
    calculateProfileCompletion: vi.fn(),
    enqueueScreening: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
    default: {
        resume: {
            findUnique: prismaMocks.resumeFindUnique,
            update: prismaMocks.resumeUpdate,
        },
        profile: {
            findUnique: prismaMocks.profileFindUnique,
            update: prismaMocks.profileUpdate,
            create: prismaMocks.profileCreate,
        },
        privacyConsent: {
            findFirst: prismaMocks.privacyConsentFindFirst,
        },
        application: {
            findUnique: prismaMocks.applicationFindUnique,
        },
    },
}));

vi.mock('../auditService', () => ({
    auditEvent: serviceMocks.auditEvent,
}));

vi.mock('../profileService', () => ({
    calculateProfileCompletion: serviceMocks.calculateProfileCompletion,
}));

vi.mock('../../queues/screeningQueue', () => ({
    enqueueScreening: serviceMocks.enqueueScreening,
}));

vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import { ParseResultError, processParseResult } from '../parseResultService';

function createParsedPayload() {
    return {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '555-1234',
        skills: ['Python', 'React', 'PostgreSQL'],
        experience_years: 5,
        employers: [{ name: 'Acme Corp', title: 'Senior Engineer' }],
        education: [
            { degree: 'Bachelor', field: 'Computer Science', institution: 'MIT' },
        ],
        extracted_at: new Date().toISOString(),
    };
}

function createResumeFixture() {
    return {
        id: 'resume-1',
        applicationId: 'application-1',
        scanResult: {
            parsingStatus: 'queued',
        },
        application: {
            id: 'application-1',
            candidateId: 'candidate-1',
            candidate: {
                email: 'candidate@example.com',
            },
        },
    };
}

describe('ParseResultService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        serviceMocks.calculateProfileCompletion.mockResolvedValue({
            completedSections: ['basic_info'],
            percentage: 20,
            missingFields: ['Skills'],
        });
        prismaMocks.resumeUpdate.mockResolvedValue({ id: 'resume-1' });
        prismaMocks.profileUpdate.mockResolvedValue({ id: 'profile-1' });
        prismaMocks.profileCreate.mockResolvedValue({ id: 'profile-1' });
        prismaMocks.applicationFindUnique.mockResolvedValue({ status: 'submitted' });
        serviceMocks.auditEvent.mockResolvedValue(undefined);
        serviceMocks.enqueueScreening.mockResolvedValue(null);
    });

    describe('processParseResult', () => {
        it('stages parsed data and defers profile population when consent is missing', async () => {
            prismaMocks.resumeFindUnique.mockResolvedValue(createResumeFixture());
            prismaMocks.privacyConsentFindFirst.mockResolvedValue(null);

            await processParseResult({
                resumeId: 'resume-1',
                status: 'success',
                parsedData: createParsedPayload(),
            });

            expect(prismaMocks.resumeUpdate).toHaveBeenCalledWith({
                where: { id: 'resume-1' },
                data: expect.objectContaining({
                    parsedData: expect.any(Object),
                    scanResult: expect.objectContaining({
                        parsingStatus: 'completed',
                        parsePopulationStatus: 'pending_consent',
                    }),
                }),
            });
            expect(prismaMocks.profileFindUnique).not.toHaveBeenCalled();
            expect(prismaMocks.profileUpdate).not.toHaveBeenCalled();
            expect(prismaMocks.profileCreate).not.toHaveBeenCalled();
            expect(serviceMocks.enqueueScreening).not.toHaveBeenCalled();
            expect(serviceMocks.auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'resume.parsed',
                    metadata: expect.objectContaining({
                        profilePopulationDeferred: true,
                        profilePopulated: false,
                    }),
                })
            );
        });

        it('applies profile sync immediately when active consent exists', async () => {
            prismaMocks.resumeFindUnique.mockResolvedValue(createResumeFixture());
            prismaMocks.privacyConsentFindFirst.mockResolvedValue({ id: 'consent-1' });
            prismaMocks.profileFindUnique.mockResolvedValue({
                id: 'profile-1',
                fullName: 'candidate@example.com',
                experienceYears: 0,
                education: [],
                workHistory: [],
                skills: ['React'],
                rawParseJson: {},
            });

            await processParseResult({
                resumeId: 'resume-1',
                status: 'success',
                parsedData: createParsedPayload(),
            });

            expect(prismaMocks.profileUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'profile-1' },
                    data: expect.objectContaining({
                        skills: expect.arrayContaining(['React', 'Python', 'PostgreSQL']),
                        rawParseJson: expect.objectContaining({
                            latestResumeId: 'resume-1',
                        }),
                    }),
                })
            );
            expect(prismaMocks.resumeUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'resume-1' },
                    data: expect.objectContaining({
                        scanResult: expect.objectContaining({
                            parsePopulationStatus: 'applied',
                        }),
                    }),
                })
            );
            expect(serviceMocks.auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'profile.resume_skills_synced',
                })
            );
            expect(serviceMocks.auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'resume.parsed',
                    metadata: expect.objectContaining({
                        profilePopulationDeferred: false,
                        profilePopulated: true,
                    }),
                })
            );
        });

        it('does not enqueue screening when the application is still a draft', async () => {
            prismaMocks.resumeFindUnique.mockResolvedValue(createResumeFixture());
            prismaMocks.privacyConsentFindFirst.mockResolvedValue({ id: 'consent-1' });
            prismaMocks.profileFindUnique.mockResolvedValue({
                id: 'profile-1',
                fullName: 'candidate@example.com',
                experienceYears: 0,
                education: [],
                workHistory: [],
                skills: ['React'],
                rawParseJson: {},
            });
            prismaMocks.applicationFindUnique.mockResolvedValue({ status: 'draft' });

            await processParseResult({
                resumeId: 'resume-1',
                status: 'success',
                parsedData: createParsedPayload(),
            });

            await new Promise<void>((resolve) => {
                setImmediate(() => resolve());
            });

            expect(serviceMocks.enqueueScreening).not.toHaveBeenCalled();
        });

        it('updates parse failure details when parsing fails', async () => {
            prismaMocks.resumeFindUnique.mockResolvedValue({
                ...createResumeFixture(),
                scanResult: {},
            });

            await processParseResult({
                resumeId: 'resume-1',
                status: 'failed',
                error: 'Timeout parsing PDF',
            });

            expect(prismaMocks.resumeUpdate).toHaveBeenCalledWith({
                where: { id: 'resume-1' },
                data: expect.objectContaining({
                    scanResult: expect.objectContaining({
                        parsingStatus: 'failed',
                        parseError: 'Timeout parsing PDF',
                    }),
                }),
            });
        });

        it('throws ParseResultError when resume does not exist', async () => {
            prismaMocks.resumeFindUnique.mockResolvedValue(null);

            await expect(
                processParseResult({
                    resumeId: 'missing-resume',
                    status: 'success',
                    parsedData: createParsedPayload(),
                })
            ).rejects.toBeInstanceOf(ParseResultError);
        });
    });
});
