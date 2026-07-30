import type { InterviewStageType, InterviewStageState } from '@prisma/client';

/**
 * Result of prerequisite validation check
 * 
 * Indicates whether all required prerequisites are complete for making a hiring decision.
 * Provides detailed breakdown of incomplete items for user feedback.
 */
export interface PrerequisiteCheckResult {
  /** Whether all prerequisites are complete */
  isComplete: boolean;
  
  /** List of incomplete interview stages */
  incompleteStages: IncompleteStage[];
  
  /** Whether assessment score is missing */
  missingAssessment: boolean;
  
  /** Human-readable message describing the validation result */
  message?: string;
}

/**
 * Details about an incomplete interview stage
 */
export interface IncompleteStage {
  /** Stage unique identifier */
  id: string;
  
  /** Type of interview stage */
  type: InterviewStageType;
  
  /** Current state of the stage */
  state: InterviewStageState;
  
  /** Scheduled date/time (if applicable) */
  scheduledDate?: Date;
  
  /** Whether the stage has any submitted scorecards */
  hasScorecards: boolean;
}

/**
 * Configuration for prerequisite validation requirements
 */
export interface RequiredPrerequisites {
  /** Whether all interview stages must be completed */
  requireAllInterviewStages: boolean;
  
  /** Whether assessment score is required */
  requireAssessment: boolean;
  
  /** Optional: specific stage types required (if not all) */
  requiredStageTypes?: InterviewStageType[];
}
