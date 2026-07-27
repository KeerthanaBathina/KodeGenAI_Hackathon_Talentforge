/**
 * Webhook Payload Schemas
 * 
 * Zod schemas for validating incoming webhook payloads from assessment providers.
 * Ensures data integrity and type safety before processing.
 */

import { z } from 'zod';

/**
 * Assessment Score Webhook Schema
 * 
 * Validates webhook payload from assessment providers containing test results.
 * Providers send this payload when a candidate completes an assessment.
 */
export const AssessmentScoreWebhookSchema = z.object({
    /**
     * Unique session token identifying the assessment session.
     * Used as idempotency key to prevent duplicate processing.
     */
    sessionToken: z.string().min(1, 'Session token is required'),

    /**
     * Assessment score from provider.
     * Range depends on provider scoring system (0-100 for most providers).
     */
    score: z.number()
        .min(0, 'Score must be non-negative')
        .max(100, 'Score must not exceed 100'),

    /**
     * ISO 8601 timestamp when the assessment was completed.
     * Provider timezone should be normalized to UTC.
     */
    completedAt: z.string().regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/,
        'completedAt must be valid ISO 8601 datetime'
    ),

    /**
     * Optional provider-specific metadata.
     * May include detailed results, breakdown by category, etc.
     */
    metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * TypeScript type inferred from schema.
 * Use this type for type-safe access to validated webhook payloads.
 */
export type AssessmentScoreWebhook = z.infer<typeof AssessmentScoreWebhookSchema>;

/**
 * Validate and parse webhook payload.
 * 
 * @param payload - Raw webhook payload from request body
 * @returns Validated webhook data
 * @throws ZodError if validation fails
 */
export function validateAssessmentScoreWebhook(payload: unknown): AssessmentScoreWebhook {
    return AssessmentScoreWebhookSchema.parse(payload);
}

/**
 * Safe webhook validation with error handling.
 * 
 * @param payload - Raw webhook payload
 * @returns Validation result with success flag and data or errors
 */
export function safeValidateAssessmentScoreWebhook(payload: unknown) {
    return AssessmentScoreWebhookSchema.safeParse(payload);
}
