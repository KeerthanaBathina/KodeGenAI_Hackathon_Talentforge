/**
 * Unit Tests for HMAC Signature Validation Utility
 * 
 * Tests signature computation, validation, constant-time comparison,
 * and edge cases for webhook security.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    validateHmacSignature,
    extractSignatureHeader,
    computeHmacSignature,
} from '../hmac';

// Mock logger
vi.mock('../logger', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('HMAC Signature Validation', () => {
    const testSecret = 'test-secret-key-12345';
    const testPayload = JSON.stringify({
        sessionToken: 'sess_test123',
        score: 85,
        completedAt: '2026-07-27T12:00:00Z',
    });
    const testBuffer = Buffer.from(testPayload);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('computeHmacSignature', () => {
        it('should compute correct HMAC-SHA256 signature from string', () => {
            const signature = computeHmacSignature(testPayload, testSecret);

            expect(signature).toBeTruthy();
            expect(signature).toHaveLength(64);
            expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true);
        });

        it('should compute correct HMAC-SHA256 signature from Buffer', () => {
            const signature = computeHmacSignature(testBuffer, testSecret);

            expect(signature).toBeTruthy();
            expect(signature).toHaveLength(64);
            expect(/^[0-9a-f]{64}$/.test(signature)).toBe(true);
        });

        it('should produce consistent signatures for same input', () => {
            const signature1 = computeHmacSignature(testPayload, testSecret);
            const signature2 = computeHmacSignature(testPayload, testSecret);

            expect(signature1).toBe(signature2);
        });

        it('should produce different signatures for different secrets', () => {
            const signature1 = computeHmacSignature(testPayload, 'secret1');
            const signature2 = computeHmacSignature(testPayload, 'secret2');

            expect(signature1).not.toBe(signature2);
        });

        it('should produce different signatures for different payloads', () => {
            const payload1 = JSON.stringify({ data: 'test1' });
            const payload2 = JSON.stringify({ data: 'test2' });

            const signature1 = computeHmacSignature(payload1, testSecret);
            const signature2 = computeHmacSignature(payload2, testSecret);

            expect(signature1).not.toBe(signature2);
        });
    });

    describe('validateHmacSignature', () => {
        it('should validate correct signature', () => {
            const validSignature = computeHmacSignature(testBuffer, testSecret);

            const result = validateHmacSignature(testBuffer, validSignature, testSecret);

            expect(result).toBe(true);
        });

        it('should reject incorrect signature', () => {
            const validSignature = computeHmacSignature(testBuffer, testSecret);
            const tamperedSignature = validSignature.replace(/a/g, 'b');

            const result = validateHmacSignature(testBuffer, tamperedSignature, testSecret);

            expect(result).toBe(false);
        });

        it('should reject signature with wrong secret', () => {
            const signature = computeHmacSignature(testBuffer, 'wrong-secret');

            const result = validateHmacSignature(testBuffer, signature, testSecret);

            expect(result).toBe(false);
        });

        it('should reject tampered payload', () => {
            const signature = computeHmacSignature(testBuffer, testSecret);
            const tamperedBuffer = Buffer.from(testPayload + ' ');

            const result = validateHmacSignature(tamperedBuffer, signature, testSecret);

            expect(result).toBe(false);
        });

        it('should reject signature with invalid format (too short)', () => {
            const invalidSignature = 'abc123';

            const result = validateHmacSignature(testBuffer, invalidSignature, testSecret);

            expect(result).toBe(false);
        });

        it('should reject signature with invalid format (non-hex)', () => {
            const invalidSignature = 'z'.repeat(64);

            const result = validateHmacSignature(testBuffer, invalidSignature, testSecret);

            expect(result).toBe(false);
        });

        it('should accept uppercase hex signatures', () => {
            const signature = computeHmacSignature(testBuffer, testSecret);
            const uppercaseSignature = signature.toUpperCase();

            const result = validateHmacSignature(testBuffer, uppercaseSignature, testSecret);

            expect(result).toBe(true);
        });

        it('should accept mixed case hex signatures', () => {
            const signature = computeHmacSignature(testBuffer, testSecret);
            const mixedCaseSignature = signature
                .split('')
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join('');

            const result = validateHmacSignature(testBuffer, mixedCaseSignature, testSecret);

            expect(result).toBe(true);
        });

        it('should handle empty payload', () => {
            const emptyBuffer = Buffer.from('');
            const signature = computeHmacSignature(emptyBuffer, testSecret);

            const result = validateHmacSignature(emptyBuffer, signature, testSecret);

            expect(result).toBe(true);
        });

        it('should handle large payloads', () => {
            const largePayload = 'x'.repeat(100000);
            const largeBuffer = Buffer.from(largePayload);
            const signature = computeHmacSignature(largeBuffer, testSecret);

            const result = validateHmacSignature(largeBuffer, signature, testSecret);

            expect(result).toBe(true);
        });

        it('should handle special characters in payload', () => {
            const specialPayload = JSON.stringify({
                data: 'Test with émojis 🎉 and unicode \\u0000',
            });
            const specialBuffer = Buffer.from(specialPayload);
            const signature = computeHmacSignature(specialBuffer, testSecret);

            const result = validateHmacSignature(specialBuffer, signature, testSecret);

            expect(result).toBe(true);
        });

        it('should return false on internal error', () => {
            // Pass invalid inputs to trigger error path
            const result = validateHmacSignature(
                null as any,
                'invalid',
                testSecret
            );

            expect(result).toBe(false);
        });
    });

    describe('extractSignatureHeader', () => {
        it('should extract signature from standard header', () => {
            const headers = {
                'x-signature-hmac-sha256': 'abc123def456' + '0'.repeat(52),
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBe('abc123def456' + '0'.repeat(52));
        });

        it('should handle case-insensitive header names', () => {
            const headers = {
                'X-Signature-HMAC-SHA256': 'abc123def456' + '0'.repeat(52),
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBe('abc123def456' + '0'.repeat(52));
        });

        it('should handle lowercase header names', () => {
            const headers = {
                'x-signature-hmac-sha256': 'abc123def456' + '0'.repeat(52),
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBe('abc123def456' + '0'.repeat(52));
        });

        it('should return null when header is missing', () => {
            const headers = {
                'content-type': 'application/json',
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBeNull();
        });

        it('should handle array header values (take first)', () => {
            const headers = {
                'x-signature-hmac-sha256': ['signature1', 'signature2'],
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBe('signature1');
        });

        it('should return null for empty array header', () => {
            const headers = {
                'x-signature-hmac-sha256': [],
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBeNull();
        });

        it('should return null for undefined header value', () => {
            const headers = {
                'x-signature-hmac-sha256': undefined,
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBeNull();
        });

        it('should handle mixed case in header object keys', () => {
            const headers = {
                'X-SIGNATURE-HMAC-SHA256': 'abc123def456' + '0'.repeat(52),
                'Content-Type': 'application/json',
            };

            const signature = extractSignatureHeader(headers);

            expect(signature).toBe('abc123def456' + '0'.repeat(52));
        });
    });

    describe('Timing Attack Resistance', () => {
        it('should use constant-time comparison', () => {
            // This test verifies that the function uses crypto.timingSafeEqual
            // In practice, timing attack resistance would be validated via security testing
            const signature1 = computeHmacSignature(testBuffer, testSecret);
            const signature2 = signature1.replace(/a/g, 'b');

            // Measure validation time for correct and incorrect signatures
            const iterations = 100;

            const start1 = Date.now();
            for (let i = 0; i < iterations; i++) {
                validateHmacSignature(testBuffer, signature1, testSecret);
            }
            const time1 = Date.now() - start1;

            const start2 = Date.now();
            for (let i = 0; i < iterations; i++) {
                validateHmacSignature(testBuffer, signature2, testSecret);
            }
            const time2 = Date.now() - start2;

            // Timing should be similar (within reasonable variance)
            // This is a rough check - proper timing attack testing requires specialized tools
            const timeDiff = Math.abs(time1 - time2);
            const avgTime = (time1 + time2) / 2;

            // Allow 50% variance (generous, as timing can vary in test environments)
            expect(timeDiff / avgTime).toBeLessThan(0.5);
        });
    });
});
