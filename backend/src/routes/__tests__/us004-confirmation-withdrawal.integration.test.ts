import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

/**
 * Integration Tests for US-004: Application Submission Confirmation and Pre-Review Withdrawal
 * 
 * Test Scenarios:
 * 1. GET /api/applications/:id - Fetch application with ownership verification
 * 2. GET /api/applications/by-requisition/:requisitionId - Get candidate's application
 * 3. GET /api/applications/:id/can-withdraw - Check withdrawal eligibility
 * 4. PATCH /api/applications/:id/withdraw - Withdraw application
 * 5. POST /api/applications/drafts/:requisitionId/submit - Submit with email confirmation
 */

describe('US-004 Integration Tests: Confirmation and Withdrawal', () => {
    let candidateToken: string;
    let candidateId: string;
    let otherCandidateToken: string;
    let otherCandidateId: string;
    let requisitionId: string;
    let applicationId: string;

    beforeAll(async () => {
        // Create test candidate 1
        const candidate = await prisma.candidate.create({
            data: {
                email: 'withdrawal-test@example.com',
                password: 'hashedpassword',
                role: 'candidate',
                emailVerified: true,
            },
        });

        candidateId = candidate.id;

        candidateToken = jwt.sign(
            { id: candidate.id, email: candidate.email, role: candidate.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Create test candidate 2 (for unauthorized tests)
        const otherCandidate = await prisma.candidate.create({
            data: {
                email: 'other-candidate@example.com',
                password: 'hashedpassword',
                role: 'candidate',
                emailVerified: true,
            },
        });

        otherCandidateId = otherCandidate.id;

        otherCandidateToken = jwt.sign(
            { id: otherCandidate.id, email: otherCandidate.email, role: otherCandidate.role },
            env.JWT_SECRET || 'test-secret',
            { expiresIn: '1h' }
        );

        // Create test requisition
        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Requisition for Withdrawal',
                department: 'Engineering',
                location: 'Remote',
                jobType: 'full_time',
                status: 'open',
                slots: 5,
                filledSlots: 0,
                hiringManagerId: candidate.id,
                openedAt: new Date(),
            },
        });

        requisitionId = requisition.id;

        // Create candidate profile
        await prisma.candidateProfile.create({
            data: {
                candidateId,
                fullName: 'Test Candidate',
                onboardingCompleted: true,
            },
        });

        await prisma.candidateProfile.create({
            data: {
                candidateId: otherCandidateId,
                fullName: 'Other Candidate',
                onboardingCompleted: true,
            },
        });
    });

    afterAll(async () => {
        // Cleanup
        await prisma.application.deleteMany({ where: { candidateId } });
        await prisma.application.deleteMany({ where: { candidateId: otherCandidateId } });
        await prisma.candidateProfile.deleteMany({ where: { candidateId } });
        await prisma.candidateProfile.deleteMany({ where: { candidateId: otherCandidateId } });
        await prisma.requisition.deleteMany({ where: { id: requisitionId } });
        await prisma.candidate.deleteMany({ where: { id: candidateId } });
        await prisma.candidate.deleteMany({ where: { id: otherCandidateId } });
    });

    beforeEach(async () => {
        // Clean up applications before each test
        await prisma.application.deleteMany({ where: { candidateId } });
    });

    describe('GET /api/applications/:id', () => {
        it('should return application when candidate owns it', async () => {
            // Create application
            const app = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/applications/${app.id}`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(app.id);
            expect(response.body.candidateId).toBe(candidateId);
            expect(response.body.status).toBe('submitted');
        });

        it('should return 403 when candidate does not own application', async () => {
            // Create application owned by other candidate
            const app = await prisma.application.create({
                data: {
                    candidateId: otherCandidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/applications/${app.id}`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should return 404 when application does not exist', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174999';

            const response = await request(app)
                .get(`/api/applications/${fakeId}`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('APPLICATION_NOT_FOUND');
        });
    });

    describe('GET /api/applications/by-requisition/:requisitionId', () => {
        it('should return candidate application for requisition', async () => {
            // Create application
            const app = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/applications/by-requisition/${requisitionId}`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.id).toBe(app.id);
            expect(response.body.requisitionId).toBe(requisitionId);
        });

        it('should return 404 when no application exists for requisition', async () => {
            const response = await request(app)
                .get(`/api/applications/by-requisition/${requisitionId}`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('APPLICATION_NOT_FOUND');
        });
    });

    describe('GET /api/applications/:id/can-withdraw', () => {
        it('should return true when application status is submitted', async () => {
            const app = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/applications/${app.id}/can-withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.canWithdraw).toBe(true);
        });

        it('should return false when application status is screening', async () => {
            const app = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'screening',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/applications/${app.id}/can-withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.canWithdraw).toBe(false);
            expect(response.body.reason).toContain('screening');
        });

        it('should return false when candidate does not own application', async () => {
            const app = await prisma.application.create({
                data: {
                    candidateId: otherCandidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .get(`/api/applications/${app.id}/can-withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.canWithdraw).toBe(false);
            expect(response.body.reason).toBe('Not authorized');
        });
    });

    describe('PATCH /api/applications/:id/withdraw', () => {
        it('should withdraw application when status is submitted', async () => {
            const app = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .patch(`/api/applications/${app.id}/withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('withdrawn');
            expect(response.body.message).toBe('Application withdrawn successfully');

            // Verify database was updated
            const updated = await prisma.application.findUnique({
                where: { id: app.id },
            });
            expect(updated?.status).toBe('withdrawn');
        });

        it('should return 409 when application status is not submitted', async () => {
            const app = await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'screening',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .patch(`/api/applications/${app.id}/withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(409);
            expect(response.body.error.code).toBe('WITHDRAWAL_NOT_ALLOWED');
            expect(response.body.error.message).toContain('screening');
        });

        it('should return 403 when candidate does not own application', async () => {
            const app = await prisma.application.create({
                data: {
                    candidateId: otherCandidateId,
                    requisitionId,
                    status: 'submitted',
                    submittedAt: new Date(),
                },
            });

            const response = await request(app)
                .patch(`/api/applications/${app.id}/withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should return 404 when application does not exist', async () => {
            const fakeId = '123e4567-e89b-12d3-a456-426614174999';

            const response = await request(app)
                .patch(`/api/applications/${fakeId}/withdraw`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('APPLICATION_NOT_FOUND');
        });

        it('should return 400 for invalid UUID format', async () => {
            const response = await request(app)
                .patch('/api/applications/invalid-uuid/withdraw')
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_APPLICATION_ID');
        });
    });

    describe('POST /api/applications/drafts/:requisitionId/submit - Email Confirmation', () => {
        it('should submit application and trigger email confirmation', async () => {
            // Create draft
            await prisma.application.create({
                data: {
                    candidateId,
                    requisitionId,
                    status: 'draft',
                    draftData: {
                        step1_personal: {
                            fullName: 'Test Candidate',
                            email: 'withdrawal-test@example.com',
                            phone: '+1234567890',
                        },
                        currentStep: 4,
                    },
                },
            });

            const response = await request(app)
                .post(`/api/applications/drafts/${requisitionId}/submit`)
                .set('Cookie', [`token=${candidateToken}`]);

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('submitted');
            expect(response.body.submittedAt).toBeDefined();
            expect(response.body.message).toBe('Application submitted successfully');

            // Verify application was submitted
            const submitted = await prisma.application.findFirst({
                where: { candidateId, requisitionId, status: 'submitted' },
            });
            expect(submitted).toBeTruthy();
            expect(submitted?.draftData).toBeNull();
            expect(submitted?.draftSavedAt).toBeNull();
        });
    });
});
