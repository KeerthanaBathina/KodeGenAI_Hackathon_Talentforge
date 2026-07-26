import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewStageState } from '@prisma/client';

vi.mock('../../config/env', () => ({
    env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test',
        DIRECT_URL: 'postgresql://test',
        FRONTEND_URL: 'http://localhost:3000',
        JWT_SECRET: 'test-secret',
        UPSTASH_REDIS_REST_URL: 'http://localhost',
        UPSTASH_REDIS_REST_TOKEN: 'test-token',
        SUPABASE_URL: 'http://localhost',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    },
}));

vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('../../db/prisma', () => ({
    prisma: {},
}));

vi.mock('../../socket', () => ({
    getSocketServer: vi.fn(() => ({})),
}));

const mocks = vi.hoisted(() => ({
    transitionInterviewState: vi.fn(),
    getInterviewStateInfo: vi.fn(),
    auditEvent: vi.fn(),
    getPanelistAvailability: vi.fn(),
    scheduleInterview: vi.fn(),
    generatePanelistConfirmationToken: vi.fn(),
    validatePanelistConfirmationToken: vi.fn(),
    markTokenAsUsed: vi.fn(),
    sendPanelistConfirmationEmail: vi.fn(),
    dispatchInterviewInviteEmail: vi.fn(),
}));

vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, _res: any, next: any) => {
        req.user = {
            id: 'user-1',
            email: 'recruiter@example.com',
            role: (req.headers['x-test-role'] as string) || 'recruiter',
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

vi.mock('../../services/interviewStateService', () => ({
    transitionInterviewState: mocks.transitionInterviewState,
    getInterviewStateInfo: mocks.getInterviewStateInfo,
}));

vi.mock('../../services/auditService', () => ({
    auditEvent: mocks.auditEvent,
}));

vi.mock('../../services/interviewSchedulingService', () => ({
    getPanelistAvailability: mocks.getPanelistAvailability,
    scheduleInterview: mocks.scheduleInterview,
    InterviewConflictError: class InterviewConflictError extends Error {},
}));

vi.mock('../../services/panelistConfirmationService', () => ({
    generatePanelistConfirmationToken: mocks.generatePanelistConfirmationToken,
    validatePanelistConfirmationToken: mocks.validatePanelistConfirmationToken,
    markTokenAsUsed: mocks.markTokenAsUsed,
}));

vi.mock('../../services/emailService', () => ({
    sendPanelistConfirmationEmail: mocks.sendPanelistConfirmationEmail,
}));

vi.mock('../../services/interviewInviteService', () => ({
    dispatchInterviewInviteEmail: mocks.dispatchInterviewInviteEmail,
}));

import interviewsRouter from '../interviews';

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/interviews', interviewsRouter);
    return app;
}

describe('interview state transition API integration tests', () => {
    beforeEach(() => {
        mocks.transitionInterviewState.mockReset();
        mocks.getInterviewStateInfo.mockReset();
        mocks.auditEvent.mockReset();
    });

    describe('PATCH /api/interviews/:interviewId/state', () => {
        it('should transition interview state successfully (200)', async () => {
            const mockUpdatedInterview = {
                id: 'interview-1',
                state: InterviewStageState.completed,
                type: 'technical',
                scheduledAt: '2026-07-26T10:00:00.000Z',
                updatedAt: '2026-07-25T18:48:47.633Z',
            };

            mocks.transitionInterviewState.mockResolvedValue(mockUpdatedInterview);

            const app = createTestApp();
            const response = await request(app)
                .patch('/api/interviews/interview-1/state')
                .send({
                    state: 'completed',
                    reason: 'Interview completed successfully',
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockUpdatedInterview);
            expect(mocks.transitionInterviewState).toHaveBeenCalledWith({
                interviewStageId: 'interview-1',
                newState: 'completed',
                reason: 'Interview completed successfully',
                actorId: 'user-1',
            });
        });

        it('should reject invalid state transition with 422', async () => {
            const error: any = new Error('Cannot transition from completed to no_show. Allowed transitions: none');
            error.code = 'INVALID_STATE_TRANSITION';
            error.currentState = 'completed';
            error.requestedState = 'no_show';

            mocks.transitionInterviewState.mockRejectedValue(error);

            const app = createTestApp();
            const response = await request(app)
                .patch('/api/interviews/interview-1/state')
                .send({
                    state: 'no_show',
                });

            expect(response.status).toBe(422);
            expect(response.body).toMatchObject({
                error: 'Cannot transition from completed to no_show. Allowed transitions: none',
                currentState: 'completed',
                requestedState: 'no_show',
            });
        });

        it('should return 404 for non-existent interview', async () => {
            mocks.transitionInterviewState.mockRejectedValue(new Error('Interview not found'));

            const app = createTestApp();
            const response = await request(app)
                .patch('/api/interviews/non-existent-id/state')
                .send({
                    state: 'completed',
                });

            expect(response.status).toBe(404);
            expect(response.body).toMatchObject({
                error: 'Interview not found',
            });
        });

        it('should return 400 for invalid request body', async () => {
            const app = createTestApp();
            const response = await request(app)
                .patch('/api/interviews/interview-1/state')
                .send({
                    state: 'invalid_state',
                });

            expect(response.status).toBe(400);
            expect(response.body).toMatchObject({
                error: 'Invalid request body',
            });
        });

        it('should return 403 for unauthorized role', async () => {
            const app = createTestApp();
            const response = await request(app)
                .patch('/api/interviews/interview-1/state')
                .set('x-test-role', 'candidate')
                .send({
                    state: 'completed',
                });

            expect(response.status).toBe(403);
        });

        it('should allow state transition without reason', async () => {
            const mockUpdatedInterview = {
                id: 'interview-1',
                state: InterviewStageState.completed,
            };

            mocks.transitionInterviewState.mockResolvedValue(mockUpdatedInterview);

            const app = createTestApp();
            const response = await request(app)
                .patch('/api/interviews/interview-1/state')
                .send({
                    state: 'completed',
                });

            expect(response.status).toBe(200);
            expect(mocks.transitionInterviewState).toHaveBeenCalledWith({
                interviewStageId: 'interview-1',
                newState: 'completed',
                reason: undefined,
                actorId: 'user-1',
            });
        });
    });

    describe('GET /api/interviews/:interviewId/state', () => {
        it('should return current state and allowed transitions (200)', async () => {
            const mockStateInfo = {
                currentState: InterviewStageState.scheduled,
                allowedTransitions: ['completed', 'cancelled', 'no_show', 'rescheduled'],
                isTerminal: false,
            };

            mocks.getInterviewStateInfo.mockResolvedValue(mockStateInfo);

            const app = createTestApp();
            const response = await request(app)
                .get('/api/interviews/interview-1/state');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockStateInfo);
            expect(mocks.getInterviewStateInfo).toHaveBeenCalledWith('interview-1');
        });

        it('should return 404 for non-existent interview', async () => {
            mocks.getInterviewStateInfo.mockRejectedValue(new Error('Interview not found'));

            const app = createTestApp();
            const response = await request(app)
                .get('/api/interviews/non-existent-id/state');

            expect(response.status).toBe(404);
            expect(response.body).toMatchObject({
                error: 'Interview not found',
            });
        });

        it('should return terminal state information', async () => {
            const mockStateInfo = {
                currentState: InterviewStageState.completed,
                allowedTransitions: [],
                isTerminal: true,
            };

            mocks.getInterviewStateInfo.mockResolvedValue(mockStateInfo);

            const app = createTestApp();
            const response = await request(app)
                .get('/api/interviews/interview-1/state');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockStateInfo);
        });
    });
});
