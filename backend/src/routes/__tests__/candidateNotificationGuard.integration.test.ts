import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

vi.mock('../../db/prisma');
vi.mock('../../services/interviewInviteService');
vi.mock('../../services/auditService');
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { prisma } from '../../db/prisma';
import { dispatchInterviewInviteEmail } from '../../services/interviewInviteService';
import { auditEvent } from '../../services/auditService';

describe('Candidate Notification Guard', () => {
    let recruiterToken: string;
    const interviewId = 'interview-123';
    const recruiterId = 'recruiter-1';

    beforeEach(() => {
        vi.clearAllMocks();

        recruiterToken = jwt.sign(
            { sub: recruiterId, role: 'recruiter' },
            env.JWT_SECRET!,
            { expiresIn: '1h' }
        );

        vi.mocked(auditEvent).mockResolvedValue();
        vi.mocked(dispatchInterviewInviteEmail).mockResolvedValue();
    });

    describe('POST /api/interviews/:interviewId/notify-candidate', () => {
        it('blocks notification when panelists are unconfirmed', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                applicationId: 'app-1',
                type: 'technical',
                scheduledAt: new Date('2026-07-26T10:00:00Z'),
                endAt: new Date('2026-07-26T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: ['panelist-1', 'panelist-2'],
                state: 'scheduled',
                reasonCodeId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                application: {
                    id: 'app-1',
                    candidate: {
                        id: 'cand-1',
                        email: 'candidate@example.com',
                        timezone: 'UTC',
                        profile: {
                            fullName: 'John Candidate',
                        },
                    },
                    requisition: {
                        id: 'req-1',
                        title: 'Senior Engineer',
                    },
                },
                panelistConfirmations: [
                    {
                        id: 'conf-1',
                        interviewStageId: interviewId,
                        panelistId: 'panelist-1',
                        status: 'pending',
                        tokenHash: null,
                        confirmationSentAt: new Date(),
                        respondedAt: null,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        panelist: {
                            id: 'panelist-1',
                            fullName: 'Jane Panelist',
                            email: 'jane@example.com',
                            timezone: 'America/New_York',
                        },
                    },
                    {
                        id: 'conf-2',
                        interviewStageId: interviewId,
                        panelistId: 'panelist-2',
                        status: 'confirmed',
                        tokenHash: null,
                        confirmationSentAt: new Date(),
                        respondedAt: new Date(),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        panelist: {
                            id: 'panelist-2',
                            fullName: 'Bob Panelist',
                            email: 'bob@example.com',
                            timezone: 'America/Los_Angeles',
                        },
                    },
                ],
            } as any);

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({});

            expect(response.status).toBe(409);
            expect(response.body.error).toBe('Cannot notify candidate with unconfirmed panelists');
            expect(response.body.unconfirmedPanelists).toHaveLength(1);
            expect(response.body.unconfirmedPanelists[0]).toEqual({
                id: 'panelist-1',
                name: 'Jane Panelist',
                status: 'pending',
            });
            expect(dispatchInterviewInviteEmail).not.toHaveBeenCalled();
        });

        it('blocks notification when panelist has declined', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                applicationId: 'app-1',
                scheduledAt: new Date('2026-07-26T10:00:00Z'),
                endAt: new Date('2026-07-26T11:00:00Z'),
                application: {
                    candidate: {
                        id: 'cand-1',
                        email: 'candidate@example.com',
                        timezone: 'UTC',
                        profile: { fullName: 'John Candidate' },
                    },
                    requisition: { title: 'Senior Engineer' },
                },
                panelistConfirmations: [
                    {
                        panelistId: 'panelist-1',
                        status: 'declined',
                        panelist: {
                            id: 'panelist-1',
                            fullName: 'Jane Panelist',
                            email: 'jane@example.com',
                            timezone: 'UTC',
                        },
                    },
                ],
            } as any);

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({});

            expect(response.status).toBe(409);
            expect(response.body.unconfirmedPanelists).toHaveLength(1);
            expect(response.body.unconfirmedPanelists[0].status).toBe('declined');
        });

        it('allows notification when all panelists confirmed', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                applicationId: 'app-1',
                type: 'technical',
                scheduledAt: new Date('2026-07-26T10:00:00Z'),
                endAt: new Date('2026-07-26T11:00:00Z'),
                timezone: 'UTC',
                application: {
                    candidate: {
                        id: 'cand-1',
                        email: 'candidate@example.com',
                        timezone: 'UTC',
                        profile: { fullName: 'John Candidate' },
                    },
                    requisition: { title: 'Senior Engineer' },
                },
                panelistConfirmations: [
                    {
                        panelistId: 'panelist-1',
                        status: 'confirmed',
                        panelist: {
                            id: 'panelist-1',
                            fullName: 'Jane Panelist',
                            email: 'jane@example.com',
                            timezone: 'UTC',
                        },
                    },
                ],
            } as any);

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(dispatchInterviewInviteEmail).toHaveBeenCalled();
            expect(auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    actorId: recruiterId,
                    eventType: 'candidate_notified',
                    entityType: 'interview_stage',
                    entityId: interviewId,
                })
            );
        });

        it('allows override with forceNotify=true', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                applicationId: 'app-1',
                type: 'technical',
                scheduledAt: new Date('2026-07-26T10:00:00Z'),
                endAt: new Date('2026-07-26T11:00:00Z'),
                timezone: 'UTC',
                application: {
                    candidate: {
                        id: 'cand-1',
                        email: 'candidate@example.com',
                        timezone: 'UTC',
                        profile: { fullName: 'John Candidate' },
                    },
                    requisition: { title: 'Senior Engineer' },
                },
                panelistConfirmations: [
                    {
                        panelistId: 'panelist-1',
                        status: 'pending',
                        panelist: {
                            id: 'panelist-1',
                            fullName: 'Jane Panelist',
                            email: 'jane@example.com',
                            timezone: 'UTC',
                        },
                    },
                ],
            } as any);

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    forceNotify: true,
                    justification: 'Urgent deadline - candidate needs immediate notification',
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.warningOverridden).toBe(true);
            expect(dispatchInterviewInviteEmail).toHaveBeenCalled();
            expect(auditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'candidate_notified_with_override',
                    payload: expect.objectContaining({
                        forceNotify: true,
                        justification: 'Urgent deadline - candidate needs immediate notification',
                        unconfirmedCount: 1,
                    }),
                })
            );
        });

        it('returns 404 when interview not found', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(null);

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({});

            expect(response.status).toBe(404);
        });

        it('returns 400 when interview not scheduled', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                scheduledAt: null,
                endAt: null,
                application: {
                    candidate: { email: 'test@example.com', timezone: 'UTC', profile: {} },
                    requisition: { title: 'Test' },
                },
                panelistConfirmations: [],
            } as any);

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Interview must be scheduled first');
        });

        it('requires recruiter role', async () => {
            const candidateToken = jwt.sign(
                { sub: 'cand-1', role: 'candidate' },
                env.JWT_SECRET!,
                { expiresIn: '1h' }
            );

            const response = await request(app)
                .post(`/api/interviews/${interviewId}/notify-candidate`)
                .set('Authorization', `Bearer ${candidateToken}`)
                .send({});

            expect(response.status).toBe(403);
        });
    });
});
