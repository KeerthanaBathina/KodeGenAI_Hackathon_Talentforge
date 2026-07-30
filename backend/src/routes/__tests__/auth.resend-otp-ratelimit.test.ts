import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import { OtpResendRateLimiter } from '../../services/otpRateLimiter';

describe('POST /api/auth/resend-otp - Rate Limiting Integration Tests', () => {
    const testEmails = new Set<string>();

    // Generate unique test email for each test
    function getTestEmail(): string {
        const email = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`;
        testEmails.add(email);
        return email;
    }

    // Clean up all test emails after each test
    afterEach(async () => {
        for (const email of testEmails) {
            await OtpResendRateLimiter.reset(email);
        }
        testEmails.clear();
    });

    describe('Request Sequence Tests', () => {
        it('should allow first 3 requests and block the 4th', async () => {
            const email = getTestEmail();

            // First request - should succeed
            const res1 = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(202);
            expect(res1.body.data.remaining).toBe(2);

            // Second request - should succeed
            const res2 = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(202);
            expect(res2.body.data.remaining).toBe(1);

            // Third request - should succeed
            const res3 = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(202);
            expect(res3.body.data.remaining).toBe(0);

            // Fourth request - should be rate limited
            const res4 = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(429);

            expect(res4.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
            expect(res4.headers['retry-after']).toBeDefined();
            expect(parseInt(res4.headers['retry-after'], 10)).toBeGreaterThan(0);
        });

        it('should include resetAt timestamp in all responses', async () => {
            const email = getTestEmail();

            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(202);

            expect(response.body.data.resetAt).toBeDefined();
            const resetDate = new Date(response.body.data.resetAt);
            expect(resetDate.getTime()).toBeGreaterThan(Date.now());
        });

        it('should return human-readable wait time in 429 message', async () => {
            const email = getTestEmail();

            // Exhaust limit
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email });

            // Get rate limit error
            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(429);

            expect(response.body.error.message).toMatch(/wait \d+ minute/i);
            expect(response.body.error.retryAfter).toBeGreaterThan(0);
        });
    });

    describe('Email Scoping Tests', () => {
        it('should maintain separate counters for different emails', async () => {
            const email1 = getTestEmail();
            const email2 = getTestEmail();

            // Exhaust limit for email1
            await request(app).post('/api/auth/resend-otp').send({ email: email1 });
            await request(app).post('/api/auth/resend-otp').send({ email: email1 });
            await request(app).post('/api/auth/resend-otp').send({ email: email1 });

            // email1 should now be rate limited
            await request(app).post('/api/auth/resend-otp').send({ email: email1 }).expect(429);

            // email2 should still work
            const res = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email: email2 })
                .expect(202);

            expect(res.body.data.remaining).toBe(2);
        });

        it('should normalize email case for counter key', async () => {
            const baseEmail = getTestEmail();
            const upperEmail = baseEmail.toUpperCase();
            const mixedEmail = baseEmail.split('').map((c, i) => i % 2 ? c.toUpperCase() : c).join('');

            // Use all 3 attempts with different case variations
            await request(app).post('/api/auth/resend-otp').send({ email: baseEmail });
            await request(app).post('/api/auth/resend-otp').send({ email: upperEmail });
            await request(app).post('/api/auth/resend-otp').send({ email: mixedEmail });

            // Fourth request should be rate limited regardless of case
            await request(app).post('/api/auth/resend-otp').send({ email: baseEmail }).expect(429);
            await request(app).post('/api/auth/resend-otp').send({ email: upperEmail }).expect(429);
        });
    });

    describe('Counter Reset Tests', () => {
        it('should reset counter after manual reset', async () => {
            const email = getTestEmail();

            // Exhaust limit
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email }).expect(429);

            // Manually reset (simulates TTL expiry)
            await OtpResendRateLimiter.reset(email);

            // Next request should succeed
            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(202);

            expect(response.body.data.remaining).toBe(2);
        });
    });

    describe('Validation Tests', () => {
        it('should reject requests with missing email', async () => {
            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({})
                .expect(400);

            expect(response.body.message).toBe('Invalid request payload');
        });

        it('should reject requests with invalid email format', async () => {
            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email: 'not-an-email' })
                .expect(400);

            expect(response.body.message).toBe('Invalid request payload');
        });
    });

    describe('Response Structure Validation', () => {
        it('should include all required fields in success response', async () => {
            const email = getTestEmail();

            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(202);

            expect(response.body).toHaveProperty('success', true);
            expect(response.body).toHaveProperty('message');
            expect(response.body.data).toHaveProperty('email');
            expect(response.body.data).toHaveProperty('remaining');
            expect(response.body.data).toHaveProperty('resetAt');
            expect(typeof response.body.data.remaining).toBe('number');
        });

        it('should include all required fields in 429 response', async () => {
            const email = getTestEmail();

            // Exhaust limit
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email });
            await request(app).post('/api/auth/resend-otp').send({ email });

            const response = await request(app)
                .post('/api/auth/resend-otp')
                .send({ email })
                .expect(429);

            expect(response.body.error).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('retryAfter');
            expect(response.body.error).toHaveProperty('resetAt');
            expect(response.headers).toHaveProperty('retry-after');
        });
    });

    describe('Concurrent Request Handling', () => {
        it('should handle concurrent requests without counter corruption', async () => {
            const email = getTestEmail();

            // Fire 5 concurrent requests
            const promises = Array.from({ length: 5 }, () =>
                request(app).post('/api/auth/resend-otp').send({ email })
            );

            const responses = await Promise.all(promises);

            // Count successful (202) and rate limited (429) responses
            const successCount = responses.filter(r => r.status === 202).length;
            const rateLimitedCount = responses.filter(r => r.status === 429).length;

            // Exactly 3 should succeed, rest should be rate limited
            expect(successCount).toBe(3);
            expect(rateLimitedCount).toBe(2);
        });
    });
});
