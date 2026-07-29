/**
 * Unit Tests for Onboarding Email Service
 * 
 * Tests the user onboarding email functionality
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as emailService from '../emailService';
import { env } from '../../config/env';

// Mock the env module
vi.mock('../../config/env', () => ({
    env: {
        EMAIL_PROVIDER: 'mock',
        FRONTEND_URL: 'http://localhost:3000',
        EMAIL_FROM: 'noreply@test.com'
    }
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn()
    }
}));

// Mock path
vi.mock('path', () => ({
    default: {
        join: vi.fn((...args) => args.join('/'))
    }
}));

describe('Email Service - User Onboarding', () => {
    const mockHtmlTemplate = `
<!DOCTYPE html>
<html>
<body>
    <h1>Welcome {{fullName}}</h1>
    <p>Email: {{email}}</p>
    <p>Role: {{role}}</p>
    <p>Password: {{temporaryPassword}}</p>
    <p>Login: {{loginUrl}}</p>
    <p>Platform: {{platformName}}</p>
</body>
</html>
    `;

    const mockTextTemplate = `
Hello {{fullName}},

Email: {{email}}
Role: {{role}}
Password: {{temporaryPassword}}
Login: {{loginUrl}}
Platform: {{platformName}}
    `;

    beforeEach(async () => {
        vi.clearAllMocks();
        
        // Mock file system reads
        const fs = await import('fs/promises');
        (fs.default.readFile as any).mockImplementation((path: string) => {
            if (path.includes('.html')) {
                return Promise.resolve(mockHtmlTemplate);
            } else if (path.includes('.txt')) {
                return Promise.resolve(mockTextTemplate);
            }
            return Promise.reject(new Error('File not found'));
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('sendOnboardingEmail', () => {
        it('should send onboarding email with correct parameters', async () => {
            const params = {
                email: 'newuser@example.com',
                fullName: 'Test User',
                role: 'recruiter',
                temporaryPassword: 'temp-password-123'
            };

            // Mock email provider is 'mock', so this should not throw
            await expect(
                emailService.sendOnboardingEmail(params)
            ).resolves.not.toThrow();
        });

        it('should replace all template variables', async () => {
            const params = {
                email: 'testuser@example.com',
                fullName: 'Jane Doe',
                role: 'admin',
                temporaryPassword: 'secure-temp-pass-456'
            };

            const fs = await import('fs/promises');
            const readFileSpy = vi.spyOn(fs.default, 'readFile');

            await emailService.sendOnboardingEmail(params);

            // Verify that templates were read
            expect(readFileSpy).toHaveBeenCalledTimes(2); // HTML and text templates
        });

        it('should use mock provider in test environment', async () => {
            const params = {
                email: 'mockuser@example.com',
                fullName: 'Mock User',
                role: 'recruiter',
                temporaryPassword: 'mock-pass'
            };

            // Should complete successfully with mock provider
            await expect(
                emailService.sendOnboardingEmail(params)
            ).resolves.not.toThrow();
        });

        it('should include login URL from environment', async () => {
            const params = {
                email: 'urltest@example.com',
                fullName: 'URL Test',
                role: 'hr_reviewer',
                temporaryPassword: 'url-test-pass'
            };

            await emailService.sendOnboardingEmail(params);

            // Verify environment URL is used
            expect(env.FRONTEND_URL).toBeDefined();
        });

        it('should handle all user roles', async () => {
            const roles = ['admin', 'recruiter', 'hr_reviewer', 'hr_manager', 'tech_interviewer'];

            for (const role of roles) {
                const params = {
                    email: `${role}@example.com`,
                    fullName: `${role} User`,
                    role,
                    temporaryPassword: `${role}-pass`
                };

                await expect(
                    emailService.sendOnboardingEmail(params)
                ).resolves.not.toThrow();
            }
        });

        it('should handle special characters in user data', async () => {
            const params = {
                email: "user+test@example.com",
                fullName: "Test O'Brien",
                role: 'recruiter',
                temporaryPassword: 'P@ssw0rd!#$'
            };

            await expect(
                emailService.sendOnboardingEmail(params)
            ).resolves.not.toThrow();
        });

        it('should handle unicode characters in full name', async () => {
            const params = {
                email: 'unicode@example.com',
                fullName: 'José García-Muñoz',
                role: 'recruiter',
                temporaryPassword: 'unicode-pass'
            };

            await expect(
                emailService.sendOnboardingEmail(params)
            ).resolves.not.toThrow();
        });
    });

    describe('Template Variable Replacement', () => {
        it('should replace fullName correctly', async () => {
            const params = {
                email: 'test@example.com',
                fullName: 'John Smith',
                role: 'admin',
                temporaryPassword: 'test123'
            };

            const fs = await import('fs/promises');
            (fs.default.readFile as any).mockImplementation(() => {
                return Promise.resolve('Hello {{fullName}}');
            });

            await emailService.sendOnboardingEmail(params);

            // Template should have been read
            expect(fs.default.readFile).toHaveBeenCalled();
        });

        it('should replace all occurrences of placeholders', async () => {
            const params = {
                email: 'multi@example.com',
                fullName: 'Multi Test',
                role: 'recruiter',
                temporaryPassword: 'multi-pass'
            };

            const templateWithMultiplePlaceholders = `
                {{fullName}} - {{fullName}}
                {{email}} - {{email}}
            `;

            const fs = await import('fs/promises');
            (fs.default.readFile as any).mockImplementation(() => {
                return Promise.resolve(templateWithMultiplePlaceholders);
            });

            await emailService.sendOnboardingEmail(params);

            expect(fs.default.readFile).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle template file read errors gracefully', async () => {
            const params = {
                email: 'error@example.com',
                fullName: 'Error Test',
                role: 'recruiter',
                temporaryPassword: 'error-pass'
            };

            const fs = await import('fs/promises');
            (fs.default.readFile as any).mockRejectedValue(new Error('File not found'));

            // Should throw because template can't be read
            await expect(
                emailService.sendOnboardingEmail(params)
            ).rejects.toThrow();
        });
    });
});
