import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
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
        // Mock authenticated user
        req.user = {
            id: 'interviewer-1',
            email: 'interviewer@test.com',
            role: 'tech_interviewer',
        };
        next();
    },
}));

vi.mock('../../db/prisma', () => ({
    prisma: {
        interviewStage: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('../../services/scorecardService');
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        })),
    },
}));

import scorecardsRouter from '../scorecards';
import { env } from '../../config/env';
import * as scorecardService from '../../services/scorecardService';
import { prisma } from '../../db/prisma';

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/scorecards', scorecardsRouter);
    return app;
}

describe('Scorecard API', () => {
    let interviewerToken: string;
    let recruiterToken: string;
    const interviewerId = 'interviewer-1';
    const recruiterId = 'recruiter-1';
    const interviewStageId = 'interview-stage-1';
    const scorecardId = 'scorecard-1';

    beforeEach(() => {
        vi.clearAllMocks();

        interviewerToken = jwt.sign(
            { sub: interviewerId, role: 'tech_interviewer' },
            env.JWT_SECRET!,
            { expiresIn: '1h' }
        );

        recruiterToken = jwt.sign({ sub: recruiterId, role: 'recruiter' }, env.JWT_SECRET!, {
            expiresIn: '1h',
        });
    });

    describe('POST /api/scorecards', () => {
        it('returns 400 for missing interview stage ID', async () => {
            const app = createTestApp();

            const response = await request(app)
                .post('/api/scorecards')
                .set('Authorization', `Bearer ${interviewerToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request body');
        });
    });

    describe('GET /api/scorecards/:scorecardId', () => {
        it('retrieves scorecard for authorized user', async () => {
            const app = createTestApp();
            const mockScorecard = {
                id: scorecardId,
                interviewStageId,
                interviewerId,
                status: ScorecardStatus.draft,
                recommendation: null,
                aggregateScore: null,
                submittedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                dimensions: [],
            };

            vi.mocked(scorecardService.canViewScorecard).mockResolvedValue(true);
            vi.mocked(scorecardService.getScorecardById).mockResolvedValue(mockScorecard as any);

            const response = await request(app)
                .get(`/api/scorecards/${scorecardId}`)
                .set('Authorization', `Bearer ${interviewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(scorecardId);
        });

        it('returns 403 if user is not authorized to view', async () => {
            const app = createTestApp();

            vi.mocked(scorecardService.canViewScorecard).mockResolvedValue(false);

            const response = await request(app)
                .get(`/api/scorecards/${scorecardId}`)
                .set('Authorization', `Bearer ${interviewerToken}`);

            expect(response.status).toBe(403);
        });

        it('returns 404 if scorecard not found', async () => {
            const app = createTestApp();

            vi.mocked(scorecardService.canViewScorecard).mockResolvedValue(true);
            vi.mocked(scorecardService.getScorecardById).mockResolvedValue(null);

            const response = await request(app)
                .get(`/api/scorecards/${scorecardId}`)
                .set('Authorization', `Bearer ${interviewerToken}`);

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /api/scorecards/:scorecardId', () => {
        it('updates dimension scores (partial save)', async () => {
            const app = createTestApp();
            const mockUpdatedScorecard = {
                id: scorecardId,
                interviewStageId,
                interviewerId,
                status: ScorecardStatus.draft,
                recommendation: null,
                aggregateScore: null,
                submittedAt: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                dimensions: [
                    {
                        id: 'dim-1',
                        dimensionName: 'Problem Solving',
                        score: 4,
                        notes: 'Good problem solving skills',
                    },
                ],
            };

            const mockValidation = {
                isComplete: false,
                missingDimensions: ['Code Quality'],
                hasRecommendation: false,
                completionPercentage: 50,
            };

            vi.mocked(scorecardService.canUpdateScorecard).mockResolvedValue(true);
            vi.mocked(scorecardService.updateScorecardDimensions).mockResolvedValue(
                mockUpdatedScorecard as any
            );
            vi.mocked(scorecardService.validateScorecardComplete).mockResolvedValue(mockValidation);

            const response = await request(app)
                .patch(`/api/scorecards/${scorecardId}`)
                .set('Authorization', `Bearer ${interviewerToken}`)
                .send({
                    dimensions: [
                        {
                            dimensionName: 'Problem Solving',
                            score: 4,
                            notes: 'Good problem solving skills',
                        },
                    ],
                });

            expect(response.status).toBe(200);
            expect(response.body.scorecard.dimensions[0].score).toBe(4);
            expect(response.body.validation.completionPercentage).toBe(50);
        });

        it('returns 403 if user is not authorized to update', async () => {
            const app = createTestApp();

            vi.mocked(scorecardService.canUpdateScorecard).mockResolvedValue(false);

            const response = await request(app)
                .patch(`/api/scorecards/${scorecardId}`)
                .set('Authorization', `Bearer ${interviewerToken}`)
                .send({
                    dimensions: [{ dimensionName: 'Problem Solving', score: 4 }],
                });

            expect(response.status).toBe(403);
        });

        it('validates score range (1-5)', async () => {
            const app = createTestApp();

            const response = await request(app)
                .patch(`/api/scorecards/${scorecardId}`)
                .set('Authorization', `Bearer ${interviewerToken}`)
                .send({
                    dimensions: [{ dimensionName: 'Problem Solving', score: 6 }],
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Invalid request body');
        });
    });

    describe('GET /api/scorecards/:scorecardId/validation', () => {
        it('returns validation status with missing dimensions', async () => {
            const app = createTestApp();
            const mockValidation = {
                isComplete: false,
                missingDimensions: ['Code Quality'],
                hasRecommendation: false,
                completionPercentage: 50,
            };

            vi.mocked(scorecardService.canViewScorecard).mockResolvedValue(true);
            vi.mocked(scorecardService.validateScorecardComplete).mockResolvedValue(mockValidation);

            const response = await request(app)
                .get(`/api/scorecards/${scorecardId}/validation`)
                .set('Authorization', `Bearer ${interviewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.isComplete).toBe(false);
            expect(response.body.missingDimensions).toContain('Code Quality');
            expect(response.body.hasRecommendation).toBe(false);
            expect(response.body.completionPercentage).toBe(50);
        });

        it('returns complete status when all scored', async () => {
            const app = createTestApp();
            const mockValidation = {
                isComplete: true,
                missingDimensions: [],
                hasRecommendation: true,
                completionPercentage: 100,
            };

            vi.mocked(scorecardService.canViewScorecard).mockResolvedValue(true);
            vi.mocked(scorecardService.validateScorecardComplete).mockResolvedValue(mockValidation);

            const response = await request(app)
                .get(`/api/scorecards/${scorecardId}/validation`)
                .set('Authorization', `Bearer ${interviewerToken}`);

            expect(response.status).toBe(200);
            expect(response.body.isComplete).toBe(true);
            expect(response.body.missingDimensions).toHaveLength(0);
            expect(response.body.hasRecommendation).toBe(true);
            expect(response.body.completionPercentage).toBe(100);
        });
    });
});
