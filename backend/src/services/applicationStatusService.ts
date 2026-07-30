import prisma from '../db/prisma';
import logger from '../utils/logger';
import type { Application } from '@prisma/client';

/**
 * Application Status Service
 * 
 * Checks application eligibility, enforcing duplicate prevention
 * and 90-day cooling period for rejected applications.
 */

const COOLING_PERIOD_DAYS = 90;

export interface ApplicationEligibility {
    canApply: boolean;
    reason: 'active_application' | 'cooling_period' | 'eligible';
    existingApplicationId?: string;
    daysRemaining?: number;
    rejectedAt?: Date;
}

export interface GetEligibilityParams {
    candidateId: string;
    requisitionId: string;
}

/**
 * Check if candidate can apply to requisition
 * Enforces duplicate prevention and cooling period rules
 */
export async function checkApplicationEligibility(
    params: GetEligibilityParams
): Promise<ApplicationEligibility> {
    const { candidateId, requisitionId } = params;

    try {
        logger.debug('Checking application eligibility', { candidateId, requisitionId });

        // Check for active application (non-terminal statuses)
        const activeApplication = await getActiveApplication({ candidateId, requisitionId });

        if (activeApplication) {
            logger.info('Active application found', {
                candidateId,
                requisitionId,
                applicationId: activeApplication.id,
                status: activeApplication.status,
            });

            return {
                canApply: false,
                reason: 'active_application',
                existingApplicationId: activeApplication.id,
            };
        }

        // Check for cooling period (rejected within last 90 days)
        const coolingPeriod = await getCoolingPeriodStatus({ candidateId, requisitionId });

        if (coolingPeriod.inCoolingPeriod) {
            logger.info('Cooling period active', {
                candidateId,
                requisitionId,
                daysRemaining: coolingPeriod.daysRemaining,
                rejectedAt: coolingPeriod.rejectedAt,
            });

            return {
                canApply: false,
                reason: 'cooling_period',
                daysRemaining: coolingPeriod.daysRemaining,
                rejectedAt: coolingPeriod.rejectedAt!,
            };
        }

        // Eligible to apply
        logger.debug('Candidate eligible to apply', { candidateId, requisitionId });

        return {
            canApply: true,
            reason: 'eligible',
        };
    } catch (error) {
        logger.error('Error checking application eligibility', {
            candidateId,
            requisitionId,
            error: error instanceof Error ? error.message : String(error),
        });

        // Default to eligible on error (fail open for better UX)
        return {
            canApply: true,
            reason: 'eligible',
        };
    }
}

/**
 * Get active (non-terminal) application for candidate + requisition
 */
export async function getActiveApplication(
    params: GetEligibilityParams
): Promise<Application | null> {
    const { candidateId, requisitionId } = params;

    const activeStatuses = [
        'draft',
        'submitted',
        'screening',
        'pending_review',
        'shortlisted',
        'interviewing',
        'offer_pending',
        'offered',
    ];

    const application = await prisma.application.findFirst({
        where: {
            candidateId,
            requisitionId,
            status: { in: activeStatuses },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });

    return application;
}

/**
 * Check cooling period status for rejected applications
 */
export async function getCoolingPeriodStatus(params: GetEligibilityParams): Promise<{
    inCoolingPeriod: boolean;
    daysRemaining: number;
    rejectedAt: Date | null;
}> {
    const { candidateId, requisitionId } = params;

    // Find most recent rejected application
    const rejectedApplication = await prisma.application.findFirst({
        where: {
            candidateId,
            requisitionId,
            status: 'rejected',
        },
        orderBy: {
            updatedAt: 'desc', // Most recent rejection
        },
    });

    if (!rejectedApplication) {
        return {
            inCoolingPeriod: false,
            daysRemaining: 0,
            rejectedAt: null,
        };
    }

    const rejectedAt = rejectedApplication.updatedAt;
    const now = new Date();
    const daysSinceRejection = Math.floor(
        (now.getTime() - rejectedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceRejection < COOLING_PERIOD_DAYS) {
        return {
            inCoolingPeriod: true,
            daysRemaining: COOLING_PERIOD_DAYS - daysSinceRejection,
            rejectedAt,
        };
    }

    return {
        inCoolingPeriod: false,
        daysRemaining: 0,
        rejectedAt,
    };
}
