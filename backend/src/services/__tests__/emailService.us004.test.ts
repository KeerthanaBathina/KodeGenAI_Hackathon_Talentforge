import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    sendApplicationReceivedEmail,
    sendApplicationWithdrawnEmail,
} from '../emailService';
import * as templateRenderer from '../../email/templateRenderer';

// Mock dependencies
vi.mock('../../email/templateRenderer');
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock('../../config/env', () => ({
    env: {
        EMAIL_PROVIDER: 'mock',
        FRONTEND_URL: 'http://localhost:3000',
    },
}));

describe('emailService - US-004', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('sendApplicationReceivedEmail', () => {
        it('should render application received email with correct data', async () => {
            const mockHtml = '<html>Test Email</html>';
            vi.mocked(templateRenderer.renderApplicationReceivedEmail).mockResolvedValue(mockHtml);

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'John Doe',
                requisitionTitle: 'Software Engineer',
                requisitionDepartment: 'Engineering',
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                submittedAt: new Date('2026-07-24T10:00:00Z'),
            };

            await sendApplicationReceivedEmail(params);

            expect(templateRenderer.renderApplicationReceivedEmail).toHaveBeenCalledWith({
                candidateName: 'John Doe',
                requisitionTitle: 'Software Engineer',
                companyName: 'TalentForge',
                applicationId: '123E4567',
                department: 'Engineering',
                submittedAt: 'July 24, 2026',
                reviewTimelineDays: 5,
                trackApplicationUrl: 'http://localhost:3000/applications/track/123e4567-e89b-12d3-a456-426614174000',
            });
        });

        it('should format reference ID as uppercase 8 characters', async () => {
            const mockHtml = '<html>Test Email</html>';
            vi.mocked(templateRenderer.renderApplicationReceivedEmail).mockResolvedValue(mockHtml);

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Jane Smith',
                requisitionTitle: 'Product Manager',
                requisitionDepartment: 'Product',
                applicationId: 'abc123de-f456-7890-abcd-ef1234567890',
                submittedAt: new Date(),
            };

            await sendApplicationReceivedEmail(params);

            expect(templateRenderer.renderApplicationReceivedEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    applicationId: 'ABC123DE',
                })
            );
        });

        it('should include tracking URL with full application ID', async () => {
            const mockHtml = '<html>Test Email</html>';
            vi.mocked(templateRenderer.renderApplicationReceivedEmail).mockResolvedValue(mockHtml);

            const applicationId = '123e4567-e89b-12d3-a456-426614174000';
            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Engineer',
                requisitionDepartment: 'Eng',
                applicationId,
                submittedAt: new Date(),
            };

            await sendApplicationReceivedEmail(params);

            expect(templateRenderer.renderApplicationReceivedEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    trackApplicationUrl: `http://localhost:3000/applications/track/${applicationId}`,
                })
            );
        });

        it('should not throw when template rendering fails', async () => {
            vi.mocked(templateRenderer.renderApplicationReceivedEmail).mockRejectedValue(
                new Error('Template error')
            );

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Engineer',
                requisitionDepartment: 'Eng',
                applicationId: '123',
                submittedAt: new Date(),
            };

            await expect(sendApplicationReceivedEmail(params)).resolves.not.toThrow();
        });

        it('should format submitted date in human-readable format', async () => {
            const mockHtml = '<html>Test Email</html>';
            vi.mocked(templateRenderer.renderApplicationReceivedEmail).mockResolvedValue(mockHtml);

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Engineer',
                requisitionDepartment: 'Eng',
                applicationId: '123',
                submittedAt: new Date('2026-12-25T15:30:00Z'),
            };

            await sendApplicationReceivedEmail(params);

            expect(templateRenderer.renderApplicationReceivedEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    submittedAt: 'December 25, 2026',
                })
            );
        });
    });

    describe('sendApplicationWithdrawnEmail', () => {
        it('should render withdrawal email with correct data', async () => {
            const mockHtml = '<html>Withdrawal Email</html>';
            vi.mocked(templateRenderer.renderApplicationWithdrawnEmail).mockResolvedValue(mockHtml);

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'John Doe',
                requisitionTitle: 'Software Engineer',
                applicationId: '123e4567-e89b-12d3-a456-426614174000',
                withdrawnAt: new Date('2026-07-24T14:00:00Z'),
            };

            await sendApplicationWithdrawnEmail(params);

            expect(templateRenderer.renderApplicationWithdrawnEmail).toHaveBeenCalledWith({
                candidateName: 'John Doe',
                requisitionTitle: 'Software Engineer',
                companyName: 'TalentForge',
                applicationId: '123E4567',
                withdrawnAt: 'July 24, 2026',
                browseJobsUrl: 'http://localhost:3000/jobs',
            });
        });

        it('should include browse jobs URL', async () => {
            const mockHtml = '<html>Withdrawal Email</html>';
            vi.mocked(templateRenderer.renderApplicationWithdrawnEmail).mockResolvedValue(mockHtml);

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Engineer',
                applicationId: '123',
                withdrawnAt: new Date(),
            };

            await sendApplicationWithdrawnEmail(params);

            expect(templateRenderer.renderApplicationWithdrawnEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    browseJobsUrl: 'http://localhost:3000/jobs',
                })
            );
        });

        it('should not throw when template rendering fails', async () => {
            vi.mocked(templateRenderer.renderApplicationWithdrawnEmail).mockRejectedValue(
                new Error('Template error')
            );

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Engineer',
                applicationId: '123',
                withdrawnAt: new Date(),
            };

            await expect(sendApplicationWithdrawnEmail(params)).resolves.not.toThrow();
        });

        it('should format reference ID as uppercase 8 characters', async () => {
            const mockHtml = '<html>Withdrawal Email</html>';
            vi.mocked(templateRenderer.renderApplicationWithdrawnEmail).mockResolvedValue(mockHtml);

            const params = {
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Engineer',
                applicationId: 'fedcba98-7654-3210-fedc-ba9876543210',
                withdrawnAt: new Date(),
            };

            await sendApplicationWithdrawnEmail(params);

            expect(templateRenderer.renderApplicationWithdrawnEmail).toHaveBeenCalledWith(
                expect.objectContaining({
                    applicationId: 'FEDCBA98',
                })
            );
        });
    });
});
