/**
 * Unit Tests for Retry Utility
 * 
 * Tests retry logic, backoff timing, retryable error detection,
 * and retry exhaustion behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withRetry, RetryExhaustedError, createProviderLaunchRetryOptions } from '../retry';

// Mock logger
vi.mock('../logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('withRetry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('Successful Operations', () => {
        it('should return result immediately on first success', async () => {
            const successFn = vi.fn().mockResolvedValue('success');

            const promise = withRetry(successFn, {
                maxAttempts: 3,
                delayMs: 1000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(successFn).toHaveBeenCalledTimes(1);
        });

        it('should retry and succeed on second attempt', async () => {
            const retryableError = new Error('Temporary failure');
            (retryableError as any).code = 'RETRYABLE_ERROR';

            const retryFn = vi
                .fn()
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValueOnce('success');

            const promise = withRetry(retryFn, {
                maxAttempts: 3,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            // Fast-forward through delays
            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(retryFn).toHaveBeenCalledTimes(2);
        });

        it('should retry and succeed on third attempt', async () => {
            const retryableError = new Error('Temporary failure');
            (retryableError as any).code = 'RETRYABLE_ERROR';

            const retryFn = vi
                .fn()
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValueOnce('success');

            const promise = withRetry(retryFn, {
                maxAttempts: 3,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(retryFn).toHaveBeenCalledTimes(3);
        });
    });

    describe('Non-Retryable Errors', () => {
        it('should throw immediately on non-retryable error', async () => {
            const nonRetryableError = new Error('Validation failed');
            (nonRetryableError as any).code = 'VALIDATION_ERROR';

            const failFn = vi.fn().mockRejectedValue(nonRetryableError);

            const promise = withRetry(failFn, {
                maxAttempts: 3,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();

            await expect(promise).rejects.toThrow('Validation failed');
            expect(failFn).toHaveBeenCalledTimes(1); // No retries
        });

        it('should not retry on error without code property', async () => {
            const error = new Error('Generic error');

            const failFn = vi.fn().mockRejectedValue(error);

            const promise = withRetry(failFn, {
                maxAttempts: 3,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();

            await expect(promise).rejects.toThrow('Generic error');
            expect(failFn).toHaveBeenCalledTimes(1); // No retries
        });
    });

    describe('Retry Exhaustion', () => {
        it('should throw RetryExhaustedError after max attempts', async () => {
            const retryableError = new Error('Persistent failure');
            (retryableError as any).code = 'RETRYABLE_ERROR';

            const failFn = vi.fn().mockRejectedValue(retryableError);

            const promise = withRetry(failFn, {
                maxAttempts: 3,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();

            await expect(promise).rejects.toThrow(RetryExhaustedError);

            try {
                await promise;
            } catch (error) {
                expect(error).toBeInstanceOf(RetryExhaustedError);
                expect((error as RetryExhaustedError).attempts).toBe(3);
                expect((error as RetryExhaustedError).lastError).toBe(retryableError);
                expect((error as RetryExhaustedError).message).toContain('failed after 3 attempts');
            }

            expect(failFn).toHaveBeenCalledTimes(3);
        });

        it('should respect maxAttempts configuration', async () => {
            const retryableError = new Error('Persistent failure');
            (retryableError as any).code = 'RETRYABLE_ERROR';

            const failFn = vi.fn().mockRejectedValue(retryableError);

            const promise = withRetry(failFn, {
                maxAttempts: 5,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();

            await expect(promise).rejects.toThrow(RetryExhaustedError);
            expect(failFn).toHaveBeenCalledTimes(5);
        });
    });

    describe('Delay Timing', () => {
        it('should wait specified delay between retries', async () => {
            const retryableError = new Error('Temporary failure');
            (retryableError as any).code = 'RETRYABLE_ERROR';

            const failFn = vi.fn().mockRejectedValue(retryableError);

            const promise = withRetry(failFn, {
                maxAttempts: 3,
                delayMs: 30000,
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            // First attempt happens immediately
            await vi.waitFor(() => expect(failFn).toHaveBeenCalledTimes(1));

            // Advance time but not enough for second attempt
            await vi.advanceTimersByTimeAsync(29000);
            expect(failFn).toHaveBeenCalledTimes(1);

            // Advance past delay to trigger second attempt
            await vi.advanceTimersByTimeAsync(1000);
            await vi.waitFor(() => expect(failFn).toHaveBeenCalledTimes(2));

            // Complete remaining retries
            await vi.runAllTimersAsync();
            
            // Expect RetryExhaustedError
            await expect(promise).rejects.toThrow(RetryExhaustedError);
        });

        it('should use configured delay value', async () => {
            const retryableError = new Error('Temporary failure');
            (retryableError as any).code = 'RETRYABLE_ERROR';

            const failFn = vi.fn().mockRejectedValue(retryableError);

            const promise = withRetry(failFn, {
                maxAttempts: 2,
                delayMs: 5000, // 5 seconds
                retryableErrors: ['RETRYABLE_ERROR'],
                operation: 'test operation',
            });

            await vi.advanceTimersByTimeAsync(1);
            expect(failFn).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(5000);
            expect(failFn).toHaveBeenCalledTimes(2);

            await vi.runAllTimersAsync();
        });
    });

    describe('Multiple Retryable Error Codes', () => {
        it('should retry on any configured error code', async () => {
            const error1 = new Error('Error type 1');
            (error1 as any).code = 'ERROR_TYPE_1';

            const error2 = new Error('Error type 2');
            (error2 as any).code = 'ERROR_TYPE_2';

            const retryFn = vi
                .fn()
                .mockRejectedValueOnce(error1)
                .mockRejectedValueOnce(error2)
                .mockResolvedValueOnce('success');

            const promise = withRetry(retryFn, {
                maxAttempts: 3,
                delayMs: 1000,
                retryableErrors: ['ERROR_TYPE_1', 'ERROR_TYPE_2', 'ERROR_TYPE_3'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result).toBe('success');
            expect(retryFn).toHaveBeenCalledTimes(3);
        });

        it('should not retry on error codes not in list', async () => {
            const error = new Error('Different error');
            (error as any).code = 'DIFFERENT_ERROR';

            const failFn = vi.fn().mockRejectedValue(error);

            const promise = withRetry(failFn, {
                maxAttempts: 3,
                delayMs: 1000,
                retryableErrors: ['ERROR_TYPE_1', 'ERROR_TYPE_2'],
                operation: 'test operation',
            });

            await vi.runAllTimersAsync();

            await expect(promise).rejects.toThrow('Different error');
            expect(failFn).toHaveBeenCalledTimes(1);
        });
    });
});

describe('createProviderLaunchRetryOptions', () => {
    it('should return correct retry configuration for provider launches', () => {
        const correlationId = 'test-correlation-123';
        const options = createProviderLaunchRetryOptions(correlationId);

        expect(options).toEqual({
            maxAttempts: 3,
            delayMs: 30000,
            retryableErrors: [
                'PROVIDER_TIMEOUT',
                'PROVIDER_UNREACHABLE',
                'PROVIDER_SERVER_ERROR',
                'PROVIDER_RATE_LIMIT',
            ],
            correlationId,
        });
    });

    it('should not include non-retryable error codes', () => {
        const options = createProviderLaunchRetryOptions('test-id');

        expect(options.retryableErrors).not.toContain('PROVIDER_VALIDATION_ERROR');
        expect(options.retryableErrors).not.toContain('PROVIDER_AUTH_ERROR');
        expect(options.retryableErrors).not.toContain('MISSING_TEST_URL');
        expect(options.retryableErrors).not.toContain('MISSING_SESSION_TOKEN');
    });
});
