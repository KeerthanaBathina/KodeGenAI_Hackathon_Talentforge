/**
 * Manual Review Queue Service
 * 
 * Provides query and management functions for applications in manual review queue
 * Supports filtering by reason, requisition, date range
 * Provides statistics and pagination
 */

import { prisma } from '../db/prisma';
import type { Prisma } from '@prisma/client';
import type { ReasonCodeCategory } from '@prisma/client';
import type { CommunicationStatus, TemplateType } from '@prisma/client';
import type { ApplicationPath } from '@prisma/client';
import type { InterviewStageType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import logger from '../utils/logger';
import { env } from '../config/env';
import {
    computeReviewQueueSlaState,
    type SlaSeverity,
} from './reviewQueueSla';
import { emitReviewQueueBadgeCountSnapshot } from './reviewQueueRealtimeService';
import { renderTemplate } from './templateRenderer';
import { scheduleInterview } from './interviewSchedulingService';
import { sendEmail } from './brevoEmailService';

const ALLOWED_REASON_CATEGORIES: Record<
    'shortlisted' | 'rejected',
    ReasonCodeCategory[]
> = {
    shortlisted: ['decision'],
    rejected: ['rejection', 'decision'],
};

const DECISION_EMAIL_DISPATCH_DELAY_MS = 1_000;
const DEFAULT_PATH_THRESHOLD_YEARS = 2;

interface DecisionExecutionResult {
    communicationId: string;
    applicationId: string;
    decision: 'shortlisted' | 'rejected';
    status: 'shortlisted' | 'rejected';
    path: ApplicationPath | null;
    reasonCode: string;
    reviewedAt: string;
    correlationId: string;
}

interface PathOverrideResult {
    applicationId: string;
    originalPath: ApplicationPath | null;
    newPath: ApplicationPath;
    justification: string;
    overriddenAt: string;
}

interface BulkRejectSkippedApplication {
    applicationId: string;
    reason: 'NOT_FOUND' | 'NOT_PENDING_REVIEW';
}

interface BulkRejectResult {
    processedCount: number;
    rejectedIds: string[];
    skipped: BulkRejectSkippedApplication[];
    reasonCode: string;
    correlationId: string;
    communicationsQueued: number;
}

const INTERNAL_APTITUDE_PROVIDER_NAME = 'Internal Aptitude Portal';
const INTERNAL_APTITUDE_PROVIDER_ENDPOINT = 'internal://aptitude-test';
const INTERNAL_APTITUDE_PROVIDER_AUTH_MODE = 'none';

interface DecisionTemplateSelector {
    type?: TemplateType;
    name?: string;
}

export class InvalidReasonCodeError extends Error {
    constructor(message = 'Invalid reason code for the selected decision') {
        super(message);
        this.name = 'InvalidReasonCodeError';
    }
}

export class ApplicationDecisionLockedError extends Error {
    constructor(message = 'Application is no longer pending review') {
        super(message);
        this.name = 'ApplicationDecisionLockedError';
    }
}

export class InvalidPathOverrideError extends Error {
    code:
        | 'NO_OP_OVERRIDE'
        | 'JUSTIFICATION_TOO_SHORT';

    constructor(
        code:
            | 'NO_OP_OVERRIDE'
            | 'JUSTIFICATION_TOO_SHORT',
        message: string
    ) {
        super(message);
        this.code = code;
        this.name = 'InvalidPathOverrideError';
    }
}

function normalizeStatusForLog(status: CommunicationStatus): string {
    return status;
}

function getDecisionTemplateSelector(
    decision: 'shortlisted' | 'rejected'
): DecisionTemplateSelector {
    if (decision === 'rejected') {
        return { type: 'rejection' };
    }

    return { name: 'Shortlist Notification' };
}

function parseExperienceYearsFromFactors(factors: unknown): number | null {
    if (!factors || typeof factors !== 'object') {
        return null;
    }

    const factorsRecord = factors as Record<string, unknown>;
    const parsedData = factorsRecord['parsedData'];
    if (!parsedData || typeof parsedData !== 'object') {
        return null;
    }

    const parsedDataRecord = parsedData as Record<string, unknown>;
    const rawExperience = parsedDataRecord['experience_years'];

    if (typeof rawExperience === 'number' && Number.isFinite(rawExperience)) {
        return rawExperience;
    }

    if (typeof rawExperience === 'string') {
        const parsed = Number(rawExperience);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

async function getClassificationThresholdYears(
    tx: Prisma.TransactionClient,
    jobFamilyId: string
): Promise<number> {
    const thresholdRow = await tx.scoringThreshold.findFirst({
        where: {
            jobFamilyId,
            effectiveFrom: {
                lte: new Date(),
            },
        },
        orderBy: {
            effectiveFrom: 'desc',
        },
        select: {
            experienceThresholdYears: true,
        },
    });

    if (!thresholdRow) {
        return DEFAULT_PATH_THRESHOLD_YEARS;
    }

    if (thresholdRow.experienceThresholdYears < 0) {
        logger.warn(
            {
                jobFamilyId,
                configuredThreshold: thresholdRow.experienceThresholdYears,
            },
            'manual-review: invalid classification threshold; fallback value applied'
        );
        return DEFAULT_PATH_THRESHOLD_YEARS;
    }

    return thresholdRow.experienceThresholdYears;
}

function classifyApplicationPath(
    experienceYears: number,
    thresholdYears: number
): ApplicationPath {
    return experienceYears < thresholdYears ? 'fresher' : 'experienced';
}

async function findDecisionTemplate(
    tx: Prisma.TransactionClient,
    decision: 'shortlisted' | 'rejected'
): Promise<{ id: string; type: TemplateType; name: string }> {
    const selector = getDecisionTemplateSelector(decision);

    const template = await tx.template.findFirst({
        where: {
            active: true,
            ...(selector.type ? { type: selector.type } : {}),
            ...(selector.name ? { name: selector.name } : {}),
        },
        orderBy: {
            version: 'desc',
        },
        select: {
            id: true,
            type: true,
            name: true,
        },
    });

    if (!template) {
        throw new Error(`Missing active template for ${decision} decision notifications`);
    }

    return template;
}

async function dispatchDecisionCommunication(
    result: DecisionExecutionResult
): Promise<void> {
    try {
        const communication = await prisma.communication.findUnique({
            where: { id: result.communicationId },
            include: {
                template: true,
                application: {
                    include: {
                        candidate: {
                            include: {
                                profile: true,
                            },
                        },
                        requisition: true,
                    },
                },
            },
        });

        if (!communication) {
            logger.error(
                { communicationId: result.communicationId, correlationId: result.correlationId },
                'decision-notification: communication record not found'
            );
            return;
        }

        const rendered = renderTemplate(communication.template, {
            candidate_name: communication.application.candidate.profile?.fullName || 'Candidate',
            role_title: communication.application.requisition.title,
            application_id: communication.application.id,
            platform_name: 'TalentForge',
        });

        if (env.EMAIL_PROVIDER === 'mock') {
            logger.info(
                {
                    communicationId: communication.id,
                    applicationId: communication.applicationId,
                    to: communication.application.candidate.email,
                    provider: env.EMAIL_PROVIDER,
                    correlationId: result.correlationId,
                    subject: rendered.subject,
                },
                '[MOCK EMAIL] decision notification dispatched'
            );
        }

        await prisma.communication.update({
            where: { id: communication.id },
            data: {
                status: 'sent',
                sentAt: new Date(),
            },
        });
    } catch (error) {
        logger.error(
            {
                err: error,
                communicationId: result.communicationId,
                applicationId: result.applicationId,
                correlationId: result.correlationId,
            },
            'decision-notification: failed to dispatch queued communication'
        );

        await prisma.communication.update({
            where: { id: result.communicationId },
            data: {
                status: 'failed',
                retryCount: {
                    increment: 1,
                },
            },
        }).catch(() => undefined);
    }
}

function scheduleDecisionCommunicationDispatch(result: DecisionExecutionResult): void {
    setTimeout(() => {
        void dispatchDecisionCommunication(result);
    }, DECISION_EMAIL_DISPATCH_DELAY_MS);
}

export interface ManualReviewFilters {
    reason?: string | string[];
    requisitionId?: string;
    department?: string;
    scoreBand?: 'high' | 'medium' | 'low';
    status?: 'pending_review' | 'shortlisted' | 'rejected';
    dateFrom?: Date;
    dateTo?: Date;
}

export type ManualReviewSortBy = 'candidate' | 'role' | 'score' | 'sla' | 'status';
export type ManualReviewSortDir = 'asc' | 'desc';

export interface ManualReviewSort {
    sortBy?: ManualReviewSortBy;
    sortDir?: ManualReviewSortDir;
}

export interface ManualReviewQueueItem {
    id: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    requisitionId: string;
    requisitionTitle: string;
    requisitionDepartment: string;
    status: string;
    manualReviewReason: string | null;
    resumeId?: string | null;
    resumeFileName?: string | null;
    resumeMimeType?: string | null;
    scheduledStageType?: InterviewStageType | null;
    submittedAt: Date;
    screeningScore?: number | null;
    screeningConfidence?: number | null;
    aptitudeScore?: number | null;
    path: ApplicationPath | null;
    pathOverridden: boolean;
    slaDeadlineAt: string;
    slaRemainingSeconds: number;
    slaElapsedPercent: number;
    slaSeverity: SlaSeverity;
    isUrgent: boolean;
    canShortlist: boolean;
    canReject: boolean;
    decisionLocked: boolean;
}

export interface ManualReviewQueueStats {
    totalCount: number;
    byReason: Record<string, number>;
    oldestApplicationAgeHours: number | null;
}

export interface DecisionReasonCode {
    code: string;
    displayText: string;
    category: ReasonCodeCategory;
}

export interface PathOverrideInput {
    applicationId: string;
    actorId: string;
    newPath: ApplicationPath;
    justification: string;
}

export interface BulkRejectInput {
    applicationIds: string[];
    actorId: string;
    reasonCode: string;
    comment?: string;
}

export interface ScheduleInitialInterviewInput {
    applicationId: string;
    actorId: string;
    startAt: string;
    endAt: string;
    timezone: string;
    joinUrl: string;
    stageType?: 'aptitude' | 'coding' | 'technical' | 'hr';
}

export interface ScheduleInitialInterviewResult {
    applicationId: string;
    stageType: InterviewStageType;
    interviewId: string;
    scheduledAt: string;
    endAt: string;
    timezone: string;
    joinUrl: string;
}

export interface PaginationOptions {
    page?: number;
    limit?: number;
}

export async function getDecisionReasonCodes(
    decision?: 'shortlisted' | 'rejected'
): Promise<DecisionReasonCode[]> {
    const categories = decision
        ? ALLOWED_REASON_CATEGORIES[decision]
        : Array.from(new Set(Object.values(ALLOWED_REASON_CATEGORIES).flat()));

    const reasonCodes = await prisma.reasonCode.findMany({
        where: {
            active: true,
            category: {
                in: categories,
            },
        },
        orderBy: [
            { category: 'asc' },
            { displayText: 'asc' },
        ],
        select: {
            code: true,
            displayText: true,
            category: true,
        },
    });

    return reasonCodes;
}

function buildCandidateName(fullName?: string | null): string {
    const normalized = (fullName || '').trim();
    return normalized || 'Unknown Candidate';
}

function inScoreBand(
    score: number | null,
    band?: ManualReviewFilters['scoreBand']
): boolean {
    if (!band) {
        return true;
    }

    if (score === null) {
        return false;
    }

    if (band === 'high') {
        return score > 75;
    }

    if (band === 'medium') {
        return score >= 50 && score <= 75;
    }

    return score < 50;
}

function compareString(
    left: string,
    right: string,
    dir: ManualReviewSortDir
): number {
    const value = left.localeCompare(right, undefined, { sensitivity: 'base' });
    return dir === 'asc' ? value : -value;
}

function compareNumber(
    left: number,
    right: number,
    dir: ManualReviewSortDir
): number {
    return dir === 'asc' ? left - right : right - left;
}

function applyDecisionFlags(item: ManualReviewQueueItem): ManualReviewQueueItem {
    const decisionLocked = item.status !== 'pending_review';
    return {
        ...item,
        decisionLocked,
        canShortlist: !decisionLocked,
        canReject: !decisionLocked,
    };
}

function sortQueueItems(
    items: ManualReviewQueueItem[],
    sortBy: ManualReviewSortBy,
    sortDir: ManualReviewSortDir
): ManualReviewQueueItem[] {
    return [...items].sort((left, right) => {
        if (sortBy === 'candidate') {
            const compared = compareString(left.candidateName, right.candidateName, sortDir);
            if (compared !== 0) {
                return compared;
            }
        }

        if (sortBy === 'role') {
            const compared = compareString(left.requisitionTitle, right.requisitionTitle, sortDir);
            if (compared !== 0) {
                return compared;
            }
        }

        if (sortBy === 'score') {
            const compared = compareNumber(left.screeningScore ?? -1, right.screeningScore ?? -1, sortDir);
            if (compared !== 0) {
                return compared;
            }
        }

        if (sortBy === 'status') {
            const compared = compareString(left.status, right.status, sortDir);
            if (compared !== 0) {
                return compared;
            }
        }

        const bySla = compareNumber(left.slaRemainingSeconds, right.slaRemainingSeconds, sortDir);
        if (bySla !== 0) {
            return bySla;
        }

        const bySubmittedAt = left.submittedAt.getTime() - right.submittedAt.getTime();
        if (bySubmittedAt !== 0) {
            return bySubmittedAt;
        }

        return left.id.localeCompare(right.id);
    });
}

/**
 * Fetch manual review queue with filtering and pagination
 */
export async function getManualReviewQueue(
    filters: ManualReviewFilters = {},
    pagination: PaginationOptions = {},
    sort: ManualReviewSort = {}
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
    const sortBy: ManualReviewSortBy = sort.sortBy || 'sla';
    const sortDir: ManualReviewSortDir = sort.sortDir || 'asc';

    // Build where clause
    const where: Prisma.ApplicationWhereInput = {
        status: filters.status || 'pending_review',
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

    if (filters.department) {
        where.requisition = {
            department: filters.department,
        };
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
    const applications = await prisma.application.findMany({
        where,
        include: {
            candidate: {
                select: {
                    id: true,
                    email: true,
                    profile: {
                        select: {
                            fullName: true,
                        },
                    },
                },
            },
            requisition: {
                select: {
                    id: true,
                    title: true,
                    department: true,
                    jobFamilyId: true,
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
            assessmentSessions: {
                where: {
                    provider: {
                        name: INTERNAL_APTITUDE_PROVIDER_NAME,
                    },
                    status: 'completed',
                },
                orderBy: {
                    completedAt: 'desc',
                },
                take: 1,
                select: {
                    score: true,
                },
            },
            resume: {
                select: {
                    id: true,
                    fileName: true,
                    mimeType: true,
                },
            },
            interviewStages: {
                where: {
                    state: 'scheduled',
                    scheduledAt: { not: null },
                },
                orderBy: {
                    scheduledAt: 'desc',
                },
                take: 1,
                select: {
                    type: true,
                },
            },
        },
    });

    const items = applications
        .map((app): ManualReviewQueueItem => {
            const score = app.screenings[0]?.score ?? null;
            const confidence = app.screenings[0]?.confidence
                ? Number(app.screenings[0].confidence)
                : null;
            const aptitudeScore = app.assessmentSessions[0]?.score
                ? Number(app.assessmentSessions[0].score)
                : null;
            const sla = computeReviewQueueSlaState(
                app.submittedAt,
                Date.now(),
                env.REVIEW_QUEUE_SLA_HOURS
            );

            return applyDecisionFlags({
                id: app.id,
                candidateId: app.candidate.id,
                candidateName: buildCandidateName(app.candidate.profile?.fullName),
                candidateEmail: app.candidate.email,
                requisitionId: app.requisition.id,
                requisitionTitle: app.requisition.title,
                requisitionDepartment: app.requisition.department,
                status: app.status,
                manualReviewReason: app.manualReviewReason,
                resumeId: app.resume?.id ?? null,
                resumeFileName: app.resume?.fileName ?? null,
                resumeMimeType: app.resume?.mimeType ?? null,
                scheduledStageType: app.interviewStages[0]?.type ?? null,
                path: app.path,
                pathOverridden: app.pathOverridden,
                submittedAt: app.submittedAt,
                screeningScore: score,
                screeningConfidence: confidence,
                aptitudeScore,
                ...sla,
                canShortlist: true,
                canReject: true,
                decisionLocked: false,
            });
        })
        .filter((item) => inScoreBand(item.screeningScore ?? null, filters.scoreBand));

    const sorted = sortQueueItems(items, sortBy, sortDir);
    const paged = sorted.slice(skip, skip + limit);
    const total = sorted.length;

    return {
        items: paged,
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
    reasonCode: string,
    comment?: string
): Promise<DecisionExecutionResult> {
    const normalizedReasonCode = reasonCode.trim();
    const normalizedComment = comment?.trim();

    const result = await prisma.$transaction(async (tx) => {
        const allowedCategories = ALLOWED_REASON_CATEGORIES[decision];

        const existingReasonCode = await tx.reasonCode.findFirst({
            where: {
                code: normalizedReasonCode,
                active: true,
                category: {
                    in: allowedCategories,
                },
            },
            select: {
                id: true,
                code: true,
            },
        });

        if (!existingReasonCode) {
            throw new InvalidReasonCodeError();
        }

        const application = await tx.application.findUnique({
            where: { id: applicationId },
            select: {
                id: true,
                status: true,
                requisitionId: true,
                manualReviewReason: true,
                requisition: {
                    select: {
                        jobFamilyId: true,
                    },
                },
            },
        });

        if (!application) {
            throw new Error('Application not found');
        }

        if (application.status !== 'pending_review') {
            throw new ApplicationDecisionLockedError();
        }

        const notificationTemplate = await findDecisionTemplate(tx, decision);
        const newStatus = decision === 'shortlisted' ? 'shortlisted' : 'rejected';
        const correlationId = randomUUID();

        let computedPath: ApplicationPath | null = null;
        if (decision === 'shortlisted') {
            const thresholdYears = await getClassificationThresholdYears(
                tx,
                application.requisition.jobFamilyId
            );

            const latestScreening = await tx.screening.findFirst({
                where: {
                    applicationId,
                },
                orderBy: {
                    version: 'desc',
                },
                select: {
                    factors: true,
                },
            });

            const parsedExperienceYears = parseExperienceYearsFromFactors(
                latestScreening?.factors
            );
            const normalizedExperienceYears =
                parsedExperienceYears !== null && parsedExperienceYears >= 0
                    ? parsedExperienceYears
                    : 0;

            computedPath = classifyApplicationPath(
                normalizedExperienceYears,
                thresholdYears
            );

            if (parsedExperienceYears === null) {
                logger.warn(
                    {
                        applicationId,
                        thresholdYears,
                    },
                    'manual-review: missing experience_years in screening factors; fallback value applied'
                );
            }
        }

        await tx.application.update({
            where: { id: applicationId },
            data: {
                status: newStatus,
                ...(computedPath
                    ? {
                        path: computedPath,
                        pathOverridden: false,
                        pathOverrideApproverId: null,
                        pathOverrideJustification: null,
                    }
                    : {}),
            },
        });

        await tx.review.create({
            data: {
                applicationId,
                reviewerId,
                decision,
                reasonCodeId: existingReasonCode.id,
                notes: normalizedComment || null,
            },
        });

        if (decision === 'shortlisted') {
            const existingHrStage = await tx.interviewStage.findFirst({
                where: {
                    applicationId,
                    type: 'hr',
                },
                select: {
                    id: true,
                },
            });

            if (!existingHrStage) {
                await tx.interviewStage.create({
                    data: {
                        applicationId,
                        type: 'hr',
                        timezone: 'UTC',
                        panelMembers: [],
                    },
                });
            }
        }

        const communication = await tx.communication.create({
            data: {
                applicationId,
                templateId: notificationTemplate.id,
                channel: 'email',
                providerName: env.EMAIL_PROVIDER,
                messageId: correlationId,
                status: 'queued',
            },
            select: {
                id: true,
                status: true,
            },
        });

        await tx.auditEvent.create({
            data: {
                actorId: reviewerId,
                eventType: 'application_decision',
                entityType: 'application',
                entityId: applicationId,
                payloadJson: {
                    decision,
                    reason_code: existingReasonCode.code,
                    path: computedPath,
                    correlation_id: correlationId,
                    communication_id: communication.id,
                    manual_review_reason: application.manualReviewReason,
                    comment_present: Boolean(normalizedComment),
                },
            },
        });

        logger.info(
            {
                applicationId,
                reviewerId,
                decision,
                reasonCode: existingReasonCode.code,
                communicationStatus: normalizeStatusForLog(communication.status),
                path: computedPath,
                correlationId,
            },
            'manual-review: decision persisted with side effects queued'
        );

        return {
            communicationId: communication.id,
            applicationId,
            decision,
            status: newStatus,
            path: computedPath,
            reasonCode: existingReasonCode.code,
            reviewedAt: new Date().toISOString(),
            correlationId,
        } satisfies DecisionExecutionResult;
    });

    scheduleDecisionCommunicationDispatch(result);

    return result;
}

export async function overrideApplicationPath(
    input: PathOverrideInput
): Promise<PathOverrideResult> {
    const justification = input.justification.trim();
    if (justification.length < 20) {
        throw new InvalidPathOverrideError(
            'JUSTIFICATION_TOO_SHORT',
            'Justification must be at least 20 characters long'
        );
    }

    return prisma.$transaction(async (tx) => {
        const application = await tx.application.findUnique({
            where: { id: input.applicationId },
            select: {
                id: true,
                path: true,
            },
        });

        if (!application) {
            throw new Error('Application not found');
        }

        if (application.path !== null && application.path === input.newPath) {
            throw new InvalidPathOverrideError(
                'NO_OP_OVERRIDE',
                'New path must differ from current path'
            );
        }

        await tx.application.update({
            where: { id: input.applicationId },
            data: {
                path: input.newPath,
                pathOverridden: true,
                pathOverrideApproverId: input.actorId,
                pathOverrideJustification: justification,
            },
        });

        await tx.auditEvent.create({
            data: {
                actorId: input.actorId,
                eventType: 'application_path_override',
                entityType: 'application',
                entityId: input.applicationId,
                payloadJson: {
                    original_path: application.path,
                    new_path: input.newPath,
                    justification,
                },
            },
        });

        logger.info(
            {
                applicationId: input.applicationId,
                actorId: input.actorId,
                originalPath: application.path,
                newPath: input.newPath,
            },
            'manual-review: application path overridden'
        );

        return {
            applicationId: input.applicationId,
            originalPath: application.path,
            newPath: input.newPath,
            justification,
            overriddenAt: new Date().toISOString(),
        };
    });
}

export async function bulkRejectApplications(
    input: BulkRejectInput
): Promise<BulkRejectResult> {
    const normalizedReasonCode = input.reasonCode.trim();
    const normalizedComment = input.comment?.trim();
    const uniqueApplicationIds = Array.from(new Set(input.applicationIds));

    const dispatchQueue: Array<{
        applicationId: string;
        communicationId: string;
        correlationId: string;
    }> = [];

    const result = await prisma.$transaction(async (tx) => {
        const existingReasonCode = await tx.reasonCode.findFirst({
            where: {
                code: normalizedReasonCode,
                active: true,
                category: {
                    in: ALLOWED_REASON_CATEGORIES['rejected'],
                },
            },
            select: {
                id: true,
                code: true,
            },
        });

        if (!existingReasonCode) {
            throw new InvalidReasonCodeError();
        }

        const applications = await tx.application.findMany({
            where: {
                id: {
                    in: uniqueApplicationIds,
                },
            },
            select: {
                id: true,
                status: true,
                manualReviewReason: true,
            },
        });

        const applicationsById = new Map(
            applications.map((application) => [application.id, application])
        );

        const skipped: BulkRejectSkippedApplication[] = [];
        const eligibleApplications: typeof applications = [];

        for (const applicationId of uniqueApplicationIds) {
            const application = applicationsById.get(applicationId);
            if (!application) {
                skipped.push({ applicationId, reason: 'NOT_FOUND' });
                continue;
            }

            if (application.status !== 'pending_review') {
                skipped.push({
                    applicationId: application.id,
                    reason: 'NOT_PENDING_REVIEW',
                });
                continue;
            }

            eligibleApplications.push(application);
        }

        if (eligibleApplications.length === 0) {
            return {
                processedCount: 0,
                rejectedIds: [],
                skipped,
                reasonCode: existingReasonCode.code,
                correlationId: randomUUID(),
                communicationsQueued: 0,
            } satisfies BulkRejectResult;
        }

        const notificationTemplate = await findDecisionTemplate(tx, 'rejected');
        const correlationId = randomUUID();
        const rejectedIds = eligibleApplications.map((application) => application.id);

        await tx.application.updateMany({
            where: {
                id: {
                    in: rejectedIds,
                },
            },
            data: {
                status: 'rejected',
            },
        });

        await tx.review.createMany({
            data: rejectedIds.map((applicationId) => ({
                applicationId,
                reviewerId: input.actorId,
                decision: 'rejected',
                reasonCodeId: existingReasonCode.id,
                notes: normalizedComment || null,
            })),
        });

        const communications = await Promise.all(
            rejectedIds.map((applicationId) =>
                tx.communication.create({
                    data: {
                        applicationId,
                        templateId: notificationTemplate.id,
                        channel: 'email',
                        providerName: env.EMAIL_PROVIDER,
                        messageId: `${correlationId}:${applicationId}`,
                        status: 'queued',
                    },
                    select: {
                        id: true,
                        applicationId: true,
                        status: true,
                    },
                })
            )
        );

        communications.forEach((communication) => {
            dispatchQueue.push({
                applicationId: communication.applicationId,
                communicationId: communication.id,
                correlationId,
            });
        });

        await tx.auditEvent.createMany({
            data: rejectedIds.map((applicationId) => {
                const application = applicationsById.get(applicationId);

                return {
                    actorId: input.actorId,
                    eventType: 'application_decision',
                    entityType: 'application',
                    entityId: applicationId,
                    payloadJson: {
                        decision: 'rejected',
                        reason_code: existingReasonCode.code,
                        path: null,
                        correlation_id: correlationId,
                        communication_id: communications.find(
                            (communication) => communication.applicationId === applicationId
                        )?.id,
                        manual_review_reason: application?.manualReviewReason || null,
                        comment_present: Boolean(normalizedComment),
                        bulk_action: true,
                    } as Prisma.InputJsonValue,
                };
            }),
        });

        logger.info(
            {
                actorId: input.actorId,
                reasonCode: existingReasonCode.code,
                processedCount: rejectedIds.length,
                skippedCount: skipped.length,
                correlationId,
            },
            'manual-review: bulk reject persisted with side effects queued'
        );

        return {
            processedCount: rejectedIds.length,
            rejectedIds,
            skipped,
            reasonCode: existingReasonCode.code,
            correlationId,
            communicationsQueued: communications.length,
        } satisfies BulkRejectResult;
    });

    dispatchQueue.forEach(({ applicationId, communicationId, correlationId }) => {
        scheduleDecisionCommunicationDispatch({
            communicationId,
            applicationId,
            decision: 'rejected',
            status: 'rejected',
            path: null,
            reasonCode: result.reasonCode,
            reviewedAt: new Date().toISOString(),
            correlationId,
        });
    });

    if (result.processedCount > 0) {
        void emitReviewQueueBadgeCountSnapshot().catch(() => undefined);
    }

    return result;
}

export async function scheduleInitialInterviewFromManualReview(
    input: ScheduleInitialInterviewInput
): Promise<ScheduleInitialInterviewResult> {
    const application = await prisma.application.findUnique({
        where: { id: input.applicationId },
        select: {
            id: true,
            status: true,
            path: true,
            pathOverridden: true,
            candidate: {
                select: {
                    email: true,
                    profile: {
                        select: {
                            fullName: true,
                        },
                    },
                },
            },
            requisition: {
                select: {
                    title: true,
                },
            },
        },
    });

    if (!application) {
        throw new Error('Application not found');
    }

    if (application.status !== 'pending_review') {
        throw new ApplicationDecisionLockedError();
    }

    if (!application.path) {
        throw new InvalidPathOverrideError('NO_OP_OVERRIDE', 'Application path is not set');
    }

    if (!application.pathOverridden) {
        throw new InvalidPathOverrideError(
            'NO_OP_OVERRIDE',
            'Override path before scheduling the first interview stage'
        );
    }

    const allowedStagesByPath: Record<ApplicationPath, Array<'aptitude' | 'coding' | 'technical' | 'hr'>> = {
        fresher: ['aptitude', 'coding', 'technical', 'hr'],
        experienced: ['technical', 'hr'],
    };

    const defaultStageType: 'aptitude' | 'technical' =
        application.path === 'fresher' ? 'aptitude' : 'technical';
    const stageType = input.stageType ?? defaultStageType;

    if (!allowedStagesByPath[application.path].includes(stageType)) {
        throw new Error(`Stage ${stageType} is not part of ${application.path} path`);
    }

    let joinUrl = input.joinUrl.trim();
    if (stageType === 'aptitude') {
        const provider = await prisma.assessmentProvider.findFirst({
            where: {
                name: INTERNAL_APTITUDE_PROVIDER_NAME,
            },
            select: {
                id: true,
            },
        }) ?? await prisma.assessmentProvider.create({
            data: {
                name: INTERNAL_APTITUDE_PROVIDER_NAME,
                apiEndpoint: INTERNAL_APTITUDE_PROVIDER_ENDPOINT,
                authMode: INTERNAL_APTITUDE_PROVIDER_AUTH_MODE,
                timeoutSeconds: 30,
                active: true,
            },
            select: {
                id: true,
            },
        });

        const sessionToken = randomUUID();
        joinUrl = `${env.FRONTEND_URL.replace(/\/$/, '')}/candidate/aptitude-test?token=${sessionToken}`;

        await prisma.assessmentSession.create({
            data: {
                applicationId: input.applicationId,
                providerId: provider.id,
                sessionToken,
                testUrl: joinUrl,
                status: 'in_progress',
                metadata: {
                    testType: 'aptitude_internal',
                    durationMinutes: 45,
                    totalQuestions: 30,
                    generatedBy: 'manual_review_schedule',
                },
            },
        });
    }

    if (stageType !== 'aptitude' && joinUrl.length === 0) {
        throw new Error(`Join URL is required for ${stageType} interview scheduling`);
    }

    const panelist = await prisma.user.findFirst({
        where: {
            active: true,
            role: {
                in: ['tech_interviewer', 'hr_manager', 'hr_reviewer'],
            },
        },
        select: {
            id: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    if (!panelist) {
        throw new Error('No active interview panelist available');
    }

    const scheduledInterview = await scheduleInterview({
        applicationId: input.applicationId,
        type: stageType,
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: input.timezone,
        panelMemberIds: [panelist.id],
        joinUrl,
        skipPrerequisiteCheck: true,
    });

    const candidateName = application.candidate.profile?.fullName?.trim() || 'Candidate';
    const stageLabelMap: Record<'aptitude' | 'coding' | 'technical' | 'hr', string> = {
        aptitude: 'Aptitude Test',
        coding: 'Programming Assessment',
        technical: 'Technical Interview',
        hr: 'HR Round',
    };
    const stageLabel = stageLabelMap[stageType as 'aptitude' | 'coding' | 'technical' | 'hr'] ?? stageType;
    const stageLinkLabel = stageType === 'aptitude' ? 'Aptitude Test Link' : 'Interview Link';
    const emailSubject = `${stageLabel} Scheduled - ${application.requisition.title}`;
    const emailHtml = `
      <h1>${stageLabel} Scheduled</h1>
            <p>Hi ${candidateName},</p>
      <p>Your <strong>${stageLabel}</strong> has been scheduled for the role <strong>${application.requisition.title}</strong>.</p>
            <p><strong>Start Date:</strong> ${new Date(scheduledInterview.scheduledAt).toLocaleString()}</p>
            <p><strong>End Date:</strong> ${new Date(scheduledInterview.endAt).toLocaleString()}</p>
            <p><strong>Timezone:</strong> ${scheduledInterview.timezone}</p>
      <p><strong>${stageLinkLabel}:</strong> <a href="${joinUrl}">${joinUrl}</a></p>
      <p>Please use the link above at the scheduled time.</p>
      <p>Regards,<br/>TalentForge Recruitment Team</p>
    `.trim();

    try {
        await sendEmail(application.candidate.email, emailSubject, emailHtml);
    } catch (error) {
        logger.error('Manual review candidate schedule email failed', {
            applicationId: input.applicationId,
            stageType,
            candidateEmail: application.candidate.email,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    return {
        applicationId: input.applicationId,
        stageType,
        interviewId: scheduledInterview.id,
        scheduledAt: scheduledInterview.scheduledAt,
        endAt: scheduledInterview.endAt,
        timezone: scheduledInterview.timezone,
        joinUrl,
    };
}

export const ManualReviewQueueService = {
    getManualReviewQueue,
    getManualReviewQueueStats,
    getDecisionReasonCodes,
    markAsReviewed,
    overrideApplicationPath,
    bulkRejectApplications,
    scheduleInitialInterviewFromManualReview,
};
