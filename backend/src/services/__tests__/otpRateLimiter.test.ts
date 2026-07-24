import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OtpResendRateLimiter } from '../otpRateLimiter';
import { redis } from '../../db/redis';

// Mock redis
vi.mock('../../db/redis', () => ({
    redis: {
        get: vi.fn(),
        incr: vi.fn(),
        expire: vi.fn(),
        ttl: vi.fn(),
        del: vi.fn(),
    },
}));

describe('OtpResendRateLimiter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkAndIncrement', () => {
        it('should allow first request and set expiry', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(redis.incr).mockResolvedValue(1);
            vi.mocked(redis.ttl).mockResolvedValue(900);

            const result = await OtpResendRateLimiter.checkAndIncrement('test@example.com');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(2);
            expect(redis.expire).toHaveBeenCalledWith('otp_resend:test@example.com', 900);
        });

        it('should allow second and third requests', async () => {
            vi.mocked(redis.get).mockResolvedValue('2');
            vi.mocked(redis.incr).mockResolvedValue(3);
            vi.mocked(redis.ttl).mockResolvedValue(600);

            const result = await OtpResendRateLimiter.checkAndIncrement('test@example.com');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(0);
        });

        it('should reject fourth request with retry-after', async () => {
            vi.mocked(redis.get).mockResolvedValue('3');
            vi.mocked(redis.ttl).mockResolvedValue(300);

            const result = await OtpResendRateLimiter.checkAndIncrement('test@example.com');

            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfterSeconds).toBe(300);
        });

        it('should normalize email to lowercase', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(redis.incr).mockResolvedValue(1);
            vi.mocked(redis.ttl).mockResolvedValue(900);

            await OtpResendRateLimiter.checkAndIncrement('Test@Example.COM');

            expect(redis.get).toHaveBeenCalledWith('otp_resend:test@example.com');
        });

        it('should throw error on Redis failure', async () => {
            vi.mocked(redis.get).mockRejectedValue(new Error('Redis connection failed'));

            await expect(
                OtpResendRateLimiter.checkAndIncrement('test@example.com')
            ).rejects.toThrow('Rate limit check failed');
        });
    });

    describe('getStatus', () => {
        it('should return status without incrementing', async () => {
            vi.mocked(redis.get).mockResolvedValue('2');
            vi.mocked(redis.ttl).mockResolvedValue(450);

            const result = await OtpResendRateLimiter.getStatus('test@example.com');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(1);
            expect(redis.incr).not.toHaveBeenCalled();
        });

        it('should indicate not allowed when at limit', async () => {
            vi.mocked(redis.get).mockResolvedValue('3');
            vi.mocked(redis.ttl).mockResolvedValue(400);

            const result = await OtpResendRateLimiter.getStatus('test@example.com');

            expect(result.allowed).toBe(false);
            expect(result.remaining).toBe(0);
            expect(result.retryAfterSeconds).toBe(400);
        });

        it('should return full attempts when no key exists', async () => {
            vi.mocked(redis.get).mockResolvedValue(null);
            vi.mocked(redis.ttl).mockResolvedValue(-2); // Key doesn't exist

            const result = await OtpResendRateLimiter.getStatus('test@example.com');

            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(3);
        });
    });

    describe('reset', () => {
        it('should delete rate limit key', async () => {
            vi.mocked(redis.del).mockResolvedValue(1);

            await OtpResendRateLimiter.reset('test@example.com');

            expect(redis.del).toHaveBeenCalledWith('otp_resend:test@example.com');
        });

        it('should normalize email before deletion', async () => {
            vi.mocked(redis.del).mockResolvedValue(1);

            await OtpResendRateLimiter.reset('Test@Example.COM');

            expect(redis.del).toHaveBeenCalledWith('otp_resend:test@example.com');
        });
    });
});
