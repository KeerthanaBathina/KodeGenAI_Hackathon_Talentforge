import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    enqueueInterviewReminder,
    cancelInterviewReminders,
    interviewReminderQueue,
    InterviewReminderJobData,
} from '../interviewReminderQueue';

// Mock BullMQ
vi.mock('bullmq', () => {
    const mockJobs = new Map<string, any>();

    const Queue = vi.fn().mockImplementation((name: string, opts: any) => {
        return {
            add: vi.fn(async (jobName: string, data: any, options: any) => {
                const job = {
                    id: options.jobId,
                    name: jobName,
                    data,
                    opts: options,
                    timestamp: Date.now(),
                };
                mockJobs.set(options.jobId, job);
                return job;
            }),
            remove: vi.fn(async (jobId: string) => {
                const existed = mockJobs.has(jobId);
                mockJobs.delete(jobId);
                if (!existed) {
                    throw new Error(`Job ${jobId} not found`);
                }
            }),
            getJobs: vi.fn(async () => Array.from(mockJobs.values())),
            on: vi.fn(),
            _mockJobs: mockJobs,
        };
    });

    const Worker = vi.fn().mockImplementation(() => ({
        on: vi.fn(),
    }));

    return { Queue, Worker, Job: vi.fn() };
});

// Mock logger
vi.mock('../../utils/logger', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

// Mock email service
vi.mock('../../services/emailService', () => ({
    sendInterviewReminder: vi.fn(),
}));

describe('interviewReminderQueue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Clear mock jobs
        const queue = interviewReminderQueue as any;
        if (queue._mockJobs) {
            queue._mockJobs.clear();
        }
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('enqueueInterviewReminder', () => {
        it('should create a job with correct data and delay', async () => {
            const jobData: InterviewReminderJobData = {
                interviewId: 'int-123',
                applicationId: 'app-456',
                reminderType: '24h',
                recipientEmails: ['candidate@example.com', 'recruiter@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };
            const delayMs = 24 * 60 * 60 * 1000; // 24 hours

            const jobId = await enqueueInterviewReminder(jobData, delayMs);

            expect(jobId).toBe('int-123:24h');
            expect(interviewReminderQueue.add).toHaveBeenCalledWith(
                'interview-reminder-24h',
                jobData,
                {
                    jobId: 'int-123:24h',
                    delay: delayMs,
                }
            );
        });

        it('should create 1h reminder job', async () => {
            const jobData: InterviewReminderJobData = {
                interviewId: 'int-789',
                applicationId: 'app-999',
                reminderType: '1h',
                recipientEmails: ['candidate@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };
            const delayMs = 60 * 60 * 1000; // 1 hour

            const jobId = await enqueueInterviewReminder(jobData, delayMs);

            expect(jobId).toBe('int-789:1h');
            expect(interviewReminderQueue.add).toHaveBeenCalledWith(
                'interview-reminder-1h',
                jobData,
                {
                    jobId: 'int-789:1h',
                    delay: delayMs,
                }
            );
        });

        it('should handle negative delay by setting delay to 0', async () => {
            const jobData: InterviewReminderJobData = {
                interviewId: 'int-past',
                applicationId: 'app-past',
                reminderType: '24h',
                recipientEmails: ['test@example.com'],
                scheduledAt: '2026-07-20T10:00:00Z', // Past date
            };
            const delayMs = -5000; // Negative delay

            await enqueueInterviewReminder(jobData, delayMs);

            expect(interviewReminderQueue.add).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Object),
                expect.objectContaining({
                    delay: 0, // Should be clamped to 0
                })
            );
        });

        it('should generate deterministic job IDs for same interview', async () => {
            const jobData24h: InterviewReminderJobData = {
                interviewId: 'int-deterministic',
                applicationId: 'app-123',
                reminderType: '24h',
                recipientEmails: ['test@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };

            const jobData1h: InterviewReminderJobData = {
                ...jobData24h,
                reminderType: '1h',
            };

            const jobId24h = await enqueueInterviewReminder(jobData24h, 86400000);
            const jobId1h = await enqueueInterviewReminder(jobData1h, 3600000);

            expect(jobId24h).toBe('int-deterministic:24h');
            expect(jobId1h).toBe('int-deterministic:1h');
            expect(jobId24h).not.toBe(jobId1h);
        });

        it('should use correct job ID format', async () => {
            const jobData: InterviewReminderJobData = {
                interviewId: 'interview-abc-123',
                applicationId: 'app-xyz',
                reminderType: '24h',
                recipientEmails: ['test@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };

            const jobId = await enqueueInterviewReminder(jobData, 1000);

            // Job ID format should be: {interviewId}:{reminderType}
            expect(jobId).toMatch(/^interview-abc-123:(24h|1h)$/);
        });
    });

    describe('cancelInterviewReminders', () => {
        it('should remove both 24h and 1h reminder jobs', async () => {
            const interviewId = 'int-cancel-123';

            await cancelInterviewReminders(interviewId);

            expect(interviewReminderQueue.remove).toHaveBeenCalledTimes(2);
            expect(interviewReminderQueue.remove).toHaveBeenCalledWith(`${interviewId}:24h`);
            expect(interviewReminderQueue.remove).toHaveBeenCalledWith(`${interviewId}:1h`);
        });

        it('should not throw error if jobs do not exist', async () => {
            const interviewId = 'int-nonexistent';

            // Mock remove to throw error for non-existent jobs
            vi.mocked(interviewReminderQueue.remove).mockRejectedValue(
                new Error('Job not found')
            );

            // Should not throw
            await expect(cancelInterviewReminders(interviewId)).resolves.not.toThrow();
        });

        it('should handle partial cancellation (one job exists, one does not)', async () => {
            const interviewId = 'int-partial';

            // Mock: first call succeeds, second fails
            vi.mocked(interviewReminderQueue.remove)
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('Job not found'));

            // Should not throw
            await expect(cancelInterviewReminders(interviewId)).resolves.not.toThrow();

            expect(interviewReminderQueue.remove).toHaveBeenCalledTimes(2);
        });

        it('should call remove with correct job IDs for any interview ID format', async () => {
            const interviewIds = [
                'simple-id',
                'uuid-a1b2c3d4-e5f6-7890',
                'int_with_underscores',
                'int-with-dashes-123',
            ];

            for (const interviewId of interviewIds) {
                await cancelInterviewReminders(interviewId);

                expect(interviewReminderQueue.remove).toHaveBeenCalledWith(`${interviewId}:24h`);
                expect(interviewReminderQueue.remove).toHaveBeenCalledWith(`${interviewId}:1h`);
                
                vi.clearAllMocks();
            }
        });
    });

    describe('job ID generation', () => {
        it('should create unique job IDs for different interviews', async () => {
            const jobData1: InterviewReminderJobData = {
                interviewId: 'int-001',
                applicationId: 'app-001',
                reminderType: '24h',
                recipientEmails: ['test1@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };

            const jobData2: InterviewReminderJobData = {
                interviewId: 'int-002',
                applicationId: 'app-002',
                reminderType: '24h',
                recipientEmails: ['test2@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };

            const jobId1 = await enqueueInterviewReminder(jobData1, 1000);
            const jobId2 = await enqueueInterviewReminder(jobData2, 1000);

            expect(jobId1).not.toBe(jobId2);
            expect(jobId1).toBe('int-001:24h');
            expect(jobId2).toBe('int-002:24h');
        });

        it('should allow rescheduling by using same job ID', async () => {
            const jobData: InterviewReminderJobData = {
                interviewId: 'int-reschedule',
                applicationId: 'app-reschedule',
                reminderType: '24h',
                recipientEmails: ['test@example.com'],
                scheduledAt: '2026-07-27T10:00:00Z',
            };

            // First schedule
            const jobId1 = await enqueueInterviewReminder(jobData, 86400000);

            // Reschedule with same interview ID (BullMQ will replace the job)
            const jobDataRescheduled = {
                ...jobData,
                scheduledAt: '2026-07-28T10:00:00Z',
            };
            const jobId2 = await enqueueInterviewReminder(jobDataRescheduled, 86400000);

            expect(jobId1).toBe(jobId2);
            expect(jobId1).toBe('int-reschedule:24h');
        });
    });

    describe('queue configuration', () => {
        it('should have correct retry configuration', () => {
            const queue = interviewReminderQueue as any;
            const defaultOpts = queue.opts?.defaultJobOptions;

            expect(defaultOpts).toBeDefined();
            expect(defaultOpts.attempts).toBe(3);
            expect(defaultOpts.backoff).toEqual({
                type: 'exponential',
                delay: 5000,
            });
        });

        it('should have correct job retention policies', () => {
            const queue = interviewReminderQueue as any;
            const defaultOpts = queue.opts?.defaultJobOptions;

            expect(defaultOpts.removeOnComplete).toEqual({
                age: 86400, // 24 hours
                count: 500,
            });
            expect(defaultOpts.removeOnFail).toEqual({
                age: 604800, // 7 days
            });
        });
    });
});
