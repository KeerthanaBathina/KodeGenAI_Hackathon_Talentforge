/**
 * Manual Review Queue Service
 * 
 * Provides query and management functions for applications in manual review queue
 * Supports filtering by reason, requisition, date range
 * Provides statistics and pagination
 */

import { prisma } from '../db/prisma';
import { auditService } from './auditService';
import type { Prisma } from '@prisma/client';

export interface ManualReviewFilters {
    reason?: string | string[];
    requisitionId?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

export interface ManualReviewQueueItem {
    id: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    requisitionId: string;
    requisitionTitle: string;
    manualReviewReason: string | null;
    submittedAt: Date;
    screeningScore?: number | null;
    screeningConfidence?: number | null;
}

export interface ManualReviewQueueStats {
    totalCount: number;
    byReason: Record<string, number>;
    oldestApplicationAgeHours: number | null;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

/**
 * Fetch manual review queue with filtering and pagination
 */
export async function getManualReviewQueue(
    filters: ManualReviewFilters = {},
    pagination: PaginationOptions = {}
): Promise<{
    items: ManualReviewQueueItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.ApplicationWhereInput = {
        status: 'pending_review',
        manualReviewReason: { not: null },
    };

    if (filters.reason) {
        if (Array.isArray(filters.reason)) {
            where.manualReviewReason = { in: filters.reason };
        } else {
            where.manualReviewReason = filters.reason;
        }
    }

    if (filters.requisitionId) {
        where.requisitionId = filters.requisitionId;
    }

    if (filters.dateFrom || filters.dateTo) {
        where.submittedAt = {};
        if (filters.dateFrom) {
            where.submittedAt.gte = filters.dateFrom;
        }
        if (filters.dateTo) {
            where.submittedAt.lte = filters.dateTo;
        }
    }

    // Fetch data
    const [applications, total] = await Promise.all([
        prisma.application.findMany({
            where,
            include: {
                candidate: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    },
                },
                requisition: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                screenings: {
                    orderBy: { version: 'desc' },
                    take: 1,
                    select: {
                        score: true,
                        confidence: true,
                    },
                },
            },
            orderBy: { submittedAt: 'asc' }, // FIFO - oldest first
            skip,
            take: limit,
        }),
        prisma.application.count({ where }),
    ]);

    const items: ManualReviewQueueItem[] = applications.map((app) => ({
        id: app.id,
        candidateId: app.candidate.id,
        candidateName: `${app.candidate.firstName} ${app.candidate.lastName}`,
        candidateEmail: app.candidate.email,
        requisitionId: app.requisition.id,
        requisitionTitle: app.requisition.title,
        manualReviewReason: app.manualReviewReason,
        submittedAt: app.submittedAt,
        screeningScore: app.screenings[0]?.score || null,
        screeningConfidence: app.screenings[0]?.confidence
            ? Number(app.screenings[0].confidence)
            : null,
    }));

    return {
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * Get statistics for manual review queue
 */
export async function getManualReviewQueueStats(): Promise<ManualReviewQueueStats> {
    const applications = await prisma.application.findMany({
        where: {
            status: 'pending_review',
            manualReviewReason: { not: null },
        },
        select: {
            manualReviewReason: true,
            submittedAt: true,
        },
    });

    const totalCount = applications.length;

    // Count by reason
    const byReason: Record<string, number> = {};
    for (const app of applications) {
        const reason = app.manualReviewReason || 'unknown';
        byReason[reason] = (byReason[reason] || 0) + 1;
    }

    // Calculate oldest application age
    let oldestApplicationAgeHours: number | null = null;
    if (applications.length > 0) {
        const oldestSubmittedAt = Math.min(
            ...applications.map((app) => app.submittedAt.getTime())
        );
        const ageMs = Date.now() - oldestSubmittedAt;
        oldestApplicationAgeHours = Math.floor(ageMs / (1000 * 60 * 60));
    }

    return {
        totalCount,
        byReason,
        oldestApplicationAgeHours,
    };
}

/**
 * Mark application as reviewed and transition status
 */
export async function markAsReviewed(
    applicationId: string,
    reviewerId: string,
    decision: 'shortlisted' | 'rejected',
    notes?: string
): Promise<void> {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: { manualReviewReason: true },
    });

    if (!application) {
        throw new Error('Application not found');
    }

    const newStatus = decision === 'shortlisted' ? 'shortlisted' : 'rejected';

    await prisma.application.update({
        where: { id: applicationId },
        data: {
            status: newStatus,
        },
    });

    // Audit log
    await auditService.log({
        action: 'application.manual_review_completed',
        actorId: reviewerId,
        resourceType: 'application',
        resourceId: applicationId,
        metadata: {
            decision,
            manualReviewReason: application.manualReviewReason,
            notes,
        },
    });
}

export const ManualReviewQueueService = {
    getManualReviewQueue,
    getManualReviewQueueStats,
    markAsReviewed,
};
