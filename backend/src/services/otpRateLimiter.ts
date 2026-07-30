import { redis } from '../db/redis';

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
    retryAfterSeconds?: number;
}

/**
 * OTP Resend Rate Limiter Service
 * 
 * Implements Redis-backed rate limiting for OTP resend requests to prevent
 * email flooding and brute-force attacks.
 * 
 * Limits: 3 resend attempts per 15-minute sliding window, scoped by email.
 */
export class OtpResendRateLimiter {
    private static readonly KEY_PREFIX = 'otp_resend';
    private static readonly WINDOW_SECONDS = 900; // 15 minutes
    private static readonly MAX_ATTEMPTS = 3;

    /**
     * Check and increment rate limit counter for OTP resend.
     * 
     * @param email - Candidate email address (normalized to lowercase)
     * @returns Rate limit decision with remaining attempts and reset timestamp
     * 
     * @throws Error if Redis connection fails (caller should handle gracefully)
     */
    static async checkAndIncrement(email: string): Promise<RateLimitResult> {
        const key = `${this.KEY_PREFIX}:${email.toLowerCase()}`;

        try {
            // Get current count (null if key doesn't exist)
            const currentCount = await redis.get(key);
            const count = currentCount ? parseInt(String(currentCount), 10) : 0;

            // Check if already at limit
            if (count >= this.MAX_ATTEMPTS) {
                const ttl = await redis.ttl(key);
                const resetAt = new Date(Date.now() + ttl * 1000);

                return {
                    allowed: false,
                    remaining: 0,
                    resetAt,
                    retryAfterSeconds: ttl > 0 ? ttl : 0,
                };
            }

            // Increment counter
            const newCount = await redis.incr(key);

            // Set expiry on first increment
            if (newCount === 1) {
                await redis.expire(key, this.WINDOW_SECONDS);
            }

            const ttl = await redis.ttl(key);
            const resetAt = new Date(Date.now() + ttl * 1000);

            return {
                allowed: true,
                remaining: this.MAX_ATTEMPTS - newCount,
                resetAt,
            };
        } catch (error) {
            // Log error but don't expose Redis details to caller
            console.error('OTP rate limiter error:', error);
            throw new Error('Rate limit check failed');
        }
    }

    /**
     * Get current rate limit status without incrementing counter.
     * Useful for UI to display remaining attempts.
     */
    static async getStatus(email: string): Promise<RateLimitResult> {
        const key = `${this.KEY_PREFIX}:${email.toLowerCase()}`;

        try {
            const currentCount = await redis.get(key);
            const count = currentCount ? parseInt(String(currentCount), 10) : 0;
            const ttl = await redis.ttl(key);
            const resetAt = ttl > 0
                ? new Date(Date.now() + ttl * 1000)
                : new Date(Date.now() + this.WINDOW_SECONDS * 1000);

            return {
                allowed: count < this.MAX_ATTEMPTS,
                remaining: Math.max(0, this.MAX_ATTEMPTS - count),
                resetAt,
                retryAfterSeconds: count >= this.MAX_ATTEMPTS && ttl > 0 ? ttl : undefined,
            };
        } catch (error) {
            console.error('OTP rate limit status check error:', error);
            throw new Error('Rate limit status check failed');
        }
    }

    /**
     * Reset rate limit counter for a specific email.
     * Use only for testing or support override scenarios.
     */
    static async reset(email: string): Promise<void> {
        const key = `${this.KEY_PREFIX}:${email.toLowerCase()}`;
        await redis.del(key);
    }
}
