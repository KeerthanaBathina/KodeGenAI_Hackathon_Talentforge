/**
 * Password Reset Rate Limiting Middleware
 * 
 * Limits password reset requests to prevent abuse:
 * - 3 requests per hour per IP address
 * 
 * @module middleware/passwordResetRateLimit
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import logger from '../utils/logger';

const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
});

// 3 requests per hour per IP
const resetRequestLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, '1 h'),
    analytics: true,
    prefix: 'password_reset_request',
});

export async function passwordResetRateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const identifier = req.ip || req.socket.remoteAddress || 'unknown';

    try {
        const { success, limit, remaining, reset } = await resetRequestLimiter.limit(identifier);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', limit.toString());
        res.setHeader('X-RateLimit-Remaining', remaining.toString());
        res.setHeader('X-RateLimit-Reset', reset.toString());

        if (!success) {
            const retryAfter = Math.ceil((reset - Date.now()) / 1000);
            res.setHeader('Retry-After', retryAfter.toString());

            res.status(429).json({
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: 'Too many password reset requests. Please try again later.',
                    retryAfter,
                    resetAt: new Date(reset).toISOString(),
                },
            });
            return;
        }

        next();
    } catch (error) {
        logger.error({ error, identifier }, 'Password reset rate limit check failed');
        // Fail open: allow request if rate limiter fails
        next();
    }
}
