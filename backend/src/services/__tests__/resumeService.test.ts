import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePresignedUrl, ResumeUploadError } from '../resumeService';
import prisma from '../../db/prisma';
import { createClient } from '@supabase/supabase-js';

vi.mock('../../db/prisma');
vi.mock('@supabase/supabase-js');

describe('ResumeService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('generatePresignedUrl', () => {
        it('should generate presigned URL for valid PDF file', async () => {
            const mockApplication = {
                id: 'app-1',
                candidateId: 'candidate-1',
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        createSignedUploadUrl: vi.fn().mockResolvedValue({
                            data: {
                                signedUrl: 'https://supabase.co/upload-url',
                                path: 'resumes/candidate-1/test.pdf',
                            },
                            error: null,
                        }),
                    })),
                },
            };

            vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
            vi.mocked(prisma.resume.create).mockResolvedValue({
                id: 'resume-1',
                storageKey: 'resumes/candidate-1/test.pdf',
            } as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            const result = await generatePresignedUrl({
                applicationId: 'app-1',
                fileName: 'resume.pdf',
                fileSize: 1024 * 1024, // 1 MB
                mimeType: 'application/pdf',
            });

            expect(result).toMatchObject({
                uploadUrl: 'https://supabase.co/upload-url',
                resumeId: 'resume-1',
                expiresIn: 300,
            });
        });

        it('should generate presigned URL for valid DOCX file', async () => {
            const mockApplication = {
                id: 'app-1',
                candidateId: 'candidate-1',
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        createSignedUploadUrl: vi.fn().mockResolvedValue({
                            data: {
                                signedUrl: 'https://supabase.co/upload-url',
                                path: 'resumes/candidate-1/test.docx',
                            },
                            error: null,
                        }),
                    })),
                },
            };

            vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
            vi.mocked(prisma.resume.create).mockResolvedValue({
                id: 'resume-2',
                storageKey: 'resumes/candidate-1/test.docx',
            } as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            const result = await generatePresignedUrl({
                applicationId: 'app-1',
                fileName: 'resume.docx',
                fileSize: 2 * 1024 * 1024, // 2 MB
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            expect(result.resumeId).toBe('resume-2');
        });

        it('should reject invalid file type', async () => {
            await expect(
                generatePresignedUrl({
                    applicationId: 'app-1',
                    fileName: 'resume.txt',
                    fileSize: 1024,
                    mimeType: 'text/plain',
                })
            ).rejects.toThrow(ResumeUploadError);

            await expect(
                generatePresignedUrl({
                    applicationId: 'app-1',
                    fileName: 'resume.txt',
                    fileSize: 1024,
                    mimeType: 'text/plain',
                })
            ).rejects.toMatchObject({
                code: 'INVALID_FILE_TYPE',
            });
        });

        it('should reject file exceeding size limit', async () => {
            await expect(
                generatePresignedUrl({
                    applicationId: 'app-1',
                    fileName: 'resume.pdf',
                    fileSize: 11 * 1024 * 1024, // 11 MB
                    mimeType: 'application/pdf',
                })
            ).rejects.toThrow(ResumeUploadError);

            await expect(
                generatePresignedUrl({
                    applicationId: 'app-1',
                    fileName: 'resume.pdf',
                    fileSize: 11 * 1024 * 1024,
                    mimeType: 'application/pdf',
                })
            ).rejects.toMatchObject({
                code: 'FILE_TOO_LARGE',
            });
        });

        it('should reject if application not found', async () => {
            vi.mocked(prisma.application.findUnique).mockResolvedValue(null);

            await expect(
                generatePresignedUrl({
                    applicationId: 'app-nonexistent',
                    fileName: 'resume.pdf',
                    fileSize: 1024,
                    mimeType: 'application/pdf',
                })
            ).rejects.toThrow('Application not found');
        });

        it('should handle Supabase upload URL generation failure', async () => {
            const mockApplication = {
                id: 'app-1',
                candidateId: 'candidate-1',
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        createSignedUploadUrl: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: 'Storage error' },
                        }),
                    })),
                },
            };

            vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            await expect(
                generatePresignedUrl({
                    applicationId: 'app-1',
                    fileName: 'resume.pdf',
                    fileSize: 1024,
                    mimeType: 'application/pdf',
                })
            ).rejects.toMatchObject({
                code: 'PRESIGNED_URL_FAILED',
            });
        });

        it('should generate unique storage keys for same candidate', async () => {
            const mockApplication = {
                id: 'app-1',
                candidateId: 'candidate-1',
            };

            const keys: string[] = [];

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        createSignedUploadUrl: vi.fn((key: string) => {
                            keys.push(key);
                            return Promise.resolve({
                                data: { signedUrl: 'https://supabase.co/upload', path: key },
                                error: null,
                            });
                        }),
                    })),
                },
            };

            vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
            vi.mocked(prisma.resume.create).mockResolvedValue({
                id: 'resume-1',
            } as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            await generatePresignedUrl({
                applicationId: 'app-1',
                fileName: 'resume1.pdf',
                fileSize: 1024,
                mimeType: 'application/pdf',
            });

            await generatePresignedUrl({
                applicationId: 'app-1',
                fileName: 'resume2.pdf',
                fileSize: 1024,
                mimeType: 'application/pdf',
            });

            expect(keys[0]).not.toBe(keys[1]);
            expect(keys[0]).toMatch(/^resumes\/candidate-1\//);
            expect(keys[1]).toMatch(/^resumes\/candidate-1\//);
        });

        it('should create Resume record with pending scan status', async () => {
            const mockApplication = {
                id: 'app-1',
                candidateId: 'candidate-1',
            };

            const mockSupabaseClient = {
                storage: {
                    from: vi.fn(() => ({
                        createSignedUploadUrl: vi.fn().mockResolvedValue({
                            data: { signedUrl: 'https://supabase.co/upload', path: 'test.pdf' },
                            error: null,
                        }),
                    })),
                },
            };

            vi.mocked(prisma.application.findUnique).mockResolvedValue(mockApplication as any);
            vi.mocked(createClient).mockReturnValue(mockSupabaseClient as any);

            let resumeData: any;
            vi.mocked(prisma.resume.create).mockImplementation((params: any) => {
                resumeData = params.data;
                return Promise.resolve({ id: 'resume-1' } as any);
            });

            await generatePresignedUrl({
                applicationId: 'app-1',
                fileName: 'resume.pdf',
                fileSize: 1024,
                mimeType: 'application/pdf',
            });

            expect(resumeData).toMatchObject({
                applicationId: 'app-1',
                fileName: 'resume.pdf',
                fileSize: 1024,
                mimeType: 'application/pdf',
                scanStatus: 'pending',
            });
        });
    });
});
