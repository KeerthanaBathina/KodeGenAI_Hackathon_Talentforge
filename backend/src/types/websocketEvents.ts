import type { InterviewStageType } from '@prisma/client';

/**
 * WebSocket event payload types for prerequisite completion events
 * 
 * These events notify clients in real-time when interview stages
 * or assessments are completed, allowing prerequisite checklists
 * to update without page refresh.
 */

/**
 * Event emitted when an interview stage is completed
 * 
 * Triggered when:
 * - A scorecard is submitted that completes all required scorecards for a stage
 * - The stage state transitions to 'completed'
 */
export interface StageCompletedPayload {
  /** Application ID for room-based broadcasting */
  applicationId: string;
  
  /** Unique ID of the completed stage */
  stageId: string;
  
  /** Type of interview stage (technical, hr, etc.) */
  stageType: InterviewStageType;
  
  /** Timestamp when the stage was marked complete */
  completedAt: Date;
  
  /** User ID of the interviewer who completed the final scorecard */
  completedBy: string;
}

/**
 * Event emitted when an assessment is completed
 * 
 * Triggered when:
 * - Assessment provider webhook indicates completion
 * - Assessment score is successfully ingested
 */
export interface AssessmentCompletedPayload {
  /** Application ID for room-based broadcasting */
  applicationId: string;
  
  /** Unique ID of the assessment session */
  assessmentId: string;
  
  /** Final assessment score */
  score: number;
  
  /** Timestamp when the assessment was completed */
  completedAt: Date;
}

/**
 * Type map for all prerequisite-related WebSocket events
 */
export type PrerequisiteWebSocketEvents = {
  'stage:completed': StageCompletedPayload;
  'assessment:completed': AssessmentCompletedPayload;
};
