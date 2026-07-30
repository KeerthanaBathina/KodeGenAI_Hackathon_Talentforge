import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import bcrypt from 'bcrypt';

describe('Password Reset API Integration Tests', () => {
    let testCandidate: any;
    const testEmail = `password-reset-api-${Date.now()}@example.com`;
    const originalPassword = 'OriginalPass123';

    beforeEach(async () => {
        const passwordHash = await bcrypt.hash(originalPassword, 10);
        testCandidate = await prisma.candidate.create({
            data: {
                email: testEmail,
                fullName: 'Test User',
                phoneNumber: null,
                status: 'active',
                failedLoginAttempts: 0,
                credentials: {
                    create: {
                        passwordHash,
                    },
                },
            },
            include: {
                credentials: true,
            },
        });
    });

    afterEach(async () => {
        await prisma.passwordResetToken.deleteMany({
            where: { candidateId: testCandidate.id },
        });
        await prisma.candidateCredential.deleteMany({
            where: { candidateId: testCandidate.id },
        });
        await prisma.candidate.delete({ where: { id: testCandidate.id } });
    });

    describe('POST /api/auth/request-password-reset', () => {
        it('should return 202 with generic message for existing email', async () => {
            const response = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            expect(response.body.message).toBe('If this email is registered, you will receive a password reset link');

            // Verify token created in database
            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });
            expect(token).toBeDefined();
            expect(token!.token).toBeTruthy();
        });

        it('should return same 202 message for non-existent email (non-enumeration)', async () => {
            const response = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: 'nonexistent@example.com' })
                .expect(202);

            expect(response.body.message).toBe('If this email is registered, you will receive a password reset link');

            // Verify no token created
            const tokenCount = await prisma.passwordResetToken.count();
            expect(tokenCount).toBe(0);
        });

        it('should return 400 for invalid email format', async () => {
            const response = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: 'not-an-email' })
                .expect(400);

            expect(response.body.error).toBeDefined();
        });

        it('should return 400 for missing email', async () => {
            const response = await request(app)
                .post('/api/auth/request-password-reset')
                .send({})
                .expect(400);

            expect(response.body.error).toBeDefined();
        });

        it('should enforce rate limiting after 3 requests', async () => {
            // Make 3 requests (should succeed)
            for (let i = 0; i < 3; i++) {
                await request(app)
                    .post('/api/auth/request-password-reset')
                    .send({ email: testEmail })
                    .expect(202);
            }

            // 4th request should be rate limited
            const response = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(429);

            expect(response.body.error).toBeDefined();
            expect(response.body.error.message).toContain('rate limit');
            expect(response.headers['retry-after']).toBeDefined();
        });
    });

    describe('GET /api/auth/validate-reset-token/:token', () => {
        it('should return valid for active token', async () => {
            // Generate token
            await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });

            const response = await request(app)
                .get(`/api/auth/validate-reset-token/${token!.token}`)
                .expect(200);

            expect(response.body.valid).toBe(true);
            expect(response.body.error).toBeUndefined();
        });

        it('should return 400 for non-existent token', async () => {
            const response = await request(app)
                .get('/api/auth/validate-reset-token/invalid-token-xyz')
                .expect(400);

            expect(response.body.valid).toBe(false);
            expect(response.body.error).toBe('TOKEN_NOT_FOUND');
            expect(response.body.message).toBe('Invalid reset link');
        });

        it('should return 400 for expired token', async () => {
            // Create expired token
            const expiredToken = await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'expired-token-test',
                    expiresAt: new Date(Date.now() - 1000),
                    ipAddress: '127.0.0.1',
                },
            });

            const response = await request(app)
                .get(`/api/auth/validate-reset-token/${expiredToken.token}`)
                .expect(400);

            expect(response.body.valid).toBe(false);
            expect(response.body.error).toBe('TOKEN_EXPIRED');
            expect(response.body.message).toBe('Reset link expired');
        });

        it('should return 400 for used token', async () => {
            // Create and immediately use token
            await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            // Mark as used
            await prisma.passwordResetToken.update({
                where: { id: token!.id },
                data: { usedAt: new Date() },
            });

            const response = await request(app)
                .get(`/api/auth/validate-reset-token/${token!.token}`)
                .expect(400);

            expect(response.body.valid).toBe(false);
            expect(response.body.error).toBe('TOKEN_USED');
            expect(response.body.message).toBe('Reset link already used');
        });
    });

    describe('POST /api/auth/reset-password', () => {
        it('should successfully reset password with valid token', async () => {
            // Generate token
            await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });

            const newPassword = 'NewSecurePass456';
            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: token!.token,
                    newPassword,
                })
                .expect(200);

            expect(response.body.message).toBe('Password reset successful');

            // Verify password changed
            const updatedCredential = await prisma.candidateCredential.findUnique({
                where: { candidateId: testCandidate.id },
            });
            const passwordMatches = await bcrypt.compare(newPassword, updatedCredential!.passwordHash);
            expect(passwordMatches).toBe(true);

            // Verify token marked as used
            const usedToken = await prisma.passwordResetToken.findUnique({
                where: { id: token!.id },
            });
            expect(usedToken!.usedAt).not.toBeNull();

            // Verify can login with new password
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: newPassword,
                })
                .expect(200);

            expect(loginResponse.body.success).toBe(true);
        });

        it('should return 400 for weak password', async () => {
            // Generate token
            await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: token!.token,
                    newPassword: 'weak',
                })
                .expect(400);

            expect(response.body.error.code).toBe('WEAK_PASSWORD');
            expect(response.body.error.message).toContain('Password must');

            // Verify old password still works
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: originalPassword,
                })
                .expect(200);

            expect(loginResponse.body.success).toBe(true);
        });

        it('should return 400 for expired token', async () => {
            const expiredToken = await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'expired-reset-token',
                    expiresAt: new Date(Date.now() - 1000),
                    ipAddress: '127.0.0.1',
                },
            });

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: expiredToken.token,
                    newPassword: 'NewValidPass789',
                })
                .expect(400);

            expect(response.body.error.code).toBe('TOKEN_EXPIRED');
        });

        it('should return 400 for already used token (single-use enforcement)', async () => {
            // Generate and use token
            await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            // First use - should succeed
            await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: token!.token,
                    newPassword: 'FirstNewPass123',
                })
                .expect(200);

            // Second use - should fail
            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: token!.token,
                    newPassword: 'SecondNewPass456',
                })
                .expect(400);

            expect(response.body.error.code).toBe('TOKEN_USED');
        });

        it('should return 400 for invalid token format', async () => {
            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: 'invalid-token',
                    newPassword: 'NewValidPass789',
                })
                .expect(400);

            expect(response.body.error.code).toBe('TOKEN_NOT_FOUND');
        });

        it('should return 400 for missing token', async () => {
            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    newPassword: 'NewValidPass789',
                })
                .expect(400);

            expect(response.body.error).toBeDefined();
        });

        it('should return 400 for missing password', async () => {
            await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            const response = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: token!.token,
                })
                .expect(400);

            expect(response.body.error).toBeDefined();
        });
    });

    describe('Complete Password Reset Flow', () => {
        it('should complete full flow: request → validate → reset → login', async () => {
            // Step 1: Request password reset
            const requestResponse = await request(app)
                .post('/api/auth/request-password-reset')
                .send({ email: testEmail })
                .expect(202);

            expect(requestResponse.body.message).toContain('If this email is registered');

            // Get generated token
            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });
            expect(token).toBeDefined();

            // Step 2: Validate token
            const validateResponse = await request(app)
                .get(`/api/auth/validate-reset-token/${token!.token}`)
                .expect(200);

            expect(validateResponse.body.valid).toBe(true);

            // Step 3: Reset password
            const newPassword = 'CompleteFlowPass123';
            const resetResponse = await request(app)
                .post('/api/auth/reset-password')
                .send({
                    token: token!.token,
                    newPassword,
                })
                .expect(200);

            expect(resetResponse.body.message).toBe('Password reset successful');

            // Step 4: Login with new password
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: newPassword,
                })
                .expect(200);

            expect(loginResponse.body.success).toBe(true);
            expect(loginResponse.body.data.user.email).toBe(testEmail);

            // Step 5: Verify old password no longer works
            await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: originalPassword,
                })
                .expect(401);
        });
    });
});
