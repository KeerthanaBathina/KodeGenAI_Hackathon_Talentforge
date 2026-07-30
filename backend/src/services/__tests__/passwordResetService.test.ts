import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import prisma from '../../db/prisma';
import bcrypt from 'bcrypt';
import {
    generateResetToken,
    validateResetToken,
    consumeResetToken,
    revokeTokensForUser,
    PasswordResetError,
} from '../passwordResetService';

describe('PasswordResetService', () => {
    let testCandidate: any;
    const testEmail = `reset-test-${Date.now()}@example.com`;

    beforeEach(async () => {
        testCandidate = await prisma.candidate.create({
            data: {
                email: testEmail,
                fullName: 'Test User',
                phoneNumber: null,
                status: 'active',
                failedLoginAttempts: 0,
                credentials: {
                    create: {
                        passwordHash: await bcrypt.hash('OldPassword123', 10),
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

    describe('generateResetToken', () => {
        it('should create token with 60-minute expiry for existing email', async () => {
            const result = await generateResetToken(testEmail, '127.0.0.1', 'test-agent');

            expect(result.message).toBe('If this email is registered, you will receive a password reset link');

            // Verify token created in database
            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });

            expect(token).toBeDefined();
            expect(token!.token).toHaveLength(43); // 32 bytes base64url = ~43 chars
            expect(token!.ipAddress).toBe('127.0.0.1');
            expect(token!.userAgent).toBe('test-agent');
            expect(token!.usedAt).toBeNull();

            // Verify expiry is ~60 minutes in future (±5 seconds tolerance)
            const expiryDiff = token!.expiresAt.getTime() - Date.now();
            expect(expiryDiff).toBeGreaterThan(59 * 60 * 1000);
            expect(expiryDiff).toBeLessThan(61 * 60 * 1000);
        });

        it('should return same message for non-existent email (non-enumeration)', async () => {
            const result = await generateResetToken('nonexistent@example.com', '127.0.0.1', 'test-agent');

            expect(result.message).toBe('If this email is registered, you will receive a password reset link');

            // Verify no token created
            const tokenCount = await prisma.passwordResetToken.count();
            expect(tokenCount).toBe(0);
        });

        it('should invalidate previous active tokens when generating new one', async () => {
            // Generate first token
            await generateResetToken(testEmail, '127.0.0.1', 'test-agent');

            const firstToken = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
                orderBy: { createdAt: 'asc' },
            });
            expect(firstToken).toBeDefined();
            expect(firstToken!.usedAt).toBeNull();

            // Generate second token
            await generateResetToken(testEmail, '127.0.0.2', 'test-agent-2');

            // Verify first token marked as used
            const updatedFirstToken = await prisma.passwordResetToken.findUnique({
                where: { id: firstToken!.id },
            });
            expect(updatedFirstToken!.usedAt).not.toBeNull();

            // Verify second token is active
            const secondToken = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });
            expect(secondToken).toBeDefined();
            expect(secondToken!.id).not.toBe(firstToken!.id);
        });
    });

    describe('validateResetToken', () => {
        it('should return valid for active token', async () => {
            await generateResetToken(testEmail);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });

            const result = await validateResetToken(token!.token);

            expect(result.valid).toBe(true);
            expect(result.candidateId).toBe(testCandidate.id);
            expect(result.error).toBeUndefined();
        });

        it('should return TOKEN_NOT_FOUND for non-existent token', async () => {
            const result = await validateResetToken('invalid-token-12345');

            expect(result.valid).toBe(false);
            expect(result.error).toBe('TOKEN_NOT_FOUND');
            expect(result.candidateId).toBeUndefined();
        });

        it('should return TOKEN_EXPIRED for expired token', async () => {
            // Create expired token manually
            const expiredToken = await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'expired-token-abc123',
                    expiresAt: new Date(Date.now() - 1000), // 1 second ago
                    ipAddress: '127.0.0.1',
                },
            });

            const result = await validateResetToken(expiredToken.token);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('TOKEN_EXPIRED');
        });

        it('should return TOKEN_USED for already used token', async () => {
            await generateResetToken(testEmail);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            // Mark token as used
            await prisma.passwordResetToken.update({
                where: { id: token!.id },
                data: { usedAt: new Date() },
            });

            const result = await validateResetToken(token!.token);

            expect(result.valid).toBe(false);
            expect(result.error).toBe('TOKEN_USED');
        });
    });

    describe('consumeResetToken', () => {
        it('should successfully reset password and mark token as used', async () => {
            await generateResetToken(testEmail);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id, usedAt: null },
            });

            const newPassword = 'NewValidPass123';
            await consumeResetToken(token!.token, newPassword, '127.0.0.1', 'test-agent');

            // Verify token marked as used
            const updatedToken = await prisma.passwordResetToken.findUnique({
                where: { id: token!.id },
            });
            expect(updatedToken!.usedAt).not.toBeNull();

            // Verify password changed
            const updatedCredential = await prisma.candidateCredential.findUnique({
                where: { candidateId: testCandidate.id },
            });
            const passwordMatches = await bcrypt.compare(newPassword, updatedCredential!.passwordHash);
            expect(passwordMatches).toBe(true);

            // Verify failed login attempts reset
            const updatedCandidate = await prisma.candidate.findUnique({
                where: { id: testCandidate.id },
            });
            expect(updatedCandidate!.failedLoginAttempts).toBe(0);
            expect(updatedCandidate!.lockedUntil).toBeNull();
        });

        it('should reject weak passwords', async () => {
            await generateResetToken(testEmail);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            await expect(
                consumeResetToken(token!.token, 'weak', '127.0.0.1', 'test-agent')
            ).rejects.toThrow(PasswordResetError);

            await expect(
                consumeResetToken(token!.token, 'weak', '127.0.0.1', 'test-agent')
            ).rejects.toMatchObject({
                code: 'WEAK_PASSWORD',
            });
        });

        it('should reject expired token', async () => {
            const expiredToken = await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'expired-token-xyz789',
                    expiresAt: new Date(Date.now() - 1000),
                    ipAddress: '127.0.0.1',
                },
            });

            await expect(
                consumeResetToken(expiredToken.token, 'NewValidPass123', '127.0.0.1', 'test-agent')
            ).rejects.toThrow(PasswordResetError);

            await expect(
                consumeResetToken(expiredToken.token, 'NewValidPass123', '127.0.0.1', 'test-agent')
            ).rejects.toMatchObject({
                code: 'TOKEN_EXPIRED',
            });
        });

        it('should reject already used token', async () => {
            await generateResetToken(testEmail);

            const token = await prisma.passwordResetToken.findFirst({
                where: { candidateId: testCandidate.id },
            });

            // Use token once
            await consumeResetToken(token!.token, 'NewValidPass123', '127.0.0.1', 'test-agent');

            // Try to use again
            await expect(
                consumeResetToken(token!.token, 'AnotherPass456', '127.0.0.1', 'test-agent')
            ).rejects.toThrow(PasswordResetError);

            await expect(
                consumeResetToken(token!.token, 'AnotherPass456', '127.0.0.1', 'test-agent')
            ).rejects.toMatchObject({
                code: 'TOKEN_USED',
            });
        });
    });

    describe('revokeTokensForUser', () => {
        it('should mark all active tokens as used', async () => {
            // Create multiple tokens
            await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'token-1',
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                    ipAddress: '127.0.0.1',
                },
            });

            await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'token-2',
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                    ipAddress: '127.0.0.1',
                },
            });

            // Verify both active
            const activeCount = await prisma.passwordResetToken.count({
                where: { candidateId: testCandidate.id, usedAt: null },
            });
            expect(activeCount).toBe(2);

            // Revoke all
            await revokeTokensForUser(testCandidate.id);

            // Verify all marked as used
            const remainingActive = await prisma.passwordResetToken.count({
                where: { candidateId: testCandidate.id, usedAt: null },
            });
            expect(remainingActive).toBe(0);
        });

        it('should not affect already used tokens', async () => {
            // Create used token
            await prisma.passwordResetToken.create({
                data: {
                    candidateId: testCandidate.id,
                    token: 'used-token',
                    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
                    ipAddress: '127.0.0.1',
                    usedAt: new Date(Date.now() - 1000),
                },
            });

            await revokeTokensForUser(testCandidate.id);

            // Verify token still exists with same usedAt
            const token = await prisma.passwordResetToken.findFirst({
                where: { token: 'used-token' },
            });
            expect(token).toBeDefined();
            expect(token!.usedAt).not.toBeNull();
        });
    });
});
