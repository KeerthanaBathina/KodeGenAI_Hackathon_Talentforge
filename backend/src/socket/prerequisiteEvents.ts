/**
 * WebSocket Event Emitter for Prerequisite Completion
 * 
 * Emits real-time events when interview stages or assessments are completed,
 * allowing hiring managers to see prerequisite status updates without refresh.
 * 
 * Events are scoped to application-specific rooms for targeted delivery.
 */

import { getSocketServer } from '.';
import logger from '../utils/logger';
import type { StageCompletedPayload, AssessmentCompletedPayload } from '../types/websocketEvents';

/**
 * Emit event when an interview stage is completed
 * 
 * Broadcasts to all clients in the application room:
 * - Hiring managers viewing the decision panel
 * - Recruiters tracking application progress
 * - Any other users monitoring this application
 * 
 * @param payload - Stage completion details
 * 
 * @example
 * await emitStageCompleted({
 *   applicationId: 'app-123',
 *   stageId: 'stage-1',
 *   stageType: 'technical',
 *   completedAt: new Date(),
 *   completedBy: 'user-interviewer-1'
 * });
 */
export async function emitStageCompleted(
  payload: StageCompletedPayload
): Promise<void> {
  try {
    const io = getSocketServer();
    const room = `application:${payload.applicationId}`;
    
    // Broadcast to all clients in the application room
    io.to(room).emit('stage:completed', {
      ...payload,
      // Ensure Date is serialized to ISO string
      completedAt: payload.completedAt.toISOString()
    });
    
    logger.info('WebSocket event emitted', {
      event: 'stage:completed',
      applicationId: payload.applicationId,
      stageId: payload.stageId,
      stageType: payload.stageType,
      room
    });
  } catch (error) {
    // Log error but don't throw - WebSocket failures shouldn't break the main flow
    logger.error(
      { err: error, payload },
      'Failed to emit stage:completed WebSocket event'
    );
  }
}

/**
 * Emit event when an assessment is completed
 * 
 * Broadcasts to all clients in the application room when assessment
 * score is successfully ingested from provider webhook.
 * 
 * @param payload - Assessment completion details
 * 
 * @example
 * await emitAssessmentCompleted({
 *   applicationId: 'app-123',
 *   assessmentId: 'assessment-1',
 *   score: 85.5,
 *   completedAt: new Date()
 * });
 */
export async function emitAssessmentCompleted(
  payload: AssessmentCompletedPayload
): Promise<void> {
  try {
    const io = getSocketServer();
    const room = `application:${payload.applicationId}`;
    
    // Broadcast to all clients in the application room
    io.to(room).emit('assessment:completed', {
      ...payload,
      // Ensure Date is serialized to ISO string
      completedAt: payload.completedAt.toISOString()
    });
    
    logger.info('WebSocket event emitted', {
      event: 'assessment:completed',
      applicationId: payload.applicationId,
      assessmentId: payload.assessmentId,
      score: payload.score,
      room
    });
  } catch (error) {
    // Log error but don't throw - WebSocket failures shouldn't break the main flow
    logger.error(
      { err: error, payload },
      'Failed to emit assessment:completed WebSocket event'
    );
  }
}

/**
 * Helper to check if Socket.IO server is initialized
 * Useful for conditional event emission in tests or startup scenarios
 */
export function isSocketServerReady(): boolean {
  try {
    getSocketServer();
    return true;
  } catch {
    return false;
  }
}
