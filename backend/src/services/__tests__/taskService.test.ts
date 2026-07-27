import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createReminderTask } from '../taskService';
import type { CreateReminderTaskParams } from '../taskService';

// Mock dependencies
vi.mock('../../db/prisma', () => ({
  default: {
    task: {
      create: vi.fn()
    }
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}));

import prisma from '../../db/prisma';
import logger from '../../utils/logger';

describe('taskService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createReminderTask', () => {
    const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
    const mockApplicationId = '650e8400-e29b-41d4-a716-446655440001';
    const mockDueDate = new Date('2026-08-15T10:00:00Z');

    const baseParams: CreateReminderTaskParams = {
      assignedTo: mockUserId,
      title: 'Review held application',
      description: 'Application was placed on hold. Please review and take action.',
      dueDate: mockDueDate,
      entityType: 'application',
      entityId: mockApplicationId
    };

    it('should create a reminder task with default priority and status', async () => {
      vi.mocked(prisma.task.create).mockResolvedValue({
        id: 'task-id-123',
        assignedTo: mockUserId,
        title: baseParams.title,
        description: baseParams.description,
        dueDate: mockDueDate,
        status: 'pending',
        priority: 'normal',
        entityType: 'application',
        entityId: mockApplicationId,
        metadata: {},
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      await createReminderTask(baseParams);

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: {
          assignedTo: mockUserId,
          title: baseParams.title,
          description: baseParams.description,
          dueDate: mockDueDate,
          status: 'pending',
          priority: 'normal',
          entityType: 'application',
          entityId: mockApplicationId,
          metadata: {}
        }
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Reminder task created successfully',
        expect.objectContaining({
          assignedTo: mockUserId,
          entityId: mockApplicationId,
          dueDate: mockDueDate
        })
      );
    });

    it('should create a reminder task with custom metadata', async () => {
      const metadata = { decisionId: 'decision-123', holdReason: 'reason-456' };
      const paramsWithMetadata = { ...baseParams, metadata };

      vi.mocked(prisma.task.create).mockResolvedValue({
        id: 'task-id-123',
        ...paramsWithMetadata,
        status: 'pending',
        priority: 'normal',
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any);

      await createReminderTask(paramsWithMetadata);

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metadata
        })
      });
    });

    it('should log debug information before creating task', async () => {
      vi.mocked(prisma.task.create).mockResolvedValue({} as any);

      await createReminderTask(baseParams);

      expect(logger.debug).toHaveBeenCalledWith(
        'Creating reminder task',
        expect.objectContaining({
          assignedTo: mockUserId,
          entityType: 'application',
          entityId: mockApplicationId,
          dueDate: mockDueDate
        })
      );
    });

    it('should log error and throw when task creation fails', async () => {
      const dbError = new Error('Database connection failed');
      vi.mocked(prisma.task.create).mockRejectedValue(dbError);

      await expect(createReminderTask(baseParams)).rejects.toThrow(
        'Database connection failed'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error creating reminder task',
        expect.objectContaining({
          assignedTo: mockUserId,
          entityId: mockApplicationId,
          error: 'Database connection failed'
        })
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      vi.mocked(prisma.task.create).mockRejectedValue('String error');

      await expect(createReminderTask(baseParams)).rejects.toEqual('String error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error creating reminder task',
        expect.objectContaining({
          error: 'Unknown error'
        })
      );
    });
  });
});
