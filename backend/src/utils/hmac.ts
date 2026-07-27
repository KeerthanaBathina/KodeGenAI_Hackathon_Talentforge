/**
 * HMAC Signature Validation Utility
 * 
 * Provides cryptographic signature validation for webhook payloads using HMAC-SHA256.
 * Implements constant-time comparison to prevent timing attacks.
 * 
 * @module utils/hmac
 */

import crypto from 'crypto';
import logger from './logger';

/**
 * Validate HMAC-SHA256 signature for webhook payload
 * 
 * @param rawBody - Raw request body as Buffer (unmodified for signature computation)
 * @param signature - Signature from X-Signature-HMAC-SHA256 header (hex-encoded)
 * @param secret - Provider-specific HMAC secret from database
 * @returns True if signature is valid, false otherwise
 * 
 * @example
 * ```typescript
 * const isValid = validateHmacSignature(
 *   Buffer.from(JSON.stringify(payload)),
 *   'a1b2c3d4...',
 *   'provider-secret-key'
 * );
 * ```
 */
export function validateHmacSignature(
    rawBody: Buffer,
    signature: string,
    secret: string
): boolean {
    try {
        // Validate signature format (must be 64-character hex string)
        if (!/^[0-9a-f]{64}$/i.test(signature)) {
            logger.warn('Invalid HMAC signature format', {
                signatureLength: signature.length,
                expectedLength: 64,
            });
            return false;
        }

        // Compute HMAC-SHA256 digest of raw body
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(rawBody);
        const computedSignature = hmac.digest('hex');

        // Convert both signatures to buffers for constant-time comparison
        const signatureBuffer = Buffer.from(signature, 'hex');
        const computedBuffer = Buffer.from(computedSignature, 'hex');

        // Use constant-time comparison to prevent timing attacks
        // This is critical for security - do not use string comparison
        const isValid = crypto.timingSafeEqual(signatureBuffer, computedBuffer);

        if (!isValid) {
            logger.warn('HMAC signature mismatch', {
                signaturePreview: signature.substring(0, 8) + '...',
                computedPreview: computedSignature.substring(0, 8) + '...',
            });
        }

        return isValid;
    } catch (error) {
        logger.error('HMAC signature validation error', {
            error: error instanceof Error ? error.message : String(error),
        });
        return false;
    }
}

/**
 * Extract and normalize HMAC signature from request headers
 * 
 * @param headers - Express request headers object
 * @returns Normalized signature string or null if missing
 */
export function extractSignatureHeader(headers: Record<string, string | string[] | undefined>): string | null {
    // Header names are case-insensitive in HTTP
    const headerName = 'x-signature-hmac-sha256';
    
    // Check for header with case-insensitive matching
    const signature = Object.keys(headers).find(
        key => key.toLowerCase() === headerName
    );

    if (!signature) {
        return null;
    }

    const value = headers[signature];
    
    // Handle array values (Express can provide arrays for duplicate headers)
    if (Array.isArray(value)) {
        return value[0] || null;
    }

    return value || null;
}

/**
 * Compute HMAC-SHA256 signature for payload (utility for testing)
 * 
 * @param payload - Payload to sign (string or Buffer)
 * @param secret - HMAC secret key
 * @returns Hex-encoded signature
 * 
 * @internal For testing purposes only
 */
export function computeHmacSignature(
    payload: string | Buffer,
    secret: string
): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
}
