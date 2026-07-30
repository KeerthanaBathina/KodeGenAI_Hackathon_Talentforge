/**
 * Custom error classes for Resend email delivery.
 * 
 * These errors distinguish between transient failures (should retry)
 * and permanent failures (should not retry) for proper BullMQ handling.
 */

/**
 * Base error for Resend API failures.
 */
export class ResendApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly resendError?: any
  ) {
    super(message);
    this.name = 'ResendApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Permanent email error - do not retry.
 * 
 * Thrown for client errors (4xx) that indicate the request is invalid
 * and will never succeed without modification.
 * 
 * Examples: Invalid email address, authentication failure, invalid API key
 */
export class PermanentEmailError extends ResendApiError {
  constructor(message: string, statusCode?: number, resendError?: any) {
    super(message, statusCode, resendError);
    this.name = 'PermanentEmailError';
  }
}

/**
 * Transient email error - should retry.
 * 
 * Thrown for server errors (5xx) or timeouts that may succeed on retry.
 * 
 * Examples: Service unavailable, gateway timeout, internal server error
 */
export class TransientEmailError extends ResendApiError {
  constructor(message: string, statusCode?: number, resendError?: any) {
    super(message, statusCode, resendError);
    this.name = 'TransientEmailError';
  }
}

/**
 * Classify HTTP status codes into retry categories.
 * 
 * @param statusCode - HTTP status code from API response
 * @returns true if error is transient (should retry), false if permanent
 */
export function isTransientError(statusCode: number): boolean {
  // Transient errors (retry): 500, 502, 503, 504
  const transientCodes = [500, 502, 503, 504];
  return transientCodes.includes(statusCode);
}

/**
 * Determine if an error should be retried.
 * 
 * @param error - Error object to classify
 * @returns true if error is transient, false if permanent or unknown
 */
export function shouldRetryError(error: any): boolean {
  // If it's already classified
  if (error instanceof TransientEmailError) {
    return true;
  }
  if (error instanceof PermanentEmailError) {
    return false;
  }
  
  // Check status code
  if (error.statusCode && typeof error.statusCode === 'number') {
    return isTransientError(error.statusCode);
  }
  
  // Timeout errors are transient
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return true;
  }
  
  // Unknown errors: default to transient (safer to retry)
  return true;
}
