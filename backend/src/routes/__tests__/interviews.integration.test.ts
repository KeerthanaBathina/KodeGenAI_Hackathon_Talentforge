import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getPanelistAvailability: vi.fn(),
    scheduleInterview: vi.fn(),
    InterviewConflictError: class InterviewConflictError extends Error {
        conflicts: unknown[];

        constructor(conflicts: unknown[]) {
            super('Panelist is unavailable for the requested slot');
            this.conflicts = conflicts;
            this.name = 'InterviewConflictError';
        }
    },
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

vi.mock('../../services/interviewSchedulingService', () => ({
    getPanelistAvailability: mocks.getPanelistAvailability,
    scheduleInterview: mocks.scheduleInterview,
    InterviewConflictError: mocks.InterviewConflictError,
}));

import interviewsRouter from '../interviews';

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/interviews', interviewsRouter);
    return app;
}

describe('interviews API integration tests', () => {
    beforeEach(() => {
        mocks.getPanelistAvailability.mockReset();
        mocks.scheduleInterview.mockReset();
    });

    it('returns panelist availability for authorized users', async () => {
        mocks.getPanelistAvailability.mockResolvedValue([
            {
                panelMemberId: 'panel-1',
                panelMemberName: 'Arun Menon',
                timezone: 'UTC',
                slots: [
                    {
                        startAt: '2026-07-26T09:00:00.000Z',
                        endAt: '2026-07-26T09:45:00.000Z',
                        available: true,
                        label: '9:00 AM',
                    },
                ],
            },
        ]);

        const app = createTestApp();
        const response = await request(app)
            .get('/api/interviews/availability')
            .query({ applicationId: '11111111-1111-4111-8111-111111111111' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
        expect(mocks.getPanelistAvailability).toHaveBeenCalledWith([]);
    });

    it('returns 400 for invalid availability query parameters', async () => {
        const app = createTestApp();
        const response = await request(app)
            .get('/api/interviews/availability')
            .query({ applicationId: 'bad-id' });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid query parameters');
        expect(mocks.getPanelistAvailability).not.toHaveBeenCalled();
    });

    it('schedules an interview for authorized users with UTC payload fields', async () => {
        mocks.scheduleInterview.mockResolvedValue({
            id: 'stage-1',
            applicationId: 'app-1',
            type: 'technical',
            scheduledAt: '2026-07-25T04:30:00.000Z',
            timezone: 'Asia/Kolkata',
            panelMembers: ['panel-1', 'panel-2'],
        });

        const app = createTestApp();
        const response = await request(app)
            .post('/api/interviews')
            .set('x-test-role', 'recruiter')
            .send({
                applicationId: '11111111-1111-4111-8111-111111111111',
                type: 'technical',
                startAt: '2026-07-25T04:30:00.000Z',
                endAt: '2026-07-25T05:00:00.000Z',
                timezone: 'Asia/Kolkata',
                panelMemberIds: [
                    '22222222-2222-4222-8222-222222222222',
                    '33333333-3333-4333-8333-333333333333',
                ],
            });

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.interview).toMatchObject({
            id: 'stage-1',
            type: 'technical',
            timezone: 'Asia/Kolkata',
            panelMembers: ['panel-1', 'panel-2'],
        });
        expect(mocks.scheduleInterview).toHaveBeenCalledWith(
            expect.objectContaining({
                applicationId: '11111111-1111-4111-8111-111111111111',
                type: 'technical',
                timezone: 'Asia/Kolkata',
            })
        );
    });

    it('returns 400 for invalid request payloads', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/interviews')
            .send({
                applicationId: 'not-a-uuid',
                type: 'technical',
                startAt: 'invalid',
                endAt: 'invalid',
                timezone: '',
                panelMemberIds: [],
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid request body');
        expect(mocks.scheduleInterview).not.toHaveBeenCalled();
    });

    it('returns 422 when a panelist conflict is reported', async () => {
        mocks.scheduleInterview.mockRejectedValue(
            new mocks.InterviewConflictError([
                {
                    panelMemberId: 'panel-1',
                    panelMemberName: 'Arun Menon',
                    interviewStageId: 'stage-2',
                    interviewType: 'hr',
                    requisitionTitle: 'System Design Interview',
                    scheduledAt: '2026-07-25T04:45:00.000Z',
                    timezone: 'UTC',
                },
            ])
        );

        const app = createTestApp();
        const response = await request(app)
            .post('/api/interviews')
            .send({
                applicationId: '11111111-1111-4111-8111-111111111111',
                type: 'technical',
                startAt: '2026-07-25T04:30:00.000Z',
                endAt: '2026-07-25T05:00:00.000Z',
                timezone: 'UTC',
                panelMemberIds: ['22222222-2222-4222-8222-222222222222'],
            });

        expect(response.status).toBe(422);
        expect(response.body.error).toBe('Conflict detected');
        expect(response.body.conflicts).toHaveLength(1);
    });

    it('returns 403 for unauthorized users', async () => {
        const app = createTestApp();
        const response = await request(app)
            .post('/api/interviews')
            .set('x-test-role', 'candidate')
            .send({
                applicationId: '11111111-1111-4111-8111-111111111111',
                type: 'technical',
                startAt: '2026-07-25T04:30:00.000Z',
                endAt: '2026-07-25T05:00:00.000Z',
                timezone: 'UTC',
                panelMemberIds: ['22222222-2222-4222-8222-222222222222'],
            });

        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
    });
});
