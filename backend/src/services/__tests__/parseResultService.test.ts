import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processParseResult, ParseResultError } from '../parseResultService';
import prisma from '../../db/prisma';
import { auditEvent } from '../auditService';

vi.mock('../../db/prisma');
vi.mock('../auditService');

describe('ParseResultService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('processParseResult', () => {
        it('should store parsed data on success', async () => {
            const mockResume = {
                id: 'resume-1',
                application: {
                    candidateId: 'candidate-1',
                    candidate: {},
                },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(auditEvent).mockResolvedValue(undefined);

            await processParseResult({
                resumeId: 'resume-1',
                status: 'success',
                parsedData: {
                    name: 'John Doe',
                    email: 'john@example.com',
                    phone: '555-1234',
                    skills: ['Python', 'React', 'PostgreSQL'],
                    experience_years: 5,
                    employers: [
                        { name: 'Acme Corp', title: 'Senior Engineer' },
                    ],
                    education: [
                        { degree: 'Bachelor', field: 'Computer Science', institution: 'MIT' },
                    ],
                    extracted_at: new Date().toISOString(),
                },
            });

            expect(prisma.resume.update).toHaveBeenCalledWith({
                where: { id: 'resume-1' },
                data: expect.objectContaining({
                    parsedData: expect.any(Object),
                }),
            });
        });

        it('should log audit event with correct metadata', async () => {
            const mockResume = {
                id: 'resume-1',
                application: {
                    candidateId: 'candidate-1',
                },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(auditEvent).mockResolvedValue(undefined);

            await processParseResult({
                resumeId: 'resume-1',
                status: 'success',
                parsedData: {
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    phone: '',
                    skills: ['TypeScript', 'Node.js'],
                    experience_years: 3,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            });

            expect(auditEvent).toHaveBeenCalledWith({
                entityType: 'resume',
                entityId: 'resume-1',
                action: 'resume.parsed',
                actorId: 'system',
                metadata: expect.objectContaining({
                    skillsCount: 2,
                    experienceYears: 3,
                }),
            });
        });

        it('should update status on parse failure', async () => {
            const mockResume = {
                id: 'resume-1',
                application: { candidateId: 'candidate-1' },
                scanResult: {},
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);

            await processParseResult({
                resumeId: 'resume-1',
                status: 'failed',
                error: 'Timeout parsing PDF',
            });

            expect(prisma.resume.update).toHaveBeenCalledWith({
                where: { id: 'resume-1' },
                data: expect.objectContaining({
                    scanResult: expect.objectContaining({
                        parseError: 'Timeout parsing PDF',
                    }),
                }),
            });
        });

        it('should throw ParseResultError when resume not found', async () => {
            vi.mocked(prisma.resume.findUnique).mockResolvedValue(null);

            await expect(
                processParseResult({
                    resumeId: 'nonexistent',
                    status: 'success',
                    parsedData: {
                        name: 'Test',
                        email: '',
                        phone: '',
                        skills: [],
                        experience_years: 0,
                        employers: [],
                        education: [],
                        extracted_at: new Date().toISOString(),
                    },
                })
            ).rejects.toThrow(ParseResultError);
        });

        it('should handle empty skills array', async () => {
            const mockResume = {
                id: 'resume-1',
                application: { candidateId: 'candidate-1' },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(auditEvent).mockResolvedValue(undefined);

            await processParseResult({
                resumeId: 'resume-1',
                status: 'success',
                parsedData: {
                    name: 'Test User',
                    email: 'test@example.com',
                    phone: '',
                    skills: [],
                    experience_years: 0,
                    employers: [],
                    education: [],
                    extracted_at: new Date().toISOString(),
                },
            });

            expect(prisma.resume.update).toHaveBeenCalled();
        });
    });
});
