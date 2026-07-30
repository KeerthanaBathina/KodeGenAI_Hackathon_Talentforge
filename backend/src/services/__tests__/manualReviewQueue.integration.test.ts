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
    getDecisionReasonCodes,
    getManualReviewQueueStats,
    markAsReviewed,
    bulkRejectApplications,
} from '../../services/manualReviewQueueService';

describe('Manual Review Queue Integration Tests', () => {
    let testCandidateIds: string[] = [];
    let testRequisitionId: string;
    let testApplicationIds: string[] = [];
    let testReviewerId: string;
    let decisionReasonCode = 'position_filled';
    let rejectionReasonCode = 'insufficient_experience';

    beforeEach(async () => {
        // Create test reviewer
        const reviewer = await prisma.user.create({
            data: {
                email: `reviewer-${Date.now()}@test.com`,
                role: 'hr_reviewer',
                fullName: 'Review Queue Test Reviewer',
            },
        });
        testReviewerId = reviewer.id;

        const reasonCodes = await getDecisionReasonCodes('shortlisted');
        if (reasonCodes.length > 0) {
            decisionReasonCode = reasonCodes[0]!.code;
        }

        const rejectionReasonCodes = await getDecisionReasonCodes('rejected');
        if (rejectionReasonCodes.length > 0) {
            const preferred = rejectionReasonCodes.find((item) => item.category === 'rejection');
            rejectionReasonCode = (preferred || rejectionReasonCodes[0])!.code;
        }

        // Create test requisition
        const requisition = await prisma.requisition.create({
            data: {
                title: 'Test Position',
                department: 'Engineering',
                location: 'Remote',
                slots: 2,
                status: 'open',
                jobType: 'full_time',
                jobFamilyId: '00000003-0000-0000-0000-000000000001',
                eligibilityCriteria: {},
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
                    email: `candidate-${Date.now()}-${i}@test.com`,
                    consentVersion: '1.0',
                    consentTimestamp: new Date(),
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
                        factors: {
                            positive: ['skill1'],
                            gaps: ['skill2'],
                        },
                        recommendation: 'manual_review',
                        thresholdVersion: 1,
                        evaluatedAt: new Date(),
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
        await prisma.communication.deleteMany({
            where: { applicationId: { in: testApplicationIds } },
        });
        await prisma.review.deleteMany({
            where: { applicationId: { in: testApplicationIds } },
        });
        await prisma.interviewStage.deleteMany({
            where: { applicationId: { in: testApplicationIds } },
        });
        await prisma.auditEvent.deleteMany({
            where: {
                entityType: 'application',
                entityId: { in: testApplicationIds },
                eventType: 'application_decision',
            },
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
            decisionReasonCode,
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

        const interviewHandoff = await prisma.interviewStage.findFirst({
            where: {
                applicationId,
                type: 'hr',
            },
        });
        expect(interviewHandoff).toBeTruthy();

        const queuedCommunication = await prisma.communication.findFirst({
            where: { applicationId },
            orderBy: { createdAt: 'desc' },
        });
        expect(queuedCommunication).toBeTruthy();
        expect(['queued', 'sent', 'failed']).toContain(queuedCommunication!.status);
        expect(queuedCommunication!.messageId).toBeTruthy();

        const auditEvent = await prisma.auditEvent.findFirst({
            where: {
                entityType: 'application',
                entityId: applicationId,
                eventType: 'application_decision',
            },
            orderBy: { createdAt: 'desc' },
        });
        expect(auditEvent).toBeTruthy();
        const payload = auditEvent!.payloadJson as Record<string, unknown>;
        expect(payload['decision']).toBe('shortlisted');
        expect(payload['reason_code']).toBe(decisionReasonCode);
        expect(payload['correlation_id']).toBeTruthy();
        expect(payload['communication_id']).toBe(queuedCommunication!.id);
    });

    it('should mark application as reviewed and transition to rejected', async () => {
        const applicationId = testApplicationIds[1];

        await markAsReviewed(
            applicationId,
            testReviewerId,
            'rejected',
            rejectionReasonCode,
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

        const queuedCommunication = await prisma.communication.findFirst({
            where: { applicationId },
            orderBy: { createdAt: 'desc' },
        });
        expect(queuedCommunication).toBeTruthy();
        expect(['queued', 'sent', 'failed']).toContain(queuedCommunication!.status);
        expect(queuedCommunication!.messageId).toBeTruthy();

        const auditEvent = await prisma.auditEvent.findFirst({
            where: {
                entityType: 'application',
                entityId: applicationId,
                eventType: 'application_decision',
            },
            orderBy: { createdAt: 'desc' },
        });
        expect(auditEvent).toBeTruthy();
        const payload = auditEvent!.payloadJson as Record<string, unknown>;
        expect(payload['decision']).toBe('rejected');
        expect(payload['reason_code']).toBe(rejectionReasonCode);
        expect(payload['correlation_id']).toBeTruthy();
        expect(payload['communication_id']).toBe(queuedCommunication!.id);
    });

    it('should bulk reject pending-review applications and persist side effects', async () => {
        const targetIds = testApplicationIds.slice(0, 2);

        const result = await bulkRejectApplications({
            applicationIds: targetIds,
            actorId: testReviewerId,
            reasonCode: rejectionReasonCode,
            comment: 'Bulk rejection for criteria mismatch',
        });

        expect(result.processedCount).toBe(2);
        expect(result.rejectedIds.sort()).toEqual([...targetIds].sort());
        expect(result.skipped).toHaveLength(0);
        expect(result.reasonCode).toBe(rejectionReasonCode);
        expect(result.communicationsQueued).toBe(2);

        const updatedApplications = await prisma.application.findMany({
            where: {
                id: { in: targetIds },
            },
            select: {
                id: true,
                status: true,
            },
        });

        expect(updatedApplications).toHaveLength(2);
        expect(updatedApplications.every((application) => application.status === 'rejected')).toBe(true);

        const reviews = await prisma.review.findMany({
            where: {
                applicationId: { in: targetIds },
                reviewerId: testReviewerId,
                decision: 'rejected',
            },
            select: {
                applicationId: true,
                notes: true,
            },
        });
        expect(reviews).toHaveLength(2);
        expect(reviews.every((review) => review.notes === 'Bulk rejection for criteria mismatch')).toBe(true);

        const communications = await prisma.communication.findMany({
            where: {
                applicationId: { in: targetIds },
            },
            select: {
                id: true,
                applicationId: true,
                status: true,
            },
        });
        expect(communications).toHaveLength(2);
        expect(communications.every((communication) => ['queued', 'sent', 'failed'].includes(communication.status))).toBe(true);

        const auditEvents = await prisma.auditEvent.findMany({
            where: {
                entityType: 'application',
                entityId: { in: targetIds },
                eventType: 'application_decision',
            },
            select: {
                entityId: true,
                payloadJson: true,
            },
        });
        expect(auditEvents).toHaveLength(2);
        for (const event of auditEvents) {
            const payload = event.payloadJson as Record<string, unknown>;
            expect(payload['decision']).toBe('rejected');
            expect(payload['reason_code']).toBe(rejectionReasonCode);
            expect(payload['bulk_action']).toBe(true);
            expect(payload['correlation_id']).toBe(result.correlationId);
        }
    });

    it('should skip invalid applications during bulk reject with deterministic reasons', async () => {
        const firstPendingId = testApplicationIds[0]!;
        const secondPendingId = testApplicationIds[1]!;
        const thirdPendingId = testApplicationIds[2]!;

        await markAsReviewed(
            secondPendingId,
            testReviewerId,
            'rejected',
            rejectionReasonCode,
            'Already processed in a prior action'
        );

        const missingId = '00000000-0000-4000-8000-000000000999';

        const result = await bulkRejectApplications({
            applicationIds: [firstPendingId, secondPendingId, thirdPendingId, missingId],
            actorId: testReviewerId,
            reasonCode: rejectionReasonCode,
            comment: 'Batch reject with mixed states',
        });

        expect(result.processedCount).toBe(2);
        expect(result.rejectedIds.sort()).toEqual([firstPendingId, thirdPendingId].sort());
        expect(result.skipped).toEqual(
            expect.arrayContaining([
                {
                    applicationId: secondPendingId,
                    reason: 'NOT_PENDING_REVIEW',
                },
                {
                    applicationId: missingId,
                    reason: 'NOT_FOUND',
                },
            ])
        );
    });
});
