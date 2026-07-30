import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app';
import prisma from '../../db/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

/**
 * Integration Tests for US-003: Duplicate Prevention & Cooling Period
 * 
 * Test Scenarios:
 * 1. Eligibility check endpoint returns correct status
 * 2. Submit endpoint returns HTTP 409 for duplicates
 * 3. Submit endpoint returns HTTP 409 for cooling period
 * 4. Submit endpoint succeeds after cooling period expires
 */

describe('US-003 Integration Tests: Duplicate Prevention', () => {
    let candidateToken: string;
    let candidateId: string;
    let requisitionId: string;

    beforeAll(async () => {
        // Create test candidate
        const candidate = await prisma.candidate.create({
            data: {
                email: 'duplicate-test@example.com',
                password: 'hashedpassword',
                role: 'candidate',
                emailVerified: true,
            },
        });

        candidateId = candidate.id;

        // Generate JWT token
        candidateToken = jwt.sign(
            { id: candidate.id, email: candidate.email, role: candidate.role },
            env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Create test requisition
        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Requisition for Duplicate Prevention',
                department: 'Engineering',
                location: 'Remote',
                jobType: 'full_time',
                status: 'open',
                slots: 5,
                filledSlots: 0,
                hiringManagerId: candidate.id, // Use candidate as placeholder
                openedAt: new Date(),
            },
        });

        requisitionId = requisition.id;
    });

    afterAll(async () => {
        // Cleanup
        await prisma.application.deleteMany({ where: { candidateId } });
        await prisma.requisition.deleteMany({ where: { id: requisitionId } });
        await prisma.candidate.deleteMany({ where: { id: candidateId } });
    });

    beforeEach(async () => {
        // Clean up applications before each test
        await prisma.application.deleteMany({ where: { candidateId, requisitionId } });
    });

    describe('GET /api/requisitions/:id/eligibility', () => {
        it('should return eligible when no applications exist', async () => {
            const response = await request(app)
                .get(`/api/requisitions/${requisitionId}/eligibility`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                canApply: true,
                reason: 'eligible',
                message: 'You are eligible to apply for this position.',
            });
        });

        it('should return NOT eligible when active draft exists', async () => {
            // Create draft application
            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'draft',
                    draftData: { currentStep: 1 },
                    submittedAt: null as any,
                },
            });

            const response = await request(app)
                .get(`/api/requisitions/${requisitionId}/eligibility`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                canApply: false,
                reason: 'active_application',
                message: 'You already have an active application for this position.',
            });
            expect(response.body.existingApplicationId).toBeDefined();
        });

        it('should return NOT eligible when submitted application exists', async () => {
            // Create submitted application
            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/requisitions/${requisitionId}/eligibility`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                canApply: false,
                reason: 'active_application',
            });
        });

        it('should return NOT eligible when in cooling period (rejected 30 days ago)', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 30);

            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'rejected',
                    submittedAt: new Date(),
                    updatedAt: rejectedDate,
                },
            });

            const response = await request(app)
                .get(`/api/requisitions/${requisitionId}/eligibility`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                canApply: false,
                reason: 'cooling_period',
            });
            expect(response.body.daysRemaining).toBeGreaterThan(50);
            expect(response.body.daysRemaining).toBeLessThanOrEqual(60);
            expect(response.body.message).toContain('day');
        });

        it('should return eligible when cooling period expired (rejected 91+ days ago)', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 91);

            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'rejected',
                    submittedAt: new Date(),
                    updatedAt: rejectedDate,
                },
            });

            const response = await request(app)
                .get(`/api/requisitions/${requisitionId}/eligibility`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                canApply: true,
                reason: 'eligible',
            });
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app)
                .get(`/api/requisitions/${requisitionId}/eligibility`);

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/applications/drafts/:requisitionId/submit', () => {
        it('should return HTTP 409 when duplicate draft exists', async () => {
            // Create two drafts (one active)
            const draft1 = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'draft',
                    draftData: { currentStep: 4 },
                    submittedAt: null as any,
                },
            });

            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .post(`/api/applications/drafts/${requisitionId}/submit`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(409);
            expect(response.body.error.code).toBe('DUPLICATE_APPLICATION');
            expect(response.body.error.message).toContain('active application');
        });

        it('should return HTTP 409 when in cooling period', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 45);

            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'rejected',
                    submittedAt: new Date(),
                    updatedAt: rejectedDate,
                },
            });

            // Create draft to submit
            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'draft',
                    draftData: { currentStep: 4 },
                    submittedAt: null as any,
                },
            });

            const response = await request(app)
                .post(`/api/applications/drafts/${requisitionId}/submit`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(409);
            expect(response.body.error.code).toBe('COOLING_PERIOD_ACTIVE');
            expect(response.body.error.message).toContain('wait');
            expect(response.body.error.message).toContain('day');
        });

        it('should succeed when cooling period expired', async () => {
            const rejectedDate = new Date();
            rejectedDate.setDate(rejectedDate.getDate() - 100);

            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'rejected',
                    submittedAt: new Date(),
                    updatedAt: rejectedDate,
                },
            });

            // Create draft to submit
            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'draft',
                    draftData: { currentStep: 4 },
                    submittedAt: null as any,
                },
            });

            const response = await request(app)
                .post(`/api/applications/drafts/${requisitionId}/submit`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('submitted');
        });

        it('should return 404 when no draft exists', async () => {
            const response = await request(app)
                .post(`/api/applications/drafts/${requisitionId}/submit`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('DRAFT_NOT_FOUND');
        });
    });
});
