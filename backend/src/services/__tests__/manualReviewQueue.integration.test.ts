/**
 * Integration Tests: Manual Review Queue
 * 
 * Tests manual review queue service operations
 * - Fetching queue with filters
 * - Queue statistics
 * - Marking applications as reviewed
 * - Pagination
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import prisma from '../../db/prisma';
import {
    getManualReviewQueue,
    getManualReviewQueueStats,
    markAsReviewed,
} from '../../services/manualReviewQueueService';

describe('Manual Review Queue Integration Tests', () => {
    let testCandidateIds: string[] = [];
    let testRequisitionId: string;
    let testApplicationIds: string[] = [];
    let testReviewerId: string;

    beforeEach(async () => {
        // Create test reviewer
        const reviewer = await prisma.user.create({
            data: {
                email: 'reviewer@test.com',
                passwordHash: 'test',
                role: 'hr_reviewer',
            },
        });
        testReviewerId = reviewer.id;

        // Create test requisition
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
        testRequisitionId = requisition.id;

        // Create 5 test applications with different reasons
        const reasons = [
            'low_confidence',
            'low_confidence',
            'fallback_mode',
            'screening_failed',
            'flagged',
        ];

        for (let i = 0; i < 5; i++) {
            const candidate = await prisma.candidate.create({
                data: {
                    email: `candidate${i}@test.com`,
                    firstName: `Candidate${i}`,
                    lastName: `Test`,
                    passwordHash: 'test',
                    status: 'active',
                },
            });
            testCandidateIds.push(candidate.id);

            const application = await prisma.application.create({
                data: {
                    candidateId: candidate.id,
                    requisitionId: testRequisitionId,
                    status: 'pending_review',
                    manualReviewReason: reasons[i],
                    submittedAt: new Date(Date.now() - i * 3600000), // Stagger by 1 hour
                },
            });
            testApplicationIds.push(application.id);

            // Create screening record (if not fallback_mode)
            if (reasons[i] !== 'fallback_mode') {
                await prisma.screening.create({
                    data: {
                        applicationId: application.id,
                        score: 50 + i * 5,
                        confidence: 0.3 + i * 0.05,
                        recommendation: 'manual_review',
                        factors: {
                            positive: ['skill1'],
                            gaps: ['skill2'],
                        },
                        thresholdVersion: 1,
                    },
                });
            }
        }
    });

    afterEach(async () => {
        // Cleanup
        await prisma.screening.deleteMany({
            where: { applicationId: { in: testApplicationIds } },
        });
        await prisma.application.deleteMany({
            where: { id: { in: testApplicationIds } },
        });
        await prisma.candidate.deleteMany({
            where: { id: { in: testCandidateIds } },
        });
        await prisma.requisition.deleteMany({ where: { id: testRequisitionId } });
        await prisma.user.deleteMany({ where: { id: testReviewerId } });
    });

    it('should fetch all applications in manual review queue', async () => {
        const result = await getManualReviewQueue();

        expect(result.items.length).toBe(5);
        expect(result.total).toBe(5);
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
    });

    it('should filter queue by reason', async () => {
        const result = await getManualReviewQueue({ reason: ['low_confidence'] });

        expect(result.items.length).toBe(2);
        expect(result.total).toBe(2);
        expect(result.items.every((item) => item.manualReviewReason === 'low_confidence')).toBe(true);
    });

    it('should return queue statistics with counts by reason', async () => {
        const stats = await getManualReviewQueueStats();

        expect(stats.totalCount).toBe(5);
        expect(stats.byReason['low_confidence']).toBe(2);
        expect(stats.byReason['fallback_mode']).toBe(1);
        expect(stats.byReason['screening_failed']).toBe(1);
        expect(stats.byReason['flagged']).toBe(1);
        expect(stats.oldestApplicationAgeHours).toBeGreaterThanOrEqual(0);
    });

    it('should paginate results correctly', async () => {
        // Get page 1 with limit 2
        const page1 = await getManualReviewQueue({}, { page: 1, limit: 2 });
        expect(page1.items.length).toBe(2);
        expect(page1.page).toBe(1);
        expect(page1.totalPages).toBe(3); // 5 items / 2 per page = 3 pages

        // Get page 2
        const page2 = await getManualReviewQueue({}, { page: 2, limit: 2 });
        expect(page2.items.length).toBe(2);
        expect(page2.page).toBe(2);

        // Get page 3 (last page, only 1 item)
        const page3 = await getManualReviewQueue({}, { page: 3, limit: 2 });
        expect(page3.items.length).toBe(1);
        expect(page3.page).toBe(3);
    });

    it('should mark application as reviewed and transition to shortlisted', async () => {
        const applicationId = testApplicationIds[0];

        await markAsReviewed(
            applicationId,
            testReviewerId,
            'shortlisted',
            'Good candidate'
        );

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
        });

        expect(application!.status).toBe('shortlisted');

        // Verify it's removed from manual review queue
        const queue = await getManualReviewQueue();
        expect(queue.items.length).toBe(4);
        expect(queue.items.every((item) => item.id !== applicationId)).toBe(true);
    });

    it('should mark application as reviewed and transition to rejected', async () => {
        const applicationId = testApplicationIds[1];

        await markAsReviewed(
            applicationId,
            testReviewerId,
            'rejected',
            'Does not meet requirements'
        );

        const application = await prisma.application.findUnique({
            where: { id: applicationId },
        });

        expect(application!.status).toBe('rejected');

        // Verify it's removed from manual review queue
        const queue = await getManualReviewQueue();
        expect(queue.items.length).toBe(4);
        expect(queue.items.every((item) => item.id !== applicationId)).toBe(true);
    });
});
