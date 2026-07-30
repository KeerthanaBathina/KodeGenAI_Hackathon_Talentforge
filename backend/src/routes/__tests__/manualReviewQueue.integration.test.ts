import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getManualReviewQueue: vi.fn(),
    getDecisionReasonCodes: vi.fn(),
    markAsReviewed: vi.fn(),
    overrideApplicationPath: vi.fn(),
    bulkRejectApplications: vi.fn(),
    InvalidReasonCodeError: class InvalidReasonCodeError extends Error {},
    ApplicationDecisionLockedError: class ApplicationDecisionLockedError extends Error {},
    InvalidPathOverrideError: class InvalidPathOverrideError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.code = code;
            this.name = 'InvalidPathOverrideError';
        }
    },
}));

vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, _res: any, next: any) => {
        req.user = {
            id: 'user-1',
            email: 'hr@example.com',
            role: (req.headers['x-test-role'] as string) || 'hr_reviewer',
        };
        next();
    },
}));

vi.mock('../../middleware/authorize', () => ({
    authorize: (allowedRoles: string[]) => (req: any, res: any, next: any) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                error: {
                    code: 'FORBIDDEN',
                    message: 'You do not have permission to access this resource',
                },
            });
            return;
        }

        next();
    },
}));

vi.mock('../../services/manualReviewQueueService', () => ({
    ManualReviewQueueService: {
        getManualReviewQueue: mocks.getManualReviewQueue,
        getManualReviewQueueStats: vi.fn(),
        getDecisionReasonCodes: mocks.getDecisionReasonCodes,
        markAsReviewed: mocks.markAsReviewed,
        overrideApplicationPath: mocks.overrideApplicationPath,
        bulkRejectApplications: mocks.bulkRejectApplications,
    },
    InvalidReasonCodeError: mocks.InvalidReasonCodeError,
    ApplicationDecisionLockedError: mocks.ApplicationDecisionLockedError,
    InvalidPathOverrideError: mocks.InvalidPathOverrideError,
}));

import manualReviewQueueRouter from '../manualReviewQueue';

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/manual-review-queue', manualReviewQueueRouter);
    return app;
}

describe('manual review queue API integration tests', () => {
    beforeEach(() => {
        mocks.getManualReviewQueue.mockReset();
        mocks.getDecisionReasonCodes.mockReset();
        mocks.markAsReviewed.mockReset();
        mocks.overrideApplicationPath.mockReset();
        mocks.bulkRejectApplications.mockReset();
    });

    it('forwards filters and returns SLA + decision metadata fields', async () => {
        mocks.getManualReviewQueue.mockResolvedValue({
            items: [
                {
                    id: 'app-1',
                    candidateId: 'cand-1',
                    candidateName: 'Alex Jordan',
                    candidateEmail: 'alex@example.com',
                    requisitionId: 'req-1',
                    requisitionTitle: 'Backend Engineer',
                    requisitionDepartment: 'Engineering',
                    status: 'pending_review',
                    manualReviewReason: 'low_confidence',
                    submittedAt: new Date('2026-07-24T08:00:00.000Z'),
                    screeningScore: 88,
                    screeningConfidence: 0.74,
                    path: 'experienced',
                    pathOverridden: false,
                    slaDeadlineAt: '2026-07-26T08:00:00.000Z',
                    slaRemainingSeconds: 7200,
                    slaElapsedPercent: 95,
                    slaSeverity: 'red',
                    isUrgent: true,
                    canShortlist: true,
                    canReject: true,
                    decisionLocked: false,
                },
            ],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
        });

        const app = createTestApp();
        const response = await request(app).get('/api/manual-review-queue').query({
            department: 'Engineering',
            scoreBand: 'high',
            status: 'pending_review',
            requisitionId: '0d74d0fd-2cb9-4a40-9397-6e5bcdbf229a',
            sortBy: 'sla',
            sortDir: 'asc',
            page: '1',
            limit: '10',
        });

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0]).toMatchObject({
            candidateName: 'Alex Jordan',
            requisitionTitle: 'Backend Engineer',
            screeningScore: 88,
            slaDeadlineAt: '2026-07-26T08:00:00.000Z',
            slaRemainingSeconds: 7200,
            slaElapsedPercent: 95,
            slaSeverity: 'red',
            isUrgent: true,
            canShortlist: true,
            canReject: true,
            decisionLocked: false,
            path: 'experienced',
            pathOverridden: false,
        });

        expect(mocks.getManualReviewQueue).toHaveBeenCalledTimes(1);
        expect(mocks.getManualReviewQueue).toHaveBeenCalledWith(
            expect.objectContaining({
                department: 'Engineering',
                scoreBand: 'high',
                status: 'pending_review',
                requisitionId: '0d74d0fd-2cb9-4a40-9397-6e5bcdbf229a',
            }),
            { page: 1, limit: 10 },
            { sortBy: 'sla', sortDir: 'asc' }
        );
    });

    it('returns 400 for invalid query enums', async () => {
        const app = createTestApp();
        const response = await request(app)
            .get('/api/manual-review-queue')
            .query({ scoreBand: 'top' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query parameters');
        expect(Array.isArray(response.body.details)).toBe(true);
    });

    it('rejects users without HR reviewer role', async () => {
        const app = createTestApp();
        const response = await request(app)
            .get('/api/manual-review-queue')
            .set('x-test-role', 'candidate');

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('returns decision reason code options', async () => {
        mocks.getDecisionReasonCodes.mockResolvedValue([
            {
                code: 'strong_skills_match',
                displayText: 'Strong skills match',
                category: 'decision',
            },
        ]);

        const app = createTestApp();
        const response = await request(app)
            .get('/api/manual-review-queue/reason-codes')
            .query({ decision: 'shortlisted' });

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            {
                code: 'strong_skills_match',
                displayText: 'Strong skills match',
                category: 'decision',
            },
        ]);
        expect(mocks.getDecisionReasonCodes).toHaveBeenCalledWith('shortlisted');
    });

    it('returns 400 for invalid reason-code query enums', async () => {
        const app = createTestApp();
        const response = await request(app)
            .get('/api/manual-review-queue/reason-codes')
            .query({ decision: 'hold' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query parameters');
        expect(Array.isArray(response.body.details)).toBe(true);
    });

    it('returns 400 when reasonCode is missing in review payload', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/review')
            .send({ decision: 'rejected' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: ['reasonCode'] }),
            ])
        );
        expect(mocks.markAsReviewed).not.toHaveBeenCalled();
    });

    it('returns 400 when comment exceeds 500 characters', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/review')
            .send({
                decision: 'shortlisted',
                reasonCode: 'strong_skills_match',
                comment: 'a'.repeat(501),
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: ['comment'] }),
            ])
        );
        expect(mocks.markAsReviewed).not.toHaveBeenCalled();
    });

    it('forwards decision, reasonCode, and optional comment for valid review payload', async () => {
        mocks.markAsReviewed.mockResolvedValue({
            applicationId: 'app-1',
            status: 'shortlisted',
            decision: 'shortlisted',
            path: 'experienced',
            reasonCode: 'strong_skills_match',
            communicationId: 'comm-1',
            correlationId: 'corr-1',
            reviewedAt: '2026-07-25T15:00:00.000Z',
        });

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/review')
            .send({
                decision: 'shortlisted',
                reasonCode: 'strong_skills_match',
                comment: 'Excellent technical depth.',
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.decision).toEqual(
            expect.objectContaining({
                applicationId: 'app-1',
                status: 'shortlisted',
                decision: 'shortlisted',
                path: 'experienced',
                reasonCode: 'strong_skills_match',
                communicationId: 'comm-1',
                correlationId: 'corr-1',
            })
        );
        expect(mocks.markAsReviewed).toHaveBeenCalledWith(
            'app-1',
            'user-1',
            'shortlisted',
            'strong_skills_match',
            'Excellent technical depth.'
        );
    });

    it('returns 400 when service rejects an invalid reason code', async () => {
        mocks.markAsReviewed.mockRejectedValue(new mocks.InvalidReasonCodeError());

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/review')
            .send({
                decision: 'rejected',
                reasonCode: 'not_allowed',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: ['reasonCode'] }),
            ])
        );
    });

    it('returns 409 when application is already decided', async () => {
        mocks.markAsReviewed.mockRejectedValue(new mocks.ApplicationDecisionLockedError());

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/review')
            .send({
                decision: 'rejected',
                reasonCode: 'position_filled',
            });

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Application is no longer pending review');
    });

    it('overrides application path for authorized actor', async () => {
        mocks.overrideApplicationPath.mockResolvedValue({
            applicationId: 'app-1',
            originalPath: 'fresher',
            newPath: 'experienced',
            justification: 'Candidate has enterprise project history and internships.',
            overriddenAt: '2026-07-25T16:00:00.000Z',
        });

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/path-override')
            .set('x-test-role', 'recruiter')
            .send({
                newPath: 'experienced',
                justification: 'Candidate has enterprise project history and internships.',
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.override).toEqual(
            expect.objectContaining({
                applicationId: 'app-1',
                originalPath: 'fresher',
                newPath: 'experienced',
            })
        );
        expect(mocks.overrideApplicationPath).toHaveBeenCalledWith({
            applicationId: 'app-1',
            actorId: 'user-1',
            newPath: 'experienced',
            justification: 'Candidate has enterprise project history and internships.',
        });
    });

    it('returns 400 when path override justification is too short', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/path-override')
            .send({
                newPath: 'experienced',
                justification: 'too short',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: ['justification'] }),
            ])
        );
        expect(mocks.overrideApplicationPath).not.toHaveBeenCalled();
    });

    it('returns 409 for path override domain conflicts', async () => {
        mocks.overrideApplicationPath.mockRejectedValue(
            new mocks.InvalidPathOverrideError(
                'NO_OP_OVERRIDE',
                'New path must differ from current path'
            )
        );

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/path-override')
            .send({
                newPath: 'experienced',
                justification: 'Candidate has enterprise project history and internships.',
            });

        expect(response.status).toBe(409);
        expect(response.body).toEqual({
            error: 'New path must differ from current path',
            code: 'NO_OP_OVERRIDE',
        });
    });

    it('returns 404 when overriding path for missing application', async () => {
        mocks.overrideApplicationPath.mockRejectedValue(
            new Error('Application not found')
        );

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/app-1/path-override')
            .send({
                newPath: 'experienced',
                justification: 'Candidate has enterprise project history and internships.',
            });

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Application not found');
    });

    it('bulk rejects applications for authorized HR actors', async () => {
        mocks.bulkRejectApplications.mockResolvedValue({
            processedCount: 2,
            rejectedIds: [
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
            ],
            skipped: [],
            reasonCode: 'insufficient_experience',
            correlationId: 'corr-bulk-1',
            communicationsQueued: 2,
        });

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/bulk-reject')
            .set('x-test-role', 'hr_manager')
            .send({
                applicationIds: [
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                ],
                reasonCode: 'insufficient_experience',
                comment: 'Bulk rejected for baseline criteria mismatch.',
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.result).toEqual(
            expect.objectContaining({
                processedCount: 2,
                rejectedIds: [
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                ],
                communicationsQueued: 2,
            })
        );

        expect(mocks.bulkRejectApplications).toHaveBeenCalledWith({
            applicationIds: [
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
            ],
            actorId: 'user-1',
            reasonCode: 'insufficient_experience',
            comment: 'Bulk rejected for baseline criteria mismatch.',
        });
    });

    it('returns 400 when bulk reject selects fewer than 2 applications', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/bulk-reject')
            .send({
                applicationIds: ['11111111-1111-4111-8111-111111111111'],
                reasonCode: 'insufficient_experience',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: ['applicationIds'] }),
            ])
        );
        expect(mocks.bulkRejectApplications).not.toHaveBeenCalled();
    });

    it('returns 400 when bulk reject reason code is invalid in service layer', async () => {
        mocks.bulkRejectApplications.mockRejectedValue(new mocks.InvalidReasonCodeError());

        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/bulk-reject')
            .send({
                applicationIds: [
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                ],
                reasonCode: 'invalid_reason',
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(response.body.details).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: ['reasonCode'] }),
            ])
        );
    });

    it('returns 403 for unauthorized bulk reject role', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/manual-review-queue/bulk-reject')
            .set('x-test-role', 'candidate')
            .send({
                applicationIds: [
                    '11111111-1111-4111-8111-111111111111',
                    '22222222-2222-4222-8222-222222222222',
                ],
                reasonCode: 'insufficient_experience',
            });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
    });
});