import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

vi.mock('../../db/prisma');
vi.mock('../../services/panelistConfirmationService');
vi.mock('../../services/emailService');
vi.mock('../../services/auditService');
vi.mock('../../socket', () => ({
    getSocketServer: vi.fn(() => ({
        emit: vi.fn(),
        to: vi.fn(() => ({ emit: vi.fn() })),
    })),
}));

import { prisma } from '../../db/prisma';
import { generatePanelistConfirmationToken, validatePanelistConfirmationToken, markTokenAsUsed } from '../../services/panelistConfirmationService';
import { sendPanelistConfirmationEmail } from '../../services/emailService';
import { auditEvent } from '../../services/auditService';
import { getSocketServer } from '../../socket';

describe('Panelist Assignment and Confirmation', () => {
    let recruiterToken: string;
    const interviewId = 'interview-123';
    const panelistId = 'panelist-1';

    beforeEach(() => {
        vi.clearAllMocks();

        recruiterToken = jwt.sign(
            { sub: 'recruiter-1', role: 'recruiter' },
            env.JWT_SECRET!,
            { expiresIn: '1h' }
        );

        vi.mocked(auditEvent).mockResolvedValue();
    });

    describe('PATCH /api/interviews/:interviewId/panelists', () => {
        it('assigns panelists and sends confirmation emails', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                applicationId: 'app-1',
                type: 'technical',
                scheduledAt: new Date('2026-07-26T10:00:00Z'),
                endAt: new Date('2026-07-26T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: [],
                state: 'scheduled',
                reasonCodeId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                application: {
                    id: 'app-1',
                    candidate: {
                        id: 'cand-1',
                        profile: {
                            fullName: 'John Doe',
                        },
                    },
                    requisition: {
                        id: 'req-1',
                        title: 'Senior Engineer',
                    },
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: panelistId,
                    email: 'panelist@example.com',
                    fullName: 'Jane Panelist',
                    timezone: 'America/New_York',
                    role: 'tech_interviewer',
                    active: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    panelAvailability: [
                        {
                            weekday: 2,
                            startHour: 9,
                            endHour: 12,
                            timezone: 'America/New_York',
                        },
                    ],
                },
            ] as any);

            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            vi.mocked(prisma.interviewStage.update).mockResolvedValue({} as any);

            vi.mocked(prisma.panelistConfirmation.upsert).mockResolvedValue({} as any);

            vi.mocked(generatePanelistConfirmationToken).mockResolvedValue('mock-token');

            vi.mocked(sendPanelistConfirmationEmail).mockResolvedValue();

            const response = await request(app)
                .patch(`/api/interviews/${interviewId}/panelists`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    panelMemberIds: [panelistId],
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(sendPanelistConfirmationEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    panelistEmail: 'panelist@example.com',
                    panelistName: 'Jane Panelist',
                    candidateName: 'John Doe',
                    requisitionTitle: 'Senior Engineer',
                })
            );
        });

        it('returns 422 when panelist is unavailable', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue({
                id: interviewId,
                scheduledAt: new Date('2026-07-26T10:00:00Z'),
                endAt: new Date('2026-07-26T11:00:00Z'),
                application: {
                    candidate: { profile: { fullName: 'John Doe' } },
                    requisition: { title: 'Senior Engineer' },
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: panelistId,
                    fullName: 'Jane Panelist',
                    timezone: 'UTC',
                    panelAvailability: [],
                },
            ] as any);

            // Mock conflict
            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([
                {
                    id: 'other-interview',
                    scheduledAt: new Date('2026-07-26T10:00:00Z'),
                    endAt: new Date('2026-07-26T11:00:00Z'),
                    panelMembers: [panelistId],
                },
            ] as any);

            const response = await request(app)
                .patch(`/api/interviews/${interviewId}/panelists`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    panelMemberIds: [panelistId],
                });

            expect(response.status).toBe(422);
            expect(response.body.error).toBe('One or more panelists are unavailable');
        });

        it('returns 404 when interview not found', async () => {
            vi.mocked(prisma.interviewStage.findUnique).mockResolvedValue(null);

            const response = await request(app)
                .patch(`/api/interviews/${interviewId}/panelists`)
                .set('Authorization', `Bearer ${recruiterToken}`)
                .send({
                    panelMemberIds: [panelistId],
                });

            expect(response.status).toBe(404);
        });
    });

    describe('POST /api/interviews/confirm-panelist', () => {
        it('confirms panelist participation with valid token', async () => {
            const mockPayload = {
                interviewStageId: interviewId,
                panelistId,
                action: 'confirm' as const,
            };

            vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
            vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
            vi.mocked(markTokenAsUsed).mockResolvedValue();

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'valid-token' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.status).toBe('confirmed');
            expect(markTokenAsUsed).toHaveBeenCalledWith(interviewId, panelistId);
        });

        it('declines panelist participation with valid token', async () => {
            const mockPayload = {
                interviewStageId: interviewId,
                panelistId,
                action: 'decline' as const,
            };

            vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
            vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
            vi.mocked(markTokenAsUsed).mockResolvedValue();

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'valid-token' });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('declined');
        });

        it('returns 401 for expired token', async () => {
            vi.mocked(validatePanelistConfirmationToken).mockRejectedValue(
                new Error('Confirmation link has expired')
            );

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'expired-token' });

            expect(response.status).toBe(401);
        });

        it('returns 401 for already used token', async () => {
            vi.mocked(validatePanelistConfirmationToken).mockRejectedValue(
                new Error('Token has already been used or is invalid')
            );

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'used-token' });

            expect(response.status).toBe(401);
        });

        it('returns 404 when confirmation record not found', async () => {
            vi.mocked(validatePanelistConfirmationToken).mockResolvedValue({
                interviewStageId: interviewId,
                panelistId,
                action: 'confirm',
            });
            vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 0 });

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'valid-token' });

            expect(response.status).toBe(404);
        });

        it('emits WebSocket event when panelist confirms', async () => {
            const mockPayload = {
                interviewStageId: interviewId,
                panelistId,
                action: 'confirm' as const,
            };

            vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
            vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
            vi.mocked(markTokenAsUsed).mockResolvedValue();

            const mockSocketServer = {
                emit: vi.fn(),
                to: vi.fn(() => ({ emit: vi.fn() })),
            };
            vi.mocked(getSocketServer).mockReturnValue(mockSocketServer as any);

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'valid-token' });

            expect(response.status).toBe(200);
            expect(mockSocketServer.emit).toHaveBeenCalledWith(
                'panelist:confirmed',
                expect.objectContaining({
                    interviewStageId: interviewId,
                    panelistId,
                    status: 'confirmed',
                    timestamp: expect.any(String),
                })
            );
        });

        it('emits WebSocket event when panelist declines', async () => {
            const mockPayload = {
                interviewStageId: interviewId,
                panelistId,
                action: 'decline' as const,
            };

            vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
            vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
            vi.mocked(markTokenAsUsed).mockResolvedValue();

            const mockSocketServer = {
                emit: vi.fn(),
                to: vi.fn(() => ({ emit: vi.fn() })),
            };
            vi.mocked(getSocketServer).mockReturnValue(mockSocketServer as any);

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'valid-token' });

            expect(response.status).toBe(200);
            expect(mockSocketServer.emit).toHaveBeenCalledWith(
                'panelist:confirmed',
                expect.objectContaining({
                    status: 'declined',
                })
            );
        });

        it('succeeds even if WebSocket emission fails', async () => {
            const mockPayload = {
                interviewStageId: interviewId,
                panelistId,
                action: 'confirm' as const,
            };

            vi.mocked(validatePanelistConfirmationToken).mockResolvedValue(mockPayload);
            vi.mocked(prisma.panelistConfirmation.updateMany).mockResolvedValue({ count: 1 });
            vi.mocked(markTokenAsUsed).mockResolvedValue();

            vi.mocked(getSocketServer).mockImplementation(() => {
                throw new Error('Socket.IO server not initialized');
            });

            const response = await request(app)
                .post('/api/interviews/confirm-panelist')
                .send({ token: 'valid-token' });

            // Should still return 200 even if WebSocket fails
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });
    });
});
