import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../../db/prisma';
import profileRouter from '../profile';
import { JwtService } from '../../services/jwtService';

// Mock authenticate middleware
vi.mock('../../middleware/authenticate', () => ({
    authenticate: (req: any, res: any, next: any) => {
        req.user = { id: req.headers['x-test-candidate-id'], email: 'test@example.com', role: 'candidate' };
        next();
    },
}));

vi.mock('../../utils/logger', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/profile', profileRouter);
    return app;
}

describe('profile API integration tests', () => {
    let testCandidate: any;
    let app: express.Application;

    beforeEach(async () => {
        testCandidate = await prisma.candidate.create({
            data: {
                email: `profile-api-test-${Date.now()}@example.com`,
                fullName: 'Test User',
                phoneNumber: null,
                status: 'active',
            },
        });

        app = createTestApp();
    });

    afterEach(async () => {
        await prisma.privacyConsent.deleteMany({ where: { candidateId: testCandidate.id } });
        await prisma.profile.deleteMany({ where: { candidateId: testCandidate.id } });
        await prisma.candidate.delete({ where: { id: testCandidate.id } });
    });

    describe('GET /api/profile', () => {
        it('returns 404 when profile does not exist', async () => {
            const response = await request(app)
                .get('/api/profile')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
        });

        it('returns profile with completion status', async () => {
            await prisma.profile.create({
                data: {
                    candidateId: testCandidate.id,
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JavaScript', 'TypeScript', 'React'],
                    education: [
                        {
                            institution: 'MIT',
                            degree: 'BS CS',
                            startDate: '2015-09-01',
                            isCurrent: false,
                        },
                    ],
                    workHistory: [],
                    profileCompletionPercentage: 60,
                },
            });

            const response = await request(app)
                .get('/api/profile')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body.fullName).toBe('Jane Doe');
            expect(response.body.experienceYears).toBe(5);
            expect(response.body.skills).toHaveLength(3);
            expect(response.body.education).toHaveLength(1);
            expect(response.body.profileCompletionPercentage).toBe(60);
            expect(response.body.completionStatus).toBeDefined();
        });
    });

    describe('POST /api/profile', () => {
        it('creates new profile with valid data', async () => {
            const response = await request(app)
                .post('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JavaScript', 'TypeScript', 'React'],
                    education: [
                        {
                            institution: 'MIT',
                            degree: 'BS CS',
                            fieldOfStudy: 'Computer Science',
                            startDate: '2015-09-01',
                            isCurrent: false,
                        },
                    ],
                    workHistory: [
                        {
                            company: 'TechCorp',
                            title: 'Software Engineer',
                            startDate: '2020-01-01',
                            isCurrent: true,
                        },
                    ],
                });

            expect(response.status).toBe(201);
            expect(response.body.fullName).toBe('Jane Doe');
            expect(response.body.experienceYears).toBe(5);
            expect(response.body.skills).toHaveLength(3);
            expect(response.body.profileCompletionPercentage).toBe(80);
        });

        it('returns 400 for invalid data', async () => {
            const response = await request(app)
                .post('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    fullName: '', // Invalid: empty name
                    experienceYears: -5, // Invalid: negative
                    skills: ['JS'],
                    education: [],
                    workHistory: [],
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });

        it('returns 400 when profile already exists', async () => {
            await prisma.profile.create({
                data: {
                    candidateId: testCandidate.id,
                    fullName: 'Existing',
                    experienceYears: 0,
                    skills: [],
                    education: [],
                    workHistory: [],
                    profileCompletionPercentage: 0,
                },
            });

            const response = await request(app)
                .post('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    fullName: 'New',
                    experienceYears: 1,
                    skills: [],
                    education: [],
                    workHistory: [],
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('PROFILE_ALREADY_EXISTS');
        });

        it('validates skills array minimum length', async () => {
            const response = await request(app)
                .post('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JS', 'TS'], // Only 2 skills (min is 3)
                    education: [],
                    workHistory: [],
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBeDefined();
        });

        it('validates education required fields', async () => {
            const response = await request(app)
                .post('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JS', 'TS', 'React'],
                    education: [
                        {
                            institution: '', // Missing required field
                            degree: 'BS CS',
                            startDate: '2015-09-01',
                            isCurrent: false,
                        },
                    ],
                    workHistory: [],
                });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/profile', () => {
        it('updates existing profile', async () => {
            await prisma.profile.create({
                data: {
                    candidateId: testCandidate.id,
                    fullName: 'Original Name',
                    experienceYears: 5,
                    skills: ['JavaScript'],
                    education: [],
                    workHistory: [],
                    profileCompletionPercentage: 20,
                },
            });

            const response = await request(app)
                .put('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
                });

            expect(response.status).toBe(200);
            expect(response.body.fullName).toBe('Original Name'); // Unchanged
            expect(response.body.skills).toHaveLength(4);
            expect(response.body.profileCompletionPercentage).toBeGreaterThan(20);
        });

        it('returns 404 when profile does not exist', async () => {
            const response = await request(app)
                .put('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    fullName: 'Updated Name',
                });

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
        });

        it('allows partial updates', async () => {
            await prisma.profile.create({
                data: {
                    candidateId: testCandidate.id,
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JavaScript', 'TypeScript', 'React'],
                    education: [],
                    workHistory: [],
                    profileCompletionPercentage: 40,
                },
            });

            const response = await request(app)
                .put('/api/profile')
                .set('x-test-candidate-id', testCandidate.id)
                .send({
                    experienceYears: 10,
                });

            expect(response.status).toBe(200);
            expect(response.body.experienceYears).toBe(10);
            expect(response.body.fullName).toBe('Jane Doe');
            expect(response.body.skills).toHaveLength(3);
        });
    });

    describe('GET /api/profile/completion', () => {
        it('returns completion status', async () => {
            await prisma.profile.create({
                data: {
                    candidateId: testCandidate.id,
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JavaScript', 'TypeScript', 'React'],
                    education: [
                        {
                            institution: 'MIT',
                            degree: 'BS CS',
                            startDate: '2015-09-01',
                            isCurrent: false,
                        },
                    ],
                    workHistory: [
                        {
                            company: 'TechCorp',
                            title: 'Engineer',
                            startDate: '2020-01-01',
                            isCurrent: true,
                        },
                    ],
                    profileCompletionPercentage: 80,
                },
            });

            const response = await request(app)
                .get('/api/profile/completion')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body.percentage).toBe(80);
            expect(response.body.completedSections).toHaveLength(4);
            expect(response.body.missingFields).toContain('privacyConsent');
        });

        it('returns 404 when profile does not exist', async () => {
            const response = await request(app)
                .get('/api/profile/completion')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(404);
        });

        it('returns 100% when all sections including consent are complete', async () => {
            await prisma.profile.create({
                data: {
                    candidateId: testCandidate.id,
                    fullName: 'Jane Doe',
                    experienceYears: 5,
                    skills: ['JavaScript', 'TypeScript', 'React'],
                    education: [
                        {
                            institution: 'MIT',
                            degree: 'BS CS',
                            startDate: '2015-09-01',
                            isCurrent: false,
                        },
                    ],
                    workHistory: [
                        {
                            company: 'TechCorp',
                            title: 'Engineer',
                            startDate: '2020-01-01',
                            isCurrent: true,
                        },
                    ],
                    profileCompletionPercentage: 100,
                },
            });

            await prisma.privacyConsent.create({
                data: {
                    candidateId: testCandidate.id,
                    policyVersion: '1.0',
                    ipAddress: '127.0.0.1',
                },
            });

            const response = await request(app)
                .get('/api/profile/completion')
                .set('x-test-candidate-id', testCandidate.id);

            expect(response.status).toBe(200);
            expect(response.body.percentage).toBe(100);
            expect(response.body.completedSections).toHaveLength(5);
            expect(response.body.missingFields).toHaveLength(0);
        });
    });
});
