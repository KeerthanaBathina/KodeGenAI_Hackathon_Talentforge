/**
 * Integration Tests for User Onboarding Email
 * 
 * Tests that onboarding emails are sent when users are created
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { UserRole } from '@prisma/client';
import prisma from '../../db/prisma';
import * as userManagementService from '../../services/userManagementService';
import * as emailService from '../../services/emailService';

describe('User Onboarding Email Integration', () => {
    // Spy on email service
    let sendOnboardingEmailSpy: any;

    beforeAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@email-integration-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@email-integration-test.com'
                }
            }
        });

        // Spy on the sendOnboardingEmail function
        sendOnboardingEmailSpy = vi.spyOn(emailService, 'sendOnboardingEmail');
    });

    afterAll(async () => {
        // Clean up test data
        await prisma.userCredential.deleteMany({
            where: {
                user: {
                    email: {
                        contains: '@email-integration-test.com'
                    }
                }
            }
        });
        await prisma.user.deleteMany({
            where: {
                email: {
                    contains: '@email-integration-test.com'
                }
            }
        });
        await prisma.$disconnect();

        // Restore spy
        sendOnboardingEmailSpy.mockRestore();
    });

    describe('createUser with Email', () => {
        it('should send onboarding email after user creation', async () => {
            const userData = {
                email: 'emailtest1@email-integration-test.com',
                fullName: 'Email Test User',
                role: UserRole.recruiter,
                timezone: 'America/New_York'
            };

            const result = await userManagementService.createUser(userData);

            // Give async email a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify email was called with correct parameters
            expect(sendOnboardingEmailSpy).toHaveBeenCalledWith({
                email: userData.email,
                fullName: userData.fullName,
                role: userData.role,
                temporaryPassword: result.temporaryPassword
            });

            expect(result.user).toBeDefined();
            expect(result.temporaryPassword).toBeDefined();
        });

        it('should not block user creation if email fails', async () => {
            // Mock email service to throw error
            sendOnboardingEmailSpy.mockRejectedValueOnce(new Error('Email service unavailable'));

            const userData = {
                email: 'emailfail@email-integration-test.com',
                fullName: 'Email Fail User',
                role: UserRole.hr_reviewer
            };

            // User creation should still succeed
            const result = await userManagementService.createUser(userData);

            expect(result.user).toBeDefined();
            expect(result.user.email).toBe(userData.email);
            expect(result.temporaryPassword).toBeDefined();
        });

        it('should send email with all required fields', async () => {
            const userData = {
                email: 'allfields@email-integration-test.com',
                fullName: 'All Fields User',
                role: UserRole.admin,
                timezone: 'Europe/London'
            };

            const result = await userManagementService.createUser(userData);

            // Give async email a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verify email was called
            expect(sendOnboardingEmailSpy).toHaveBeenCalled();

            const emailCall = sendOnboardingEmailSpy.mock.calls.find(
                (call: any) => call[0].email === userData.email
            );

            expect(emailCall).toBeDefined();
            expect(emailCall[0]).toMatchObject({
                email: userData.email,
                fullName: userData.fullName,
                role: userData.role,
                temporaryPassword: expect.any(String)
            });
        });

        it('should send email for multiple user creations', async () => {
            const users = [
                {
                    email: 'multi1@email-integration-test.com',
                    fullName: 'Multi User 1',
                    role: UserRole.recruiter
                },
                {
                    email: 'multi2@email-integration-test.com',
                    fullName: 'Multi User 2',
                    role: UserRole.hr_reviewer
                }
            ];

            const initialCallCount = sendOnboardingEmailSpy.mock.calls.length;

            for (const userData of users) {
                await userManagementService.createUser(userData);
            }

            // Give async emails a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify emails were sent for all users
            expect(sendOnboardingEmailSpy.mock.calls.length).toBeGreaterThanOrEqual(
                initialCallCount + users.length
            );
        });

        it('should include temporary password in email', async () => {
            const userData = {
                email: 'temppass@email-integration-test.com',
                fullName: 'Temp Pass User',
                role: UserRole.tech_interviewer
            };

            const result = await userManagementService.createUser(userData);

            // Give async email a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            const emailCall = sendOnboardingEmailSpy.mock.calls.find(
                (call: any) => call[0].email === userData.email
            );

            expect(emailCall[0].temporaryPassword).toBe(result.temporaryPassword);
            expect(emailCall[0].temporaryPassword).toBeTruthy();
            expect(emailCall[0].temporaryPassword.length).toBeGreaterThan(0);
        });
    });

    describe('Email Delivery Timing', () => {
        it('should queue email within 2 minutes (immediately in practice)', async () => {
            const userData = {
                email: 'timing@email-integration-test.com',
                fullName: 'Timing Test User',
                role: UserRole.recruiter
            };

            const startTime = Date.now();

            await userManagementService.createUser(userData);

            // Give async email a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            const endTime = Date.now();
            const elapsed = endTime - startTime;

            // Should be queued almost instantly (well under 2 minutes = 120000ms)
            expect(elapsed).toBeLessThan(120000);

            // In practice, should be under 1 second
            expect(elapsed).toBeLessThan(5000);
        });
    });

    describe('Email Content Verification', () => {
        it('should pass correct role to email service', async () => {
            const roles: UserRole[] = [
                UserRole.admin,
                UserRole.recruiter,
                UserRole.hr_reviewer,
                UserRole.hr_manager
            ];

            for (const role of roles) {
                const userData = {
                    email: `role-${role}@email-integration-test.com`,
                    fullName: `Role ${role} User`,
                    role
                };

                await userManagementService.createUser(userData);
            }

            // Give async emails a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 200));

            // Verify each role was passed correctly
            for (const role of roles) {
                const emailCall = sendOnboardingEmailSpy.mock.calls.find(
                    (call: any) => call[0].role === role
                );

                expect(emailCall).toBeDefined();
            }
        });

        it('should pass normalized email to email service', async () => {
            const userData = {
                email: 'UPPERCASE@email-integration-test.com',
                fullName: 'Uppercase Email User',
                role: UserRole.recruiter
            };

            await userManagementService.createUser(userData);

            // Give async email a moment to trigger
            await new Promise(resolve => setTimeout(resolve, 100));

            const emailCall = sendOnboardingEmailSpy.mock.calls.find(
                (call: any) => call[0].email.includes('uppercase')
            );

            expect(emailCall).toBeDefined();
            // Should be normalized to lowercase
            expect(emailCall[0].email).toBe('uppercase@email-integration-test.com');
        });
    });
});
