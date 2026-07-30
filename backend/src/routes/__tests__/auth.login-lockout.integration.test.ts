import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import prisma from '../../db/prisma';
import bcrypt from 'bcrypt';

describe('Login and Lockout Integration Tests', () => {
    let testUser: any;
    const correctPassword = 'ValidPass123!';
    const testEmail = `lockout-test-${Date.now()}@example.com`;

    beforeEach(async () => {
        const passwordHash = await bcrypt.hash(correctPassword, 10);
        testUser = await prisma.candidate.create({
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
        await prisma.candidateCredential.deleteMany({ where: { candidateId: testUser.id } });
        await prisma.candidate.delete({ where: { id: testUser.id } });
    });

    it('should successfully login with valid credentials', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: correctPassword,
            })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Login successful');
        expect(response.body.data.user.email).toBe(testEmail);
        expect(response.body.data.user.role).toBe('candidate');
        expect(response.body.data.redirectTo).toBe('/candidate/applications');

        // Verify JWT cookie is set
        const cookies = response.headers['set-cookie'];
        expect(cookies).toBeDefined();
        expect(cookies.some((cookie: string) => cookie.startsWith('auth_token='))).toBe(true);

        // Verify failed attempts reset
        const updatedUser = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true, lastSuccessfulLoginAt: true },
        });
        expect(updatedUser?.failedLoginAttempts).toBe(0);
        expect(updatedUser?.lastSuccessfulLoginAt).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: 'WrongPassword',
            })
            .expect(401);

        expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(response.body.error.message).toBe('Invalid email or password');

        // Verify failed attempt counter incremented
        const updatedUser = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true },
        });
        expect(updatedUser?.failedLoginAttempts).toBe(1);
    });

    it('should lock account after 5 failed attempts', async () => {
        // Attempts 1-4: should fail but not lock
        for (let i = 0; i < 4; i++) {
            await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: 'WrongPassword',
                })
                .expect(401);
        }

        // Verify account is not locked yet
        const userAfter4 = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true, lockedUntil: true },
        });
        expect(userAfter4?.failedLoginAttempts).toBe(4);
        expect(userAfter4?.lockedUntil).toBeNull();

        // Attempt 5: should lock account
        const lockResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: 'WrongPassword',
            })
            .expect(423);

        expect(lockResponse.body.error.code).toBe('ACCOUNT_LOCKED');
        expect(lockResponse.body.error.message).toContain('locked');
        expect(lockResponse.body.error.lockedUntil).toBeDefined();

        // Verify account is locked in database
        const lockedUser = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true, lockedUntil: true },
        });
        expect(lockedUser?.failedLoginAttempts).toBe(5);
        expect(lockedUser?.lockedUntil).toBeDefined();
        expect(lockedUser?.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should reject login attempts for locked account', async () => {
        // Lock the account by setting lockedUntil
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
        await prisma.candidate.update({
            where: { id: testUser.id },
            data: {
                failedLoginAttempts: 5,
                lockedUntil: lockUntil,
            },
        });

        // Try to login with correct password
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: correctPassword,
            })
            .expect(423);

        expect(response.body.error.code).toBe('ACCOUNT_LOCKED');
        expect(response.body.error.message).toContain('locked');
        expect(response.body.error.lockedUntil).toBeDefined();

        // Verify no JWT cookie is set
        const cookies = response.headers['set-cookie'];
        if (cookies) {
            expect(cookies.every((cookie: string) => !cookie.startsWith('auth_token='))).toBe(true);
        }
    });

    it('should allow login after lockout period expires', async () => {
        // Lock the account with an expired lockout
        const expiredLockout = new Date(Date.now() - 1000); // 1 second ago
        await prisma.candidate.update({
            where: { id: testUser.id },
            data: {
                failedLoginAttempts: 5,
                lockedUntil: expiredLockout,
            },
        });

        // Should be able to login now
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: correctPassword,
            })
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.user.email).toBe(testEmail);

        // Verify lockout was cleared
        const updatedUser = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true, lockedUntil: true },
        });
        expect(updatedUser?.failedLoginAttempts).toBe(0);
        expect(updatedUser?.lockedUntil).toBeNull();
    });

    it('should validate request payload', async () => {
        // Missing password
        const response1 = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
            })
            .expect(400);

        expect(response1.body.message).toBe('Invalid request payload');
        expect(response1.body.errors).toBeDefined();

        // Invalid email format
        const response2 = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'not-an-email',
                password: correctPassword,
            })
            .expect(400);

        expect(response2.body.message).toBe('Invalid request payload');

        // Password too short
        const response3 = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: 'short',
            })
            .expect(400);

        expect(response3.body.message).toBe('Invalid request payload');
    });

    it('should reset failed attempts counter on successful login', async () => {
        // Make 3 failed attempts
        for (let i = 0; i < 3; i++) {
            await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmail,
                    password: 'WrongPassword',
                })
                .expect(401);
        }

        // Verify counter is at 3
        const userBeforeSuccess = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true },
        });
        expect(userBeforeSuccess?.failedLoginAttempts).toBe(3);

        // Successful login
        await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: correctPassword,
            })
            .expect(200);

        // Verify counter reset to 0
        const userAfterSuccess = await prisma.candidate.findUnique({
            where: { id: testUser.id },
            select: { failedLoginAttempts: true },
        });
        expect(userAfterSuccess?.failedLoginAttempts).toBe(0);
    });

    it('should handle logout correctly', async () => {
        // First login
        const loginResponse = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: correctPassword,
            })
            .expect(200);

        const cookies = loginResponse.headers['set-cookie'];
        expect(cookies).toBeDefined();

        // Logout
        const logoutResponse = await request(app)
            .post('/api/auth/logout')
            .expect(200);

        expect(logoutResponse.body.success).toBe(true);
        expect(logoutResponse.body.message).toBe('Logged out successfully');

        // Verify cookie is cleared
        const logoutCookies = logoutResponse.headers['set-cookie'];
        expect(logoutCookies).toBeDefined();
        expect(logoutCookies.some((cookie: string) =>
            cookie.startsWith('auth_token=') && cookie.includes('Max-Age=0')
        )).toBe(true);
    });
});
