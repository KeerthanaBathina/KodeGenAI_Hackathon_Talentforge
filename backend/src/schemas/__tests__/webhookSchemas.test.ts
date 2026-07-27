/**
 * Unit Tests for Webhook Payload Schemas
 * 
 * Tests Zod validation for webhook payloads.
 */

import { describe, it, expect } from 'vitest';
import {
    AssessmentScoreWebhookSchema,
    validateAssessmentScoreWebhook,
    safeValidateAssessmentScoreWebhook,
} from '../../schemas/webhookSchemas';
import { ZodError } from 'zod';

describe('Webhook Payload Schemas', () => {
    describe('AssessmentScoreWebhookSchema', () => {
        it('should validate valid payload', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
                metadata: {
                    testType: 'coding',
                    duration: 3600,
                },
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result.sessionToken).toBe(validPayload.sessionToken);
            expect(result.score).toBe(validPayload.score);
            expect(result.completedAt).toBe(validPayload.completedAt);
            expect(result.metadata).toEqual(validPayload.metadata);
        });

        it('should validate payload without optional metadata', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result).toEqual(validPayload);
        });

        it('should reject payload with missing sessionToken', () => {
            const invalidPayload = {
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should reject payload with empty sessionToken', () => {
            const invalidPayload = {
                sessionToken: '',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should reject payload with missing score', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should reject payload with negative score', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: -10,
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should reject payload with score exceeding 100', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: 150,
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should accept score of 0', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 0,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result.score).toBe(0);
        });

        it('should accept score of 100', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 100,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result.score).toBe(100);
        });

        it('should reject payload with missing completedAt', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should reject payload with invalid ISO 8601 datetime', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27 12:00:00', // Invalid format
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should reject payload with non-ISO datetime', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: 'July 27, 2026',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });

        it('should accept valid ISO 8601 datetime with milliseconds', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00.123Z',
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result.completedAt).toBe('2026-07-27T12:00:00.123Z');
        });

        it('should accept valid ISO 8601 datetime with timezone offset', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00+05:30',
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result.completedAt).toBe('2026-07-27T12:00:00+05:30');
        });

        it('should accept metadata with nested objects', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
                metadata: {
                    testType: 'coding',
                    results: {
                        passed: 8,
                        failed: 2,
                        categories: ['algorithms', 'data-structures'],
                    },
                },
            };

            const result = AssessmentScoreWebhookSchema.parse(validPayload);

            expect(result.metadata).toEqual(validPayload.metadata);
        });

        it('should reject payload with invalid score type', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: '85', // String instead of number
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => AssessmentScoreWebhookSchema.parse(invalidPayload)).toThrow(ZodError);
        });
    });

    describe('validateAssessmentScoreWebhook', () => {
        it('should return validated payload for valid input', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = validateAssessmentScoreWebhook(validPayload);

            expect(result).toEqual(validPayload);
        });

        it('should throw ZodError for invalid input', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: -10,
                completedAt: '2026-07-27T12:00:00Z',
            };

            expect(() => validateAssessmentScoreWebhook(invalidPayload)).toThrow(ZodError);
        });
    });

    describe('safeValidateAssessmentScoreWebhook', () => {
        it('should return success result for valid payload', () => {
            const validPayload = {
                sessionToken: 'sess_test_12345',
                score: 85,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = safeValidateAssessmentScoreWebhook(validPayload);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual(validPayload);
            }
        });

        it('should return error result for invalid payload', () => {
            const invalidPayload = {
                sessionToken: 'sess_test_12345',
                score: -10,
                completedAt: '2026-07-27T12:00:00Z',
            };

            const result = safeValidateAssessmentScoreWebhook(invalidPayload);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeDefined();
            }
        });

        it('should include validation errors in error result', () => {
            const invalidPayload = {
                sessionToken: '',
                score: 150,
                completedAt: 'invalid-date',
            };

            const result = safeValidateAssessmentScoreWebhook(invalidPayload);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.length).toBeGreaterThan(0);
            }
        });
    });
});
