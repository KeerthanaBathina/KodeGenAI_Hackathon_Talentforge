/**
 * Integration Tests: Fallback Routing
 * 
 * Tests application routing logic during fallback mode
 * - Applications bypass AI screening when fallback active
 * - Applications enqueued normally when fallback inactive
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import { redis } from '../../db/redis';
import { screeningQueue, enqueueScreening } from '../../queues/screeningQueue';
import { FallbackModeService } from '../../services/fallbackModeService';

describe('Fallback Routing Integration Tests', () => {
    let testCandidateId: string;
    let testRequisitionId: string;

    beforeEach(async () => {
        // Clear fallback mode state
        await redis.del('system:fallback_mode');
        await redis.del('system:fallback_mode:metadata');

        // Clean queue
        await screeningQueue.obliterate({ force: true });

        // Create test data
        const candidate = await prisma.candidate.create({
            data: {
                email: 'fallback@test.com',
                firstName: 'Fallback',
                lastName: 'Test',
                passwordHash: 'test',
                status: 'active',
            },
        });

        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Position',
                description: 'Test',
                status: 'open',
                jobType: 'full_time',
                requiredSkills: ['JavaScript'],
                preferredSkills: [],
                minExperienceYears: 1,
                educationLevel: "Bachelor's",
            },
        });

        testCandidateId = candidate.id;
        testRequisitionId = requisition.id;
    });

    afterEach(async () => {
        // Cleanup
        await redis.del('system:fallback_mode');
        await redis.del('system:fallback_mode:metadata');
        await prisma.application.deleteMany({
            where: { candidateId: testCandidateId },
        });
        await prisma.candidate.deleteMany({ where: { id: testCandidateId } });
        await prisma.requisition.deleteMany({ where: { id: testRequisitionId } });
        await screeningQueue.obliterate({ force: true });
    });

    it('should route application to manual review when fallback mode is active', async () => {
        // Activate fallback mode
        await FallbackModeService.enableFallbackMode('worker_offline', {
            workerOfflineDurationMs: 360000,
        });

        // Create application
        const application = await prisma.application.create({
            data: {
                candidateId: testCandidateId,
                requisitionId: testRequisitionId,
                status: 'submitted',
            },
        });

        // Create resume
        await prisma.resume.create({
            data: {
                applicationId: application.id,
                storageKey: 'test-key',
                fileName: 'test.pdf',
                fileSize: 1000,
                mimeType: 'application/pdf',
                scanStatus: 'clean',
                parsedData: {
                    name: 'Fallback Test',
                    email: 'fallback@test.com',
                    phone: '1234567890',
                    skills: ['JavaScript'],
                    experience_years: 2,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            },
        });

        // Enqueue screening (should bypass and route to manual review)
        const jobId = await enqueueScreening({
            applicationId: application.id,
            resumeId: application.id,
            triggeredBy: 'parsing',
        });

        // Should return null (no job created)
        expect(jobId).toBeNull();

        // Check application status
        const updatedApp = await prisma.application.findUnique({
            where: { id: application.id },
        });

        expect(updatedApp!.status).toBe('pending_review');
        expect(updatedApp!.manualReviewReason).toBe('fallback_mode');

        // Verify no job was added to queue
        const queueCount = await screeningQueue.getWaitingCount();
        expect(queueCount).toBe(0);
    });

    it('should enqueue application normally when fallback mode is inactive', async () => {
        // Ensure fallback mode is inactive
        const state = await FallbackModeService.getFallbackModeState();
        expect(state.active).toBe(false);

        // Create application
        const application = await prisma.application.create({
            data: {
                candidateId: testCandidateId,
                requisitionId: testRequisitionId,
                status: 'submitted',
            },
        });

        // Create resume
        await prisma.resume.create({
            data: {
                applicationId: application.id,
                storageKey: 'test-key',
                fileName: 'test.pdf',
                fileSize: 1000,
                mimeType: 'application/pdf',
                scanStatus: 'clean',
                parsedData: {
                    name: 'Normal Test',
                    email: 'fallback@test.com',
                    phone: '1234567890',
                    skills: ['JavaScript'],
                    experience_years: 2,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            },
        });

        // Enqueue screening (should add job normally)
        const jobId = await enqueueScreening({
            applicationId: application.id,
            resumeId: application.id,
            triggeredBy: 'parsing',
        });

        // Should return job ID
        expect(jobId).toBeTruthy();
        expect(typeof jobId).toBe('string');

        // Verify job was added to queue
        const queueCount = await screeningQueue.getWaitingCount();
        expect(queueCount).toBe(1);
    });
});
