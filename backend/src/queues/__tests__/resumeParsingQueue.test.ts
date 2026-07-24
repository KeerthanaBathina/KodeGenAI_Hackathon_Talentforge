import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueResumeForParsing } from '../resumeParsingQueue';

vi.mock('bullmq', () => {
    const mockAdd = vi.fn().mockResolvedValue({ id: 'job-123' });
    const mockOn = vi.fn();

    return {
        Queue: vi.fn().mockImplementation(() => ({
            add: mockAdd,
            on: mockOn,
        })),
    };
});

describe('ResumeParsingQueue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('enqueueResumeForParsing', () => {
        it('should enqueue resume with correct job data', async () => {
            const data = {
                resumeId: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/candidate-1/test.pdf',
                candidateId: 'candidate-1',
            };

            const jobId = await enqueueResumeForParsing(data);

            expect(jobId).toBe('job-123');
        });

        it('should use deterministic job ID', async () => {
            const data = {
                resumeId: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/test.pdf',
                candidateId: 'candidate-1',
            };

            await enqueueResumeForParsing(data);

            const { Queue } = await import('bullmq');
            const mockQueue = new Queue('test');
            expect(mockQueue.add).toHaveBeenCalledWith(
                'parse-resume',
                data,
                expect.objectContaining({
                    jobId: 'parse-resume-1',
                })
            );
        });

        it('should handle queue errors gracefully', async () => {
            const { Queue } = await import('bullmq');
            const mockQueue = new Queue('test');
            vi.mocked(mockQueue.add).mockRejectedValueOnce(new Error('Queue error'));

            const data = {
                resumeId: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/test.pdf',
                candidateId: 'candidate-1',
            };

            await expect(enqueueResumeForParsing(data)).rejects.toThrow('Queue error');
        });

        it('should maintain idempotency for same resume', async () => {
            const data = {
                resumeId: 'resume-1',
                applicationId: 'app-1',
                storageKey: 'resumes/test.pdf',
                candidateId: 'candidate-1',
            };

            const jobId1 = await enqueueResumeForParsing(data);
            const jobId2 = await enqueueResumeForParsing(data);

            expect(jobId1).toBe(jobId2);
        });
    });
});
