/**
 * Assessment Score Processing Service
 * 
 * Handles atomic score updates from webhook payloads with transaction isolation.
 * Ensures data consistency and prevents race conditions during concurrent webhook deliveries.
 */

import prisma from '../db/prisma';
import logger from '../utils/logger';
import { AssessmentScoreWebhook } from '../schemas/webhookSchemas';
import { checkWebhookIdempotency } from './webhookIdempotencyService';

/**
 * Custom error for session not found.
 */
export class SessionNotFoundError extends Error {
    constructor(sessionToken: string) {
        super(`Assessment session not found: ${sessionToken}`);
        this.name = 'SessionNotFoundError';
    }
}

/**
 * Result of webhook score processing.
 */
export interface ProcessWebhookScoreResult {
    /**
     * Whether webhook was a duplicate delivery (no processing occurred).
     */
    duplicate: boolean;

    /**
     * Session ID that was updated (only present if not duplicate).
     */
    sessionId?: string;

    /**
     * Application ID associated with the session.
     */
    applicationId?: string;

    /**
     * Score value that was stored.
     */
    score?: number;

    /**
     * Timestamp when assessment was completed.
     */
    completedAt?: Date;
}

/**
 * Process assessment score from webhook with idempotency and atomicity.
 * 
 * Features:
 * - Idempotency check using session token
 * - Atomic update within database transaction
 * - Race condition prevention via transaction isolation
 * - Metadata merging (preserves existing, adds webhook metadata)
 * 
 * @param payload - Validated webhook payload
 * @returns Processing result with duplicate flag and session details
 * @throws SessionNotFoundError if session doesn't exist
 * @throws Error if transaction fails
 */
export async function processWebhookScore(
    payload: AssessmentScoreWebhook
): Promise<ProcessWebhookScoreResult> {
    const { sessionToken, score, completedAt: completedAtStr, metadata } = payload;

    logger.info(
        { sessionToken, score, completedAt: completedAtStr },
        'Processing webhook score'
    );

    try {
        // Check idempotency before starting transaction
        const { isDuplicate, session } = await checkWebhookIdempotency(sessionToken);

        if (isDuplicate) {
            logger.info(
                { sessionToken, existingScore: session?.score },
                'Skipping duplicate webhook - already processed'
            );
            return {
                duplicate: true,
                sessionId: session?.id,
                applicationId: session?.applicationId,
                score: session?.score ?? undefined,
                completedAt: session?.completedAt ?? undefined,
            };
        }

        if (!session) {
            throw new SessionNotFoundError(sessionToken);
        }

        // Perform atomic score update in transaction
        const result = await prisma.$transaction(async (tx) => {
            // Double-check status within transaction to prevent race conditions
            const currentSession = await tx.assessmentSession.findUnique({
                where: { id: session.id },
                select: { status: true, metadata: true },
            });

            if (!currentSession) {
                throw new SessionNotFoundError(sessionToken);
            }

            // If already completed by another concurrent request, treat as duplicate
            if (currentSession.status === 'completed') {
                logger.warn(
                    { sessionToken, sessionId: session.id },
                    'Race condition detected - session completed by concurrent request'
                );
                return { duplicate: true };
            }

            // Merge metadata (preserve existing, add webhook metadata)
            const existingMetadata = (currentSession.metadata as Record<string, unknown>) ?? {};
            const mergedMetadata = {
                ...existingMetadata,
                webhookMetadata: metadata,
                webhookReceivedAt: new Date().toISOString(),
            };

            // Update session with score and completion data
            const updatedSession = await tx.assessmentSession.update({
                where: { id: session.id },
                data: {
                    score,
                    completedAt: new Date(completedAtStr),
                    status: 'completed',
                    metadata: mergedMetadata,
                },
                select: {
                    id: true,
                    applicationId: true,
                    score: true,
                    completedAt: true,
                },
            });

            logger.info(
                {
                    sessionId: updatedSession.id,
                    applicationId: updatedSession.applicationId,
                    score: updatedSession.score,
                },
                'Assessment score updated successfully'
            );

            return {
                duplicate: false,
                sessionId: updatedSession.id,
                applicationId: updatedSession.applicationId,
                score: updatedSession.score,
                completedAt: updatedSession.completedAt,
            };
        });

        return result as ProcessWebhookScoreResult;
    } catch (error) {
        if (error instanceof SessionNotFoundError) {
            logger.error({ sessionToken }, 'Session not found for webhook');
            throw error;
        }

        logger.error(
            { sessionToken, score, error },
            'Error processing webhook score'
        );
        throw error;
    }
}

/**
 * Validate webhook session exists and is in valid state for scoring.
 * 
 * Checks:
 * - Session exists
 * - Session is in 'in_progress' or 'launched' status
 * - Session is not already completed
 * 
 * @param sessionToken - Session token from webhook
 * @returns true if session is valid for scoring, false otherwise
 */
export async function validateSessionForScoring(sessionToken: string): Promise<boolean> {
    try {
        const session = await prisma.assessmentSession.findUnique({
            where: { sessionToken },
            select: { status: true },
        });

        if (!session) {
            return false;
        }

        // Only allow scoring for in-progress sessions
        const validStatuses = ['in_progress', 'launched'];
        return validStatuses.includes(session.status);
    } catch (error) {
        logger.error({ sessionToken, error }, 'Error validating session for scoring');
        return false;
    }
}
