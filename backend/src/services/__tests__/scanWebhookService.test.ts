import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processScanResult, ScanWebhookError } from '../scanWebhookService';
import prisma from '../../db/prisma';
import { quarantineInfectedFile } from '../quarantineService';
import { enqueueResumeForParsing } from '../../queues/resumeParsingQueue';

vi.mock('../../db/prisma');
vi.mock('../quarantineService');
vi.mock('../../queues/resumeParsingQueue');
vi.mock('../auditService', () => ({
    auditEvent: vi.fn().mockResolvedValue(undefined),
}));

describe('ScanWebhookService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('processScanResult', () => {
        it('should update resume status to clean when scan passes', async () => {
            const mockResume = {
                id: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/test.pdf',
                application: { candidateId: 'candidate-1' },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(enqueueResumeForParsing).mockResolvedValue('job-1');

            await processScanResult({
                resumeId: 'resume-1',
                status: 'clean',
                scannerVersion: '1.0.0',
                scanTime: new Date(),
            });

            expect(prisma.resume.update).toHaveBeenCalledWith({
                where: { id: 'resume-1' },
                data: expect.objectContaining({
                    scanStatus: 'clean',
                }),
            });
        });

        it('should enqueue clean resume for parsing', async () => {
            const mockResume = {
                id: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/test.pdf',
                scanResult: {},
                application: { candidateId: 'candidate-1' },
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);
            vi.mocked(enqueueResumeForParsing).mockResolvedValue('job-1');

            await processScanResult({
                resumeId: 'resume-1',
                status: 'clean',
                scannerVersion: '1.0.0',
                scanTime: new Date(),
            });

            // Wait for setImmediate
            await new Promise((resolve) => setImmediate(resolve));

            expect(enqueueResumeForParsing).toHaveBeenCalledWith({
                resumeId: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/test.pdf',
                candidateId: 'candidate-1',
            });
        });

        it('should quarantine infected resume', async () => {
            const mockResume = {
                id: 'resume-1',
                applicationId: 'app-1',
                application: {},
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);

            await processScanResult({
                resumeId: 'resume-1',
                status: 'infected',
                threats: ['Trojan.Generic', 'Malware.PDF'],
                scannerVersion: '1.0.0',
                scanTime: new Date(),
            });

            // Wait for setImmediate
            await new Promise((resolve) => setImmediate(resolve));

            expect(quarantineInfectedFile).toHaveBeenCalledWith('resume-1');
        });

        it('should store threat details in scan result', async () => {
            const mockResume = {
                id: 'resume-1',
                applicationId: 'app-1',
                application: {},
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);

            let savedScanResult: any;
            vi.mocked(prisma.resume.update).mockImplementation((params: any) => {
                savedScanResult = params.data.scanResult;
                return Promise.resolve({} as any);
            });

            const scanTime = new Date();
            await processScanResult({
                resumeId: 'resume-1',
                status: 'infected',
                threats: ['Trojan.Generic'],
                scannerVersion: '1.0.0',
                scanTime,
            });

            expect(savedScanResult).toMatchObject({
                status: 'infected',
                threats: ['Trojan.Generic'],
                scannerVersion: '1.0.0',
            });
        });

        it('should throw error if resume not found', async () => {
            vi.mocked(prisma.resume.findUnique).mockResolvedValue(null);

            await expect(
                processScanResult({
                    resumeId: 'resume-nonexistent',
                    status: 'clean',
                    scannerVersion: '1.0.0',
                    scanTime: new Date(),
                })
            ).rejects.toThrow(ScanWebhookError);
        });

        it('should handle missing scan time', async () => {
            const mockResume = {
                id: 'resume-1',
                applicationId: 'app-1',
                application: {},
            };

            vi.mocked(prisma.resume.findUnique).mockResolvedValue(mockResume as any);
            vi.mocked(prisma.resume.update).mockResolvedValue({} as any);

            await expect(
                processScanResult({
                    resumeId: 'resume-1',
                    status: 'clean',
                    scannerVersion: '1.0.0',
                    scanTime: undefined as any,
                })
            ).resolves.not.toThrow();
        });
    });
});
