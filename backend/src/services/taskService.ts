import prisma from '../db/prisma';
import logger from '../utils/logger';

export interface CreateReminderTaskParams {
  assignedTo: string;
  title: string;
  description: string;
  dueDate: Date;
  entityType: string;
  entityId: string;
  metadata?: Record<string, any>;
}

/**
 * Create a reminder task
 * 
 * Creates a task record assigned to a specific user with a due date.
 * Used for follow-ups like reviewing held applications.
 * 
 * @param params - Task creation parameters
 */
export async function createReminderTask(
  params: CreateReminderTaskParams
): Promise<void> {
  try {
    logger.debug('Creating reminder task', {
      assignedTo: params.assignedTo,
      entityType: params.entityType,
      entityId: params.entityId,
      dueDate: params.dueDate
    });

    await prisma.task.create({
      data: {
        assignedTo: params.assignedTo,
        title: params.title,
        description: params.description,
        dueDate: params.dueDate,
        status: 'pending',
        priority: 'normal',
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: params.metadata || {}
      }
    });

    logger.info('Reminder task created successfully', {
      assignedTo: params.assignedTo,
      entityId: params.entityId,
      dueDate: params.dueDate
    });
  } catch (error) {
    logger.error('Error creating reminder task', {
      assignedTo: params.assignedTo,
      entityId: params.entityId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
