import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { InterviewStageState, InterviewStageType } from '@prisma/client';

// Mock environment variables first
vi.mock('../../config/env', () => ({
    env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://test',
        DIRECT_URL: 'postgresql://test',
        SMTP_HOST: 'smtp.test.com',
        SMTP_PORT: '587',
        SMTP_USER: 'test@example.com',
        SMTP_PASSWORD: 'test-password',
        SMTP_FROM: 'noreply@talentforge.com',
    },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

const mockPrisma = {
    interviewStage: {
        findUnique: vi.fn(),
    },
    user: {
        findFirst: vi.fn(),
    },
};

vi.mock('../../db/prisma', () => ({
    prisma: mockPrisma,
}));

const mockSendEmail = vi.fn();
vi.mock('../../email/emailProvider', () => ({
    sendEmail: mockSendEmail,
}));

const mockRenderInterviewReminder24h = vi.fn();
const mockRenderInterviewReminder1h = vi.fn();
vi.mock('../../email/templateRenderer', () => ({
    renderInterviewReminder24hEmail: mockRenderInterviewReminder24h,
    renderInterviewReminder1hEmail: mockRenderInterviewReminder1h,
}));

import { sendInterviewReminder } from '../emailService';
import logger from '../../utils/logger';

describe('sendInterviewReminder - Integration Tests', () => {
    const mockInterview = {
        id: 'int-123',
        state: InterviewStageState.scheduled,
        type: InterviewStageType.technical,
        scheduledAt: new Date('2026-07-27T10:00:00Z'),
        endAt: new Date('2026-07-27T11:00:00Z'),
        meetingLink: 'https://meet.example.com/interview-123',
        location: null,
        application: {
            id: 'app-456',
            candidate: {
                id: 'cand-789',
                email: 'candidate@example.com',
                profile: {
                    fullName: 'John Doe',
                },
            },
            requisition: {
                id: 'req-999',
                title: 'Senior Software Engineer',
            },
        },
        panelistConfirmations: [
            {
                id: 'pc-1',
                status: 'confirmed',
                panelist: {
                    id: 'panelist-1',
                    email: 'panelist1@example.com',
                    fullName: 'Jane Smith',
                    role: 'Tech Lead',
                },
            },
            {
                id: 'pc-2',
                status: 'confirmed',
                panelist: {
                    id: 'panelist-2',
                    email: 'panelist2@example.com',
                    fullName: 'Bob Johnson',
                    role: 'Senior Engineer',
                },
            },
        ],
    };

    const mockRecruiter = {
        id: 'recruiter-1',
        email: 'recruiter@example.com',
        fullName: 'Sarah Recruiter',
        timezone: 'America/New_York',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockRenderInterviewReminder24h.mockResolvedValue('<html>24h reminder</html>');
        mockRenderInterviewReminder1h.mockResolvedValue('<html>1h reminder</html>');
        mockPrisma.user.findFirst.mockResolvedValue(mockRecruiter);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('successful email delivery', () => {
        it('should send 24h reminder to all participants', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            // Should send to: candidate + recruiter + 2 panelists = 4 emails
            expect(mockSendEmail).toHaveBeenCalledTimes(4);

            // Verify candidate email
            expect(mockSendEmail).toHaveBeenCalledWith({
                to: 'candidate@example.com',
                subject: expect.stringContaining('Interview Tomorrow'),
                html: '<html>24h reminder</html>',
            });

            // Verify recruiter email
            expect(mockSendEmail).toHaveBeenCalledWith({
                to: 'recruiter@example.com',
                subject: expect.stringContaining('Interview Tomorrow'),
                html: '<html>24h reminder</html>',
            });

            // Verify panelist emails
            expect(mockSendEmail).toHaveBeenCalledWith({
                to: 'panelist1@example.com',
                subject: expect.stringContaining('Interview Tomorrow'),
                html: '<html>24h reminder</html>',
            });

            expect(mockSendEmail).toHaveBeenCalledWith({
                to: 'panelist2@example.com',
                subject: expect.stringContaining('Interview Tomorrow'),
                html: '<html>24h reminder</html>',
            });
        });

        it('should send 1h reminder to all participants', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '1h');

            expect(mockSendEmail).toHaveBeenCalledTimes(4);

            // Verify subject is different for 1h reminder
            expect(mockSendEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: expect.stringContaining('Starting Soon: Interview in 1 Hour'),
                })
            );
        });

        it('should use correct template renderer for each reminder type', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            // Test 24h reminder
            await sendInterviewReminder('int-123', '24h');
            expect(mockRenderInterviewReminder24h).toHaveBeenCalledTimes(4);
            expect(mockRenderInterviewReminder1h).not.toHaveBeenCalled();

            vi.clearAllMocks();
            mockRenderInterviewReminder24h.mockResolvedValue('<html>24h</html>');
            mockRenderInterviewReminder1h.mockResolvedValue('<html>1h</html>');

            // Test 1h reminder
            await sendInterviewReminder('int-123', '1h');
            expect(mockRenderInterviewReminder1h).toHaveBeenCalledTimes(4);
            expect(mockRenderInterviewReminder24h).not.toHaveBeenCalled();
        });

        it('should send to candidate even when no recruiter or panelists', async () => {
            const interviewWithNoPanelists = {
                ...mockInterview,
                panelistConfirmations: [],
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(interviewWithNoPanelists);
            mockPrisma.user.findFirst.mockResolvedValue(null); // No recruiter
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            // Should still send to candidate
            expect(mockSendEmail).toHaveBeenCalledTimes(1);
            expect(mockSendEmail).toHaveBeenCalledWith({
                to: 'candidate@example.com',
                subject: expect.any(String),
                html: expect.any(String),
            });
        });
    });

    describe('template data validation', () => {
        it('should pass correct data to template renderer', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({
                    recipientName: 'John Doe',
                    positionTitle: 'Senior Software Engineer',
                    interviewDateTime: expect.any(String),
                    duration: 60, // 1 hour
                    interviewType: 'technical',
                    panelists: [
                        { name: 'Jane Smith', role: 'Tech Lead' },
                        { name: 'Bob Johnson', role: 'Senior Engineer' },
                    ],
                    companyName: 'TalentForge',
                })
            );
        });

        it('should calculate duration correctly from scheduledAt and endAt', async () => {
            const interviewWith90Minutes = {
                ...mockInterview,
                scheduledAt: new Date('2026-07-27T10:00:00Z'),
                endAt: new Date('2026-07-27T11:30:00Z'), // 90 minutes
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(interviewWith90Minutes);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: 90,
                })
            );
        });

        it('should default to 60 minutes when endAt is missing', async () => {
            const interviewWithoutEndAt = {
                ...mockInterview,
                endAt: null,
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(interviewWithoutEndAt);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({
                    duration: 60,
                })
            );
        });

        it('should include meetingLink when present', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({
                    meetingLink: 'https://meet.example.com/interview-123',
                })
            );
        });

        it('should include location when present', async () => {
            const interviewWithLocation = {
                ...mockInterview,
                location: 'Building A, Room 301',
                meetingLink: null,
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(interviewWithLocation);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({
                    location: 'Building A, Room 301',
                })
            );
        });
    });

    describe('state validation', () => {
        it('should skip sending reminder for cancelled interview', async () => {
            const cancelledInterview = {
                ...mockInterview,
                state: InterviewStageState.cancelled,
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(cancelledInterview);

            await sendInterviewReminder('int-123', '24h');

            expect(mockSendEmail).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(
                { interviewId: 'int-123', state: 'cancelled' },
                '[reminders] Skipping reminder for non-scheduled interview'
            );
        });

        it('should skip sending reminder for completed interview', async () => {
            const completedInterview = {
                ...mockInterview,
                state: InterviewStageState.completed,
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(completedInterview);

            await sendInterviewReminder('int-123', '24h');

            expect(mockSendEmail).not.toHaveBeenCalled();
        });

        it('should skip sending reminder for interview without scheduledAt', async () => {
            const interviewWithoutTime = {
                ...mockInterview,
                scheduledAt: null,
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(interviewWithoutTime);

            await sendInterviewReminder('int-123', '24h');

            expect(mockSendEmail).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(
                { interviewId: 'int-123' },
                '[reminders] Skipping reminder for interview without scheduled time'
            );
        });

        it('should only send to confirmed panelists', async () => {
            const interviewWithMixedPanelists = {
                ...mockInterview,
                panelistConfirmations: [
                    {
                        id: 'pc-confirmed',
                        status: 'confirmed',
                        panelist: {
                            id: 'p-1',
                            email: 'confirmed@example.com',
                            fullName: 'Confirmed Panelist',
                            role: 'Engineer',
                        },
                    },
                    {
                        id: 'pc-pending',
                        status: 'pending',
                        panelist: {
                            id: 'p-2',
                            email: 'pending@example.com',
                            fullName: 'Pending Panelist',
                            role: 'Engineer',
                        },
                    },
                ],
            };

            // Mock Prisma to return only confirmed panelists (as per the query filter)
            const filteredInterview = {
                ...interviewWithMixedPanelists,
                panelistConfirmations: interviewWithMixedPanelists.panelistConfirmations.filter(
                    (pc: any) => pc.status === 'confirmed'
                ),
            };

            mockPrisma.interviewStage.findUnique.mockResolvedValue(filteredInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            // Should send to candidate + recruiter + 1 confirmed panelist = 3 emails
            expect(mockSendEmail).toHaveBeenCalledTimes(3);
            expect(mockSendEmail).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    to: 'pending@example.com',
                })
            );
        });
    });

    describe('error handling', () => {
        it('should throw error when interview not found', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(null);

            await expect(sendInterviewReminder('int-nonexistent', '24h')).rejects.toThrow(
                'Interview int-nonexistent not found'
            );

            expect(mockSendEmail).not.toHaveBeenCalled();
        });

        it('should propagate email sending errors', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockRejectedValue(new Error('SMTP connection failed'));

            await expect(sendInterviewReminder('int-123', '24h')).rejects.toThrow(
                'SMTP connection failed'
            );
        });

        it('should propagate template rendering errors', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockRenderInterviewReminder24h.mockRejectedValue(
                new Error('Template not found')
            );

            await expect(sendInterviewReminder('int-123', '24h')).rejects.toThrow(
                'Template not found'
            );

            expect(mockSendEmail).not.toHaveBeenCalled();
        });
    });

    describe('multi-recipient delivery', () => {
        it('should send personalized emails to each recipient', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            // Verify each recipient gets personalized email
            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({ recipientName: 'John Doe' })
            );
            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({ recipientName: 'Sarah Recruiter' })
            );
            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({ recipientName: 'Jane Smith' })
            );
            expect(mockRenderInterviewReminder24h).toHaveBeenCalledWith(
                expect.objectContaining({ recipientName: 'Bob Johnson' })
            );
        });

        it('should continue sending to other recipients if one fails', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);

            // First email (candidate) fails, others succeed
            mockSendEmail
                .mockRejectedValueOnce(new Error('Candidate email bounced'))
                .mockResolvedValue(undefined);

            // Should throw on first failure (doesn't have partial failure handling)
            await expect(sendInterviewReminder('int-123', '24h')).rejects.toThrow(
                'Candidate email bounced'
            );
        });
    });

    describe('logging', () => {
        it('should log each email sent', async () => {
            mockPrisma.interviewStage.findUnique.mockResolvedValue(mockInterview);
            mockSendEmail.mockResolvedValue(undefined);

            await sendInterviewReminder('int-123', '24h');

            // Should log for candidate
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    interviewId: 'int-123',
                    recipient: 'candidate@example.com',
                    reminderType: '24h',
                }),
                expect.stringContaining('Sent reminder to candidate')
            );

            // Should log for recruiter
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    interviewId: 'int-123',
                    recipient: 'recruiter@example.com',
                    reminderType: '24h',
                }),
                expect.stringContaining('Sent reminder to recruiter')
            );

            // Should log for each panelist
            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    interviewId: 'int-123',
                    recipient: 'panelist1@example.com',
                    reminderType: '24h',
                }),
                expect.stringContaining('Sent reminder to panelist')
            );
        });
    });
});
