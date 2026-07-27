/**
 * Retry Utility
 * 
 * Provides retry logic with fixed backoff intervals for transient failures.
 * Used for assessment provider API calls and other external service integrations.
 * 
 * @module utils/retry
 */

import logger from './logger';

export interface RetryOptions {
    maxAttempts: number;
    delayMs: number;
    retryableErrors: string[];
    operation: string;
    correlationId?: string;
}

export class RetryExhaustedError extends Error {
    constructor(
        message: string,
        public attempts: number,
        public lastError: Error
    ) {
        super(message);
        this.name = 'RetryExhaustedError';
    }
}

/**
 * Determine if an error is retryable based on error code
 */
function isRetryableError(error: Error, retryableCodes: string[]): boolean {
    // Check if error has a code property
    const errorWithCode = error as Error & { code?: string };
    
    if (errorWithCode.code && retryableCodes.includes(errorWithCode.code)) {
        return true;
    }

    return false;
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with retry logic
 * 
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of successful operation
 * @throws RetryExhaustedError if all attempts fail with retryable errors
 * @throws Original error if non-retryable error encountered
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
): Promise<T> {
    const { maxAttempts, delayMs, retryableErrors, operation, correlationId } = options;

    let lastError: Error | null = null;
    let attempt = 0;

    for (attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            logger.info('Executing operation with retry', {
                operation,
                attempt,
                maxAttempts,
                correlationId,
            });

            const result = await fn();

            if (attempt > 1) {
                logger.info('Operation succeeded after retry', {
                    operation,
                    attempt,
                    correlationId,
                });
            }

            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            const isRetryable = isRetryableError(lastError, retryableErrors);
            const isLastAttempt = attempt === maxAttempts;

            logger.warn('Operation failed', {
                operation,
                attempt,
                maxAttempts,
                errorCode: (lastError as Error & { code?: string }).code,
                errorMessage: lastError.message,
                isRetryable,
                isLastAttempt,
                correlationId,
            });

            // If error is not retryable, throw immediately
            if (!isRetryable) {
                logger.error('Non-retryable error encountered', {
                    operation,
                    attempt,
                    errorCode: (lastError as Error & { code?: string }).code,
                    correlationId,
                });
                throw lastError;
            }

            // If last attempt, throw retry exhausted error
            if (isLastAttempt) {
                throw new RetryExhaustedError(
                    `${operation} failed after ${maxAttempts} attempts`,
                    maxAttempts,
                    lastError
                );
            }

            // Wait before next retry
            logger.info('Waiting before retry', {
                operation,
                attempt,
                delayMs,
                correlationId,
            });

            await sleep(delayMs);
        }
    }

    // Should never reach here, but TypeScript requires it
    throw new RetryExhaustedError(
        `${operation} failed after ${maxAttempts} attempts`,
        maxAttempts,
        lastError!
    );
}

/**
 * Create retry options for assessment provider launches
 * 
 * Retries on:
 * - PROVIDER_TIMEOUT (504)
 * - PROVIDER_UNREACHABLE (503)
 * - PROVIDER_SERVER_ERROR (502)
 * - PROVIDER_RATE_LIMIT (429)
 * 
 * Does NOT retry on:
 * - PROVIDER_VALIDATION_ERROR (400)
 * - PROVIDER_AUTH_ERROR (401/403)
 * - MISSING_TEST_URL, MISSING_SESSION_TOKEN, INVALID_TEST_URL (response validation)
 */
export function createProviderLaunchRetryOptions(
    correlationId: string
): Omit<RetryOptions, 'operation'> {
    return {
        maxAttempts: 3,
        delayMs: 30000, // 30 seconds
        retryableErrors: [
            'PROVIDER_TIMEOUT',
            'PROVIDER_UNREACHABLE',
            'PROVIDER_SERVER_ERROR',
            'PROVIDER_RATE_LIMIT',
        ],
        correlationId,
    };
}
