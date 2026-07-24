import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../../db/prisma';
import requisitionRouter from '../requisitions';

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
    app.use('/api/requisitions', requisitionRouter);
    return app;
}

describe('requisitions API integration tests', () => {
    let testJobFamily: any;
    let testRequisitions: any[] = [];

    beforeEach(async () => {
        // Create test job family
        testJobFamily = await prisma.jobFamily.create({
            data: {
                name: `Test Family ${Date.now()}`,
                description: 'Test job family',
            },
        });

        // Create diverse test requisitions
        testRequisitions = await Promise.all([
            prisma.requisition.create({
                data: {
                    title: 'Senior Backend Engineer',
                    department: 'Engineering',
                    location: 'Remote',
                    jobType: 'full_time',
                    jobFamilyId: testJobFamily.id,
                    slots: 3,
                    filledSlots: 1,
                    status: 'open',
                    eligibilityCriteria: { minYearsExperience: 5, requiredSkills: ['Node.js', 'TypeScript'] },
                    openedAt: new Date(),
                },
            }),
            prisma.requisition.create({
                data: {
                    title: 'Marketing Analyst',
                    department: 'Marketing',
                    location: 'New York',
                    jobType: 'full_time',
                    jobFamilyId: testJobFamily.id,
                    slots: 2,
                    filledSlots: 0,
                    status: 'open',
                    eligibilityCriteria: { minYearsExperience: 2 },
                    openedAt: new Date(),
                },
            }),
            prisma.requisition.create({
                data: {
                    title: 'Frontend Developer',
                    department: 'Engineering',
                    location: 'San Francisco',
                    jobType: 'contract',
                    jobFamilyId: testJobFamily.id,
                    slots: 1,
                    filledSlots: 0,
                    status: 'open',
                    eligibilityCriteria: { minYearsExperience: 3 },
                    openedAt: new Date(),
                },
            }),
            prisma.requisition.create({
                data: {
                    title: 'Data Scientist',
                    department: 'Engineering',
                    location: 'Remote',
                    jobType: 'full_time',
                    jobFamilyId: testJobFamily.id,
                    slots: 2,
                    filledSlots: 0,
                    status: 'open',
                    eligibilityCriteria: { minYearsExperience: 7 },
                    openedAt: new Date(),
                },
            }),
            prisma.requisition.create({
                data: {
                    title: 'Intern Designer',
                    department: 'Design',
                    location: 'Austin',
                    jobType: 'internship',
                    jobFamilyId: testJobFamily.id,
                    slots: 1,
                    filledSlots: 0,
                    status: 'open',
                    eligibilityCriteria: { minYearsExperience: 0 },
                    openedAt: new Date(),
                },
            }),
            // Closed requisition (should not appear)
            prisma.requisition.create({
                data: {
                    title: 'Closed Position',
                    department: 'Finance',
                    location: 'Boston',
                    jobType: 'full_time',
                    jobFamilyId: testJobFamily.id,
                    slots: 1,
                    filledSlots: 1,
                    status: 'closed',
                    eligibilityCriteria: {},
                    openedAt: new Date(),
                    closedAt: new Date(),
                },
            }),
        ]);
    });

    afterEach(async () => {
        await prisma.requisition.deleteMany({ where: { jobFamilyId: testJobFamily.id } });
        await prisma.jobFamily.delete({ where: { id: testJobFamily.id } });
    });

    describe('GET /api/requisitions', () => {
        it('returns paginated list with default params', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions');

            expect(response.status).toBe(200);
            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.data.length).toBeLessThanOrEqual(20); // Default pageSize
            expect(response.body.pagination).toMatchObject({
                page: 1,
                pageSize: 20,
                totalItems: expect.any(Number),
                totalPages: expect.any(Number),
                hasNextPage: expect.any(Boolean),
                hasPrevPage: false,
            });
            // Should not include closed requisitions
            expect(response.body.data.every((r: any) => r.status === 'open')).toBe(true);
        });

        it('filters by department (exact match)', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?department=Engineering');

            expect(response.status).toBe(200);
            expect(response.body.data.every((r: any) => r.department === 'Engineering')).toBe(true);
            expect(response.body.data.length).toBe(3); // Backend, Frontend, Data Scientist
            expect(response.body.filters.department).toBe('Engineering');
        });

        it('filters by location (exact match)', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?location=Remote');

            expect(response.status).toBe(200);
            expect(response.body.data.every((r: any) => r.location === 'Remote')).toBe(true);
            expect(response.body.data.length).toBe(2); // Backend, Data Scientist
        });

        it('filters by jobType with enum validation', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?jobType=internship');

            expect(response.status).toBe(200);
            expect(response.body.data.every((r: any) => r.jobType === 'internship')).toBe(true);
            expect(response.body.data.length).toBe(1); // Intern Designer
        });

        it('returns 400 for invalid jobType enum', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?jobType=invalid_type');

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
        });

        it('filters by experienceLevel (minYearsExperience <= provided)', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?experienceLevel=5');

            expect(response.status).toBe(200);
            // Should include: Marketing Analyst (2), Frontend (3), Senior Backend (5), Intern (0)
            // Should exclude: Data Scientist (7)
            expect(response.body.data.length).toBe(4);
            response.body.data.forEach((req: any) => {
                const minYears = req.eligibilityCriteria.minYearsExperience || 0;
                expect(minYears).toBeLessThanOrEqual(5);
            });
        });

        it('keyword search finds title matches (case-insensitive)', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?keyword=backend');

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].title).toBe('Senior Backend Engineer');
            expect(response.body.filters.keyword).toBe('backend');
        });

        it('keyword search finds department matches (case-insensitive)', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?keyword=marketing');

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(1);
            expect(response.body.data[0].department).toBe('Marketing');
        });

        it('multiple filters combine with AND logic', async () => {
            const app = createTestApp();

            const response = await request(app).get(
                '/api/requisitions?department=Engineering&location=Remote'
            );

            expect(response.status).toBe(200);
            expect(response.body.data.length).toBe(2); // Backend, Data Scientist
            expect(response.body.data.every((r: any) => r.department === 'Engineering')).toBe(true);
            expect(response.body.data.every((r: any) => r.location === 'Remote')).toBe(true);
        });

        it('pagination metadata is accurate', async () => {
            const app = createTestApp();

            // Create 25 more requisitions to test pagination
            const additionalReqs = [];
            for (let i = 0; i < 25; i++) {
                additionalReqs.push(
                    prisma.requisition.create({
                        data: {
                            title: `Test Position ${i}`,
                            department: 'Engineering',
                            location: 'Remote',
                            jobType: 'full_time',
                            jobFamilyId: testJobFamily.id,
                            slots: 1,
                            filledSlots: 0,
                            status: 'open',
                            eligibilityCriteria: {},
                            openedAt: new Date(),
                        },
                    })
                );
            }
            await Promise.all(additionalReqs);

            const response = await request(app).get('/api/requisitions?pageSize=10');

            expect(response.status).toBe(200);
            expect(response.body.pagination.page).toBe(1);
            expect(response.body.pagination.pageSize).toBe(10);
            expect(response.body.pagination.totalItems).toBeGreaterThanOrEqual(30);
            expect(response.body.pagination.totalPages).toBeGreaterThanOrEqual(3);
            expect(response.body.pagination.hasNextPage).toBe(true);
            expect(response.body.pagination.hasPrevPage).toBe(false);
        });

        it('page 2 returns correct slice', async () => {
            const app = createTestApp();

            // Create 25 more requisitions
            const additionalReqs = [];
            for (let i = 0; i < 25; i++) {
                additionalReqs.push(
                    prisma.requisition.create({
                        data: {
                            title: `Test Position ${i}`,
                            department: 'Engineering',
                            location: 'Remote',
                            jobType: 'full_time',
                            jobFamilyId: testJobFamily.id,
                            slots: 1,
                            filledSlots: 0,
                            status: 'open',
                            eligibilityCriteria: {},
                            openedAt: new Date(),
                        },
                    })
                );
            }
            await Promise.all(additionalReqs);

            const response = await request(app).get('/api/requisitions?page=2&pageSize=10');

            expect(response.status).toBe(200);
            expect(response.body.pagination.page).toBe(2);
            expect(response.body.data.length).toBe(10);
            expect(response.body.pagination.hasPrevPage).toBe(true);
        });

        it('returns 400 for invalid query parameters', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?page=-1');

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
        });

        it('respects pageSize max limit (100)', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions?pageSize=150');

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_QUERY_PARAMS');
        });

        it('only returns open requisitions by default', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions');

            expect(response.status).toBe(200);
            expect(response.body.data.every((r: any) => r.status === 'open')).toBe(true);
            expect(response.body.data.find((r: any) => r.title === 'Closed Position')).toBeUndefined();
        });
    });

    describe('GET /api/requisitions/filters', () => {
        it('returns available filter options', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions/filters');

            expect(response.status).toBe(200);
            expect(response.body.departments).toBeInstanceOf(Array);
            expect(response.body.locations).toBeInstanceOf(Array);
            expect(response.body.jobTypes).toEqual([
                'full_time',
                'part_time',
                'contract',
                'internship',
            ]);
            expect(response.body.departments).toContain('Engineering');
            expect(response.body.departments).toContain('Marketing');
            expect(response.body.locations).toContain('Remote');
        });

        it('only returns options from open requisitions', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions/filters');

            expect(response.status).toBe(200);
            // Finance department only has closed requisition, should not appear
            expect(response.body.departments).not.toContain('Finance');
        });
    });

    describe('GET /api/requisitions/:id', () => {
        it('returns requisition by ID with job family details', async () => {
            const app = createTestApp();

            const response = await request(app).get(`/api/requisitions/${testRequisitions[0].id}`);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(testRequisitions[0].id);
            expect(response.body.title).toBe('Senior Backend Engineer');
            expect(response.body.jobFamily).toMatchObject({
                id: testJobFamily.id,
                name: expect.any(String),
            });
        });

        it('returns 404 for non-existent requisition', async () => {
            const app = createTestApp();

            const response = await request(app).get('/api/requisitions/00000000-0000-0000-0000-000000000000');

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('REQUISITION_NOT_FOUND');
        });
    });
});
