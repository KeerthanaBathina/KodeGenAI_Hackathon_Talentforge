/**
 * Webhook Idempotency Service
 * 
 * Provides duplicate detection for webhook processing using session tokens.
 * Ensures at-least-once delivery guarantees from providers don't cause duplicate processing.
 */

import prisma from '../db/prisma';
import logger from '../utils/logger';

/**
 * Check if webhook has already been processed.
 * 
 * Uses session token as idempotency key. A webhook is considered duplicate if:
 * - Session with matching token exists
 * - Session status is 'completed' (already processed)
 * 
 * @param sessionToken - Unique session token from webhook payload
 * @returns true if webhook is duplicate, false if first-time processing
 * @throws Error if database query fails
 */
export async function checkDuplicateWebhook(sessionToken: string): Promise<boolean> {
    try {
        logger.info({ sessionToken }, 'Checking webhook idempotency');

        const existingSession = await prisma.assessmentSession.findUnique({
            where: {
                sessionToken,
            },
            select: {
                id: true,
                status: true,
                score: true,
                completedAt: true,
            },
        });

        // No session found - this is first webhook delivery
        if (!existingSession) {
            logger.info({ sessionToken }, 'No existing session found - first-time webhook');
            return false;
        }

        // Session exists but not yet completed - not a duplicate
        if (existingSession.status !== 'completed') {
            logger.info(
                { sessionToken, status: existingSession.status },
                'Session exists but not completed - not a duplicate'
            );
            return false;
        }

        // Session exists with completed status - duplicate webhook
        logger.warn(
            {
                sessionToken,
                existingScore: existingSession.score,
                completedAt: existingSession.completedAt,
            },
            'Duplicate webhook detected - session already completed'
        );

        return true;
    } catch (error) {
        logger.error(
            { sessionToken, error },
            'Error checking webhook idempotency'
        );
        throw error;
    }
}

/**
 * Get assessment session details for webhook processing.
 * 
 * Retrieves session with application details for stage progression logic.
 * 
 * @param sessionToken - Session token from webhook
 * @returns Session details or null if not found
 */
export async function getWebhookSession(sessionToken: string) {
    try {
        const session = await prisma.assessmentSession.findUnique({
            where: {
                sessionToken,
            },
            include: {
                application: {
                    include: {
                        candidate: {
                            select: {
                                id: true,
                                email: true,
                                firstName: true,
                                lastName: true,
                            },
                        },
                        requisition: {
                            select: {
                                id: true,
                                title: true,
                                department: true,
                            },
                        },
                    },
                },
                provider: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        if (!session) {
            logger.warn({ sessionToken }, 'Session not found for webhook');
            return null;
        }

        return session;
    } catch (error) {
        logger.error({ sessionToken, error }, 'Error retrieving webhook session');
        throw error;
    }
}

/**
 * Idempotency check result with session context.
 */
export interface IdempotencyCheckResult {
    isDuplicate: boolean;
    session: Awaited<ReturnType<typeof getWebhookSession>>;
}

/**
 * Comprehensive idempotency check with session retrieval.
 * 
 * Combines duplicate detection and session lookup in single operation.
 * Optimized for webhook processing workflow.
 * 
 * @param sessionToken - Session token from webhook payload
 * @returns Idempotency result with duplicate flag and session details
 */
export async function checkWebhookIdempotency(
    sessionToken: string
): Promise<IdempotencyCheckResult> {
    const session = await getWebhookSession(sessionToken);

    if (!session) {
        return {
            isDuplicate: false,
            session: null,
        };
    }

    const isDuplicate = session.status === 'completed';

    if (isDuplicate) {
        logger.warn(
            {
                sessionToken,
                score: session.score,
                completedAt: session.completedAt,
            },
            'Duplicate webhook - already completed'
        );
    }

    return {
        isDuplicate,
        session,
    };
}
