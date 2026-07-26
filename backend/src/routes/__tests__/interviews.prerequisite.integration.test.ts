import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

// Mock environment variables first
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

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn(() => ({
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
        })),
    },
}));

// Mock request logger middleware
vi.mock('../../middleware/requestLogger', () => ({
    requestLogger: (req: any, res: any, next: any) => next(),
    requestAuditLogger: (req: any, res: any, next: any) => next(),
}));

// Mock authenticate middleware
vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, res: any, next: any) => {
        req.user = { id: 'recruiter-123', role: 'recruiter' };
        next();
    },
}));

// Mock authorize middleware
vi.mock('../../middleware/authorize', () => ({
    authorize: () => (req: any, res: any, next: any) => next(),
}));

import { app } from '../../app';
import { prisma } from '../../db/prisma';

const mockAuditEvent = vi.fn();
vi.mock('../../services/auditService', () => ({
    auditEvent: mockAuditEvent,
}));

const mockEnqueueInterviewReminder = vi.fn();
vi.mock('../../queues/interviewReminderQueue', () => ({
    enqueueInterviewReminder: mockEnqueueInterviewReminder,
}));

const mockDispatchInterviewInviteEmail = vi.fn();
vi.mock('../../services/interviewInviteService', () => ({
    dispatchInterviewInviteEmail: mockDispatchInterviewInviteEmail,
}));

vi.mock('../../db/prisma', () => ({
    prisma: {
        user: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
        },
        application: {
            findUnique: vi.fn(),
        },
        interviewStage: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        template: {
            findFirst: vi.fn(),
        },
        communication: {
            create: vi.fn(),
            update: vi.fn(),
        },
    },
}));

describe('POST /api/interviews - Prerequisite Enforcement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAuditEvent.mockResolvedValue(undefined);
        mockEnqueueInterviewReminder.mockResolvedValue(undefined);
        mockDispatchInterviewInviteEmail.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Fresher Path Enforcement', () => {
        it('should block technical interview for fresher without completed aptitude', async () => {
            // Mock fresher application with no completed stages
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [],
                candidateId: 'candidate-123',
                requisitionId: 'req-123',
            } as any);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-123',
                    type: 'technical',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(422);
            expect(response.body.error).toBe('Prerequisite stage not complete');
            expect(response.body.missingStages).toContain('aptitude');
            expect(response.body.requestedStage).toBe('technical');

            // Verify audit event was logged
            expect(mockAuditEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventType: 'prerequisite_violation_attempt',
                    entityType: 'interview_stage',
                    entityId: 'app-123',
                    payload: expect.objectContaining({
                        requestedStage: 'technical',
                        missingStages: ['aptitude'],
                    }),
                })
            );
        });

        it('should allow technical interview for fresher after aptitude completion', async () => {
            // Mock fresher application with completed aptitude
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                candidateId: 'candidate-123',
                requisitionId: 'req-123',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
                candidate: {
                    id: 'candidate-123',
                    email: 'candidate@test.com',
                    timezone: 'UTC',
                    profile: { fullName: 'Test Candidate' },
                },
                requisition: {
                    id: 'req-123',
                    title: 'Software Engineer',
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: 'panelist-123',
                    email: 'panelist@test.com',
                    fullName: 'Test Panelist',
                    timezone: 'UTC',
                },
            ] as any);

            vi.mocked(prisma.user.findFirst).mockResolvedValue({
                id: 'recruiter-123',
                email: 'recruiter@test.com',
                fullName: 'Test Recruiter',
                timezone: 'UTC',
            } as any);

            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            vi.mocked(prisma.interviewStage.create).mockResolvedValue({
                id: 'interview-123',
                applicationId: 'app-123',
                type: 'technical',
                scheduledAt: new Date('2026-07-30T10:00:00Z'),
                endAt: new Date('2026-07-30T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: ['panelist-123'],
            } as any);

            vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-123',
                    type: 'technical',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.interview.type).toBe('technical');
        });

        it('should block cultural interview without both prerequisites', async () => {
            // Mock fresher application with only aptitude completed
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
            } as any);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-123',
                    type: 'cultural',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(422);
            expect(response.body.error).toBe('Prerequisite stage not complete');
            expect(response.body.missingStages).toContain('technical');
        });

        it('should allow cultural interview after all prerequisites complete', async () => {
            // Mock fresher application with aptitude and technical completed
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                candidateId: 'candidate-123',
                requisitionId: 'req-123',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                    { type: 'technical', state: 'completed' },
                ],
                candidate: {
                    id: 'candidate-123',
                    email: 'candidate@test.com',
                    timezone: 'UTC',
                    profile: { fullName: 'Test Candidate' },
                },
                requisition: {
                    id: 'req-123',
                    title: 'Software Engineer',
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: 'panelist-123',
                    email: 'panelist@test.com',
                    fullName: 'Test Panelist',
                    timezone: 'UTC',
                },
            ] as any);

            vi.mocked(prisma.user.findFirst).mockResolvedValue({
                id: 'recruiter-123',
                email: 'recruiter@test.com',
                fullName: 'Test Recruiter',
                timezone: 'UTC',
            } as any);

            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            vi.mocked(prisma.interviewStage.create).mockResolvedValue({
                id: 'interview-123',
                applicationId: 'app-123',
                type: 'cultural',
                scheduledAt: new Date('2026-07-30T10:00:00Z'),
                endAt: new Date('2026-07-30T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: ['panelist-123'],
            } as any);

            vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-123',
                    type: 'cultural',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
        });
    });

    describe('Experienced Path Enforcement', () => {
        it('should allow technical interview for experienced without aptitude', async () => {
            // Mock experienced application with no completed stages
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-456',
                path: 'experienced',
                candidateId: 'candidate-456',
                requisitionId: 'req-456',
                interviewStages: [],
                candidate: {
                    id: 'candidate-456',
                    email: 'candidate@test.com',
                    timezone: 'UTC',
                    profile: { fullName: 'Experienced Candidate' },
                },
                requisition: {
                    id: 'req-456',
                    title: 'Senior Software Engineer',
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: 'panelist-123',
                    email: 'panelist@test.com',
                    fullName: 'Test Panelist',
                    timezone: 'UTC',
                },
            ] as any);

            vi.mocked(prisma.user.findFirst).mockResolvedValue({
                id: 'recruiter-123',
                email: 'recruiter@test.com',
                fullName: 'Test Recruiter',
                timezone: 'UTC',
            } as any);

            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            vi.mocked(prisma.interviewStage.create).mockResolvedValue({
                id: 'interview-456',
                applicationId: 'app-456',
                type: 'technical',
                scheduledAt: new Date('2026-07-30T10:00:00Z'),
                endAt: new Date('2026-07-30T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: ['panelist-123'],
            } as any);

            vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-456',
                    type: 'technical',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.interview.type).toBe('technical');
        });

        it('should block aptitude for experienced path', async () => {
            // Mock experienced application
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-456',
                path: 'experienced',
                interviewStages: [],
            } as any);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-456',
                    type: 'aptitude',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(422);
            expect(response.body.error).toBe('Prerequisite stage not complete');
            expect(response.body.message).toContain('not part of experienced path');
        });

        it('should block system_design without completed technical', async () => {
            // Mock experienced application with no completed stages
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-456',
                path: 'experienced',
                interviewStages: [],
            } as any);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-456',
                    type: 'system_design',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(422);
            expect(response.body.missingStages).toContain('technical');
        });

        it('should allow system_design after technical completion', async () => {
            // Mock experienced application with completed technical
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-456',
                path: 'experienced',
                candidateId: 'candidate-456',
                requisitionId: 'req-456',
                interviewStages: [
                    { type: 'technical', state: 'completed' },
                ],
                candidate: {
                    id: 'candidate-456',
                    email: 'candidate@test.com',
                    timezone: 'UTC',
                    profile: { fullName: 'Experienced Candidate' },
                },
                requisition: {
                    id: 'req-456',
                    title: 'Senior Software Engineer',
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: 'panelist-123',
                    email: 'panelist@test.com',
                    fullName: 'Test Panelist',
                    timezone: 'UTC',
                },
            ] as any);

            vi.mocked(prisma.user.findFirst).mockResolvedValue({
                id: 'recruiter-123',
                email: 'recruiter@test.com',
                fullName: 'Test Recruiter',
                timezone: 'UTC',
            } as any);

            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);

            vi.mocked(prisma.interviewStage.create).mockResolvedValue({
                id: 'interview-456',
                applicationId: 'app-456',
                type: 'system_design',
                scheduledAt: new Date('2026-07-30T10:00:00Z'),
                endAt: new Date('2026-07-30T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: ['panelist-123'],
            } as any);

            vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

            const response = await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-456',
                    type: 'system_design',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
        });
    });

    describe('Audit Logging', () => {
        it('should log prerequisite violations to audit trail', async () => {
            // Mock fresher application with no completed stages
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [],
            } as any);

            await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-123',
                    type: 'technical',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            expect(mockAuditEvent).toHaveBeenCalledWith({
                actorId: 'recruiter-123',
                eventType: 'prerequisite_violation_attempt',
                entityType: 'interview_stage',
                entityId: 'app-123',
                payload: {
                    requestedStage: 'technical',
                    missingStages: ['aptitude'],
                    ipAddress: expect.any(String),
                },
            });
        });

        it('should not log audit event when prerequisites are met', async () => {
            // Mock fresher application with completed aptitude
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                candidateId: 'candidate-123',
                requisitionId: 'req-123',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
                candidate: {
                    id: 'candidate-123',
                    email: 'candidate@test.com',
                    timezone: 'UTC',
                    profile: { fullName: 'Test Candidate' },
                },
                requisition: {
                    id: 'req-123',
                    title: 'Software Engineer',
                },
            } as any);

            vi.mocked(prisma.user.findMany).mockResolvedValue([
                {
                    id: 'panelist-123',
                    email: 'panelist@test.com',
                    fullName: 'Test Panelist',
                    timezone: 'UTC',
                },
            ] as any);

            vi.mocked(prisma.user.findFirst).mockResolvedValue({
                id: 'recruiter-123',
                email: 'recruiter@test.com',
                fullName: 'Test Recruiter',
                timezone: 'UTC',
            } as any);

            vi.mocked(prisma.interviewStage.findMany).mockResolvedValue([]);
            vi.mocked(prisma.interviewStage.create).mockResolvedValue({
                id: 'interview-123',
                applicationId: 'app-123',
                type: 'technical',
                scheduledAt: new Date('2026-07-30T10:00:00Z'),
                endAt: new Date('2026-07-30T11:00:00Z'),
                timezone: 'UTC',
                panelMembers: ['panelist-123'],
            } as any);

            vi.mocked(prisma.template.findFirst).mockResolvedValue(null);

            await request(app)
                .post('/api/interviews')
                .send({
                    applicationId: 'app-123',
                    type: 'technical',
                    startAt: '2026-07-30T10:00:00Z',
                    endAt: '2026-07-30T11:00:00Z',
                    timezone: 'UTC',
                    panelMemberIds: ['panelist-123'],
                });

            // Should not have called audit event for prerequisite violation
            const prerequisiteViolationCalls = mockAuditEvent.mock.calls.filter(
                (call: any[]) => call[0].eventType === 'prerequisite_violation_attempt'
            );
            expect(prerequisiteViolationCalls).toHaveLength(0);
        });
    });
});
