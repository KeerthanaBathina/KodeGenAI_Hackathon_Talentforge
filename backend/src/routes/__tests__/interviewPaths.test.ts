import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import { app } from '../../app';
import { prisma } from '../../db/prisma';

// Mock the authenticate middleware
vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, res: any, next: any) => {
        req.user = { id: 'user-123', role: 'recruiter' };
        next();
    },
}));

vi.mock('../../db/prisma', () => ({
    prisma: {
        application: {
            findUnique: vi.fn(),
        },
    },
}));

describe('Interview Paths API Routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('GET /api/interview-paths/:path/sequence', () => {
        it('should return fresher sequence', async () => {
            const response = await request(app)
                .get('/api/interview-paths/fresher/sequence')
                .expect(200);

            expect(response.body.path).toBe('fresher');
            expect(response.body.sequence).toHaveLength(3);
            expect(response.body.sequence[0].stage).toBe('aptitude');
            expect(response.body.sequence[0].prerequisites).toEqual([]);
            expect(response.body.sequence[1].stage).toBe('technical');
            expect(response.body.sequence[1].prerequisites).toEqual(['aptitude']);
            expect(response.body.sequence[2].stage).toBe('cultural');
            expect(response.body.sequence[2].prerequisites).toEqual(['aptitude', 'technical']);
        });

        it('should return experienced sequence', async () => {
            const response = await request(app)
                .get('/api/interview-paths/experienced/sequence')
                .expect(200);

            expect(response.body.path).toBe('experienced');
            expect(response.body.sequence).toHaveLength(3);
            expect(response.body.sequence[0].stage).toBe('technical');
            expect(response.body.sequence[0].prerequisites).toEqual([]);
            expect(response.body.sequence[1].stage).toBe('system_design');
            expect(response.body.sequence[1].prerequisites).toEqual(['technical']);
            expect(response.body.sequence[2].stage).toBe('cultural');
        });

        it('should return 400 for invalid path', async () => {
            const response = await request(app)
                .get('/api/interview-paths/invalid/sequence')
                .expect(400);

            expect(response.body.error).toBe('Invalid path');
            expect(response.body.message).toContain('fresher');
            expect(response.body.message).toContain('experienced');
        });

        it('should not include aptitude in experienced sequence', async () => {
            const response = await request(app)
                .get('/api/interview-paths/experienced/sequence')
                .expect(200);

            const hasAptitude = response.body.sequence.some((s: any) => s.stage === 'aptitude');
            expect(hasAptitude).toBe(false);
        });

        it('should include system_design in experienced sequence', async () => {
            const response = await request(app)
                .get('/api/interview-paths/experienced/sequence')
                .expect(200);

            const hasSystemDesign = response.body.sequence.some((s: any) => s.stage === 'system_design');
            expect(hasSystemDesign).toBe(true);
        });
    });

    describe('GET /api/interview-paths/applications/:applicationId/stage-status', () => {
        it('should return stage status for application', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                ],
            } as any);

            const response = await request(app)
                .get('/api/interview-paths/applications/app-123/stage-status')
                .expect(200);

            expect(response.body).toHaveLength(3);
            expect(response.body[0].stage).toBe('aptitude');
            expect(response.body[0].status).toBe('completed');
            expect(response.body[1].stage).toBe('technical');
            expect(response.body[1].status).toBe('available');
        });

        it('should return 404 for non-existent application', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

            const response = await request(app)
                .get('/api/interview-paths/applications/app-nonexistent/stage-status')
                .expect(404);

            expect(response.body.error).toBe('Application not found');
        });

        it('should show locked stages with missing prerequisites', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [],
            } as any);

            const response = await request(app)
                .get('/api/interview-paths/applications/app-123/stage-status')
                .expect(200);

            const culturalStage = response.body.find((s: any) => s.stage === 'cultural');
            expect(culturalStage.status).toBe('locked');
            expect(culturalStage.missingPrerequisites).toContain('aptitude');
            expect(culturalStage.missingPrerequisites).toContain('technical');
        });

        it('should handle experienced path correctly', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-456',
                path: 'experienced',
                interviewStages: [],
            } as any);

            const response = await request(app)
                .get('/api/interview-paths/applications/app-456/stage-status')
                .expect(200);

            expect(response.body).toHaveLength(3);
            expect(response.body[0].stage).toBe('technical');
            expect(response.body[0].status).toBe('available');
            
            const hasAptitude = response.body.some((s: any) => s.stage === 'aptitude');
            expect(hasAptitude).toBe(false);
        });

        it('should show all stages completed when path is complete', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue({
                id: 'app-123',
                path: 'fresher',
                interviewStages: [
                    { type: 'aptitude', state: 'completed' },
                    { type: 'technical', state: 'completed' },
                    { type: 'cultural', state: 'completed' },
                ],
            } as any);

            const response = await request(app)
                .get('/api/interview-paths/applications/app-123/stage-status')
                .expect(200);

            expect(response.body.every((s: any) => s.status === 'completed')).toBe(true);
        });
    });
});
