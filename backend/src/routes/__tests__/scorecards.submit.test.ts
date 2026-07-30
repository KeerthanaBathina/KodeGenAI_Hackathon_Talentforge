import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { InterviewStageType, ScorecardStatus, InterviewRecommendation } from '@prisma/client';

vi.mock('../../config/env', () => ({
    env: {
        JWT_SECRET: 'test-secret-key-32-characters-long',
        FRONTEND_URL: 'http://localhost:3000',
        EMAIL_PROVIDER: 'mock',
        DATABASE_URL: 'postgresql://test',
        DIRECT_URL: 'postgresql://test',
        UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
        UPSTASH_REDIS_REST_TOKEN: 'test-token',
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
}));

vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, res: any, next: any) => {
        req.user = {
            id: 'interviewer-1',
            email: 'interviewer@test.com',
            role: 'tech_interviewer',
        };
        next();
    },
}));

vi.mock('../../services/scorecardService');
vi.mock('../../services/auditService');
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

import scorecardsRouter from '../scorecards';
import { env } from '../../config/env';
import * as scorecardService from '../../services/scorecardService';
import * as auditService from '../../services/auditService';

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/scorecards', scorecardsRouter);
    return app;
}

describe('POST /api/scorecards/:scorecardId/submit', () => {
    const interviewerId = 'interviewer-1';
    const scorecardId = 'scorecard-1';
    const interviewStageId = 'stage-1';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('submits complete scorecard successfully', async () => {
        const app = createTestApp();

        const mockSubmittedScorecard = {
            id: scorecardId,
            interviewStageId,
            interviewerId,
            status: ScorecardStatus.submitted,
            recommendation: InterviewRecommendation.advance,
            aggregateScore: 4.5,
            submittedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            dimensions: [
                { id: 'dim-1', dimensionName: 'Problem Solving', score: 5, notes: 'Excellent' },
                { id: 'dim-2', dimensionName: 'Code Quality', score: 4, notes: 'Good' },
            ],
        };

        vi.mocked(scorecardService.submitScorecard).mockResolvedValue(mockSubmittedScorecard as any);
        vi.mocked(auditService.auditEvent).mockResolvedValue(undefined);

        const response = await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(scorecardId);
        expect(response.body.status).toBe('submitted');
        expect(response.body.aggregateScore).toBe(4.5);
        expect(response.body.submittedAt).toBeDefined();

        // Verify audit event was created
        expect(auditService.auditEvent).toHaveBeenCalledWith({
            actorId: interviewerId,
            eventType: 'scorecard_submitted',
            entityType: 'interview_scorecard',
            entityId: scorecardId,
            payload: expect.objectContaining({
                interviewStageId,
                recommendation: InterviewRecommendation.advance,
                aggregateScore: 4.5,
                dimensionCount: 2,
            }),
        });
    });

    it('returns 422 when scorecard is incomplete', async () => {
        const app = createTestApp();

        const incompleteError: any = new Error('Scorecard is incomplete');
        incompleteError.code = 'INCOMPLETE_SCORECARD';
        incompleteError.validation = {
            isComplete: false,
            missingDimensions: ['Problem Solving', 'Code Quality'],
            hasRecommendation: false,
            completionPercentage: 0,
        };

        vi.mocked(scorecardService.submitScorecard).mockRejectedValue(incompleteError);

        const response = await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(response.status).toBe(422);
        expect(response.body.error).toBe('Scorecard is incomplete');
        expect(response.body.validation).toBeDefined();
        expect(response.body.validation.missingDimensions).toContain('Problem Solving');
    });

    it('returns 409 when scorecard already submitted', async () => {
        const app = createTestApp();

        vi.mocked(scorecardService.submitScorecard).mockRejectedValue(
            new Error('Scorecard has already been submitted')
        );

        const response = await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(response.status).toBe(409);
        expect(response.body.error).toBe('Scorecard has already been submitted');
    });

    it('returns 403 when user is not scorecard owner', async () => {
        const app = createTestApp();

        vi.mocked(scorecardService.submitScorecard).mockRejectedValue(
            new Error('Unauthorized: You can only submit your own scorecard')
        );

        const response = await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Unauthorized');
    });

    it('returns 404 when scorecard not found', async () => {
        const app = createTestApp();

        vi.mocked(scorecardService.submitScorecard).mockRejectedValue(
            new Error('Scorecard not found')
        );

        const response = await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Scorecard not found');
    });

    it('calculates aggregate score correctly', async () => {
        const app = createTestApp();

        const mockSubmittedScorecard = {
            id: scorecardId,
            interviewStageId,
            interviewerId,
            status: ScorecardStatus.submitted,
            recommendation: InterviewRecommendation.advance,
            aggregateScore: 3.8, // (3 + 4 + 5 + 3) / 4 = 3.75, rounded to 3.8
            submittedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            dimensions: [
                { id: 'dim-1', dimensionName: 'Dimension 1', score: 3, notes: null },
                { id: 'dim-2', dimensionName: 'Dimension 2', score: 4, notes: null },
                { id: 'dim-3', dimensionName: 'Dimension 3', score: 5, notes: null },
                { id: 'dim-4', dimensionName: 'Dimension 4', score: 3, notes: null },
            ],
        };

        vi.mocked(scorecardService.submitScorecard).mockResolvedValue(mockSubmittedScorecard as any);
        vi.mocked(auditService.auditEvent).mockResolvedValue(undefined);

        const response = await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(response.status).toBe(200);
        expect(response.body.aggregateScore).toBe(3.8);
    });

    it('creates audit event with correct payload', async () => {
        const app = createTestApp();

        const submittedAt = new Date('2026-07-25T12:00:00Z');
        const mockSubmittedScorecard = {
            id: scorecardId,
            interviewStageId,
            interviewerId,
            status: ScorecardStatus.submitted,
            recommendation: InterviewRecommendation.hold,
            aggregateScore: 3.2,
            submittedAt,
            createdAt: new Date(),
            updatedAt: new Date(),
            dimensions: [
                { id: 'dim-1', dimensionName: 'Dimension 1', score: 3, notes: null },
                { id: 'dim-2', dimensionName: 'Dimension 2', score: 3, notes: null },
            ],
        };

        vi.mocked(scorecardService.submitScorecard).mockResolvedValue(mockSubmittedScorecard as any);
        vi.mocked(auditService.auditEvent).mockResolvedValue(undefined);

        await request(app)
            .post(`/api/scorecards/${scorecardId}/submit`)
            .set('Authorization', 'Bearer token');

        expect(auditService.auditEvent).toHaveBeenCalledWith({
            actorId: interviewerId,
            eventType: 'scorecard_submitted',
            entityType: 'interview_scorecard',
            entityId: scorecardId,
            payload: {
                interviewStageId,
                recommendation: InterviewRecommendation.hold,
                aggregateScore: 3.2,
                dimensionCount: 2,
                submittedAt,
            },
        });
    });
});
