import { describe, it, expect, vi, beforeEach } from 'vitest';
import { quarantineInfectedFile } from '../quarantineService';
import prisma from '../../db/prisma';
import { sendQuarantineNotificationEmail } from '../emailService';
import { createClient } from '@supabase/supabase-js';

vi.mock('../../db/prisma');
vi.mock('../emailService');
vi.mock('@supabase/supabase-js');

describe('QuarantineService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('quarantineInfectedFile', () => {
        it('should move infected file to quarantine bucket', async () => {
            const mockResume = {
                id: 'resume-1',
                storageKey: 'resumes/candidate-1/test.pdf',
                fileName: 'test.pdf',
                scanStatus: 'infected',
                application: {
                    candidateId: 'candidate-1',
                    candidate: {
                        email: 'test@example.com',
                        profile: { fullName: 'Test User' },
                    },
                    requisition: { title: 'Software Engineer' },
                },
            };

            const mockCopy = vi.fn().mockResolvedValue({ error: null });
            const mockRemove = vi.fn().mockResolvedValue({ error: null });

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn((bucket: string) => {
                        if (bucket === 'resumes') {
                            return {
                                copy: mockCopy,
                                remove: mockRemove,
                            };
                        }
                        return {};
                    }),
                },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            await quarantineInfectedFile('resume-1');

            expect(mockCopy).toHaveBeenCalledWith(
                'resumes/candidate-1/test.pdf',
                expect.stringContaining('../quarantine/quarantine/resume-1/')
            );
            expect(mockRemove).toHaveBeenCalledWith(['resumes/candidate-1/test.pdf']);
        });

        it('should update resume record with quarantine location', async () => {
            const mockResume = {
                id: 'resume-1',
                storageKey: 'resumes/candidate-1/test.pdf',
                fileName: 'test.pdf',
                scanStatus: 'infected',
                application: {
                    candidateId: 'candidate-1',
                    candidate: {
                        email: 'test@example.com',
                        profile: { fullName: 'Test User' },
                    },
                    requisition: { title: 'Software Engineer' },
                },
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        copy: vi.fn().mockResolvedValue({ error: null }),
                        remove: vi.fn().mockResolvedValue({ error: null }),
                    })),
                },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            let updatedData: any;
            vi.mocked(prisma.resume.update).mockImplementation((params: any) => {
                updatedData = params.data;
                return Promise.resolve({} as any);
            });

            await quarantineInfectedFile('resume-1');

            expect(updatedData.storageKey).toMatch(/^quarantine\/resume-1\//);
        });

        it('should send quarantine notification email', async () => {
            const mockResume = {
                id: 'resume-1',
                storageKey: 'resumes/candidate-1/test.pdf',
                fileName: 'test.pdf',
                scanStatus: 'infected',
                application: {
                    candidateId: 'candidate-1',
                    candidate: {
                        email: 'test@example.com',
                        profile: { fullName: 'Test User' },
                    },
                    requisition: { title: 'Software Engineer' },
                },
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        copy: vi.fn().mockResolvedValue({ error: null }),
                        remove: vi.fn().mockResolvedValue({ error: null }),
                    })),
                },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            await quarantineInfectedFile('resume-1');

            // Wait for setImmediate to execute
            await new Promise((resolve) => setImmediate(resolve));

            expect(sendQuarantineNotificationEmail).toHaveBeenCalledWith({
                candidateEmail: 'test@example.com',
                candidateName: 'Test User',
                requisitionTitle: 'Software Engineer',
                fileName: 'test.pdf',
            });
        });

        it('should throw error if resume not found', async () => {
            vi.mocked(prisma.resume.findUnique).mockResolvedValue(null);

            await expect(quarantineInfectedFile('resume-nonexistent')).rejects.toThrow(
                'Resume not found'
            );
        });

        it('should skip quarantine for non-infected files', async () => {
            const mockResume = {
                id: 'resume-1',
                storageKey: 'resumes/candidate-1/test.pdf',
                scanStatus: 'clean',
                application: {},
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);

            const mockCopy = vi.fn();
            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({ copy: mockCopy })),
                },
            };

            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            await quarantineInfectedFile('resume-1');

            expect(mockCopy).not.toHaveBeenCalled();
        });

        it('should handle copy failure', async () => {
            const mockResume = {
                id: 'resume-1',
                storageKey: 'resumes/candidate-1/test.pdf',
                fileName: 'test.pdf',
                scanStatus: 'infected',
                application: {
                    candidate: { email: 'test@example.com', profile: {} },
                    requisition: {},
                },
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        copy: vi.fn().mockResolvedValue({ error: { message: 'Copy failed' } }),
                    })),
                },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            await expect(quarantineInfectedFile('resume-1')).rejects.toThrow(
                'Failed to quarantine file'
            );
        });
    });
});
