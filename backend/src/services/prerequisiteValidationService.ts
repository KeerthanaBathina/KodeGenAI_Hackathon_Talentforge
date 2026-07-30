import prisma from '../db/prisma';
import logger from '../utils/logger';
import type { InterviewStage, AssessmentSession } from '@prisma/client';
import type {
  PrerequisiteCheckResult,
  IncompleteStage,
  RequiredPrerequisites
} from '../types/prerequisiteValidation';

/**
 * Custom error for application not found scenarios
 */
export class ApplicationNotFoundError extends Error {
  constructor(applicationId: string) {
    super(`Application not found: ${applicationId}`);
    this.name = 'ApplicationNotFoundError';
  }
}

/**
 * Default prerequisite requirements
 * - All interview stages must be completed
 * - Assessment score must be present
 */
const DEFAULT_REQUIREMENTS: RequiredPrerequisites = {
  requireAllInterviewStages: true,
  requireAssessment: true
};

/**
 * Check if all prerequisites are complete for making a hiring decision
 * 
 * Validates that:
 * 1. All required interview stages are in 'completed' state
 * 2. Assessment session exists with a score
 * 
 * @param applicationId - UUID of the application to check
 * @param requirements - Optional custom requirements (defaults to all stages + assessment)
 * @returns Detailed validation result with breakdown of missing items
 * @throws ApplicationNotFoundError if application doesn't exist
 */
export async function checkPrerequisites(
  applicationId: string,
  requirements: RequiredPrerequisites = DEFAULT_REQUIREMENTS
): Promise<PrerequisiteCheckResult> {
  try {
    logger.debug('Checking prerequisites for application', { 
      applicationId, 
      requirements 
    });

    // Verify application exists
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true }
    });

    if (!application) {
      throw new ApplicationNotFoundError(applicationId);
    }

    // Get interview stage completion status
    const stages = await getInterviewStageCompletion(applicationId);
    
    // Validate stages based on requirements
    const incompleteStages = requirements.requireAllInterviewStages
      ? validateAllStagesComplete(stages, requirements.requiredStageTypes)
      : [];

    // Check assessment completion
    const missingAssessment = requirements.requireAssessment
      ? !(await hasAssessmentScore(applicationId))
      : false;

    // Build result
    const isComplete = incompleteStages.length === 0 && !missingAssessment;
    const message = buildMessage(isComplete, incompleteStages, missingAssessment);

    const result: PrerequisiteCheckResult = {
      isComplete,
      incompleteStages,
      missingAssessment,
      message
    };

    // Log validation result
    logger.info('Prerequisite validation completed', {
      applicationId,
      isComplete,
      incompleteStageCount: incompleteStages.length,
      missingAssessment
    });

    return result;

  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      throw error;
    }

    logger.error({ err: error, applicationId }, 'Failed to check prerequisites');
    throw error;
  }
}

/**
 * Fetch all interview stages for an application with scorecard data
 * 
 * @param applicationId - UUID of the application
 * @returns Array of interview stages with scorecards
 */
export async function getInterviewStageCompletion(
  applicationId: string
): Promise<InterviewStage[]> {
  const stages = await prisma.interviewStage.findMany({
    where: { applicationId },
    include: {
      scorecards: {
        select: { 
          id: true, 
          recommendation: true 
        }
      }
    },
    orderBy: { scheduledAt: 'asc' }
  });

  return stages as InterviewStage[];
}

/**
 * Check if assessment session has a completed score
 * 
 * @param applicationId - UUID of the application
 * @returns true if completed assessment with score exists
 */
export async function hasAssessmentScore(
  applicationId: string
): Promise<boolean> {
  const assessment = await prisma.assessmentSession.findFirst({
    where: {
      applicationId,
      status: 'completed',
      score: { not: null }
    },
    select: { id: true }
  });

  return assessment !== null;
}

/**
 * Validate that all stages (or specific required types) are complete
 * 
 * A stage is considered complete if its state is 'completed'.
 * Cancelled and no_show stages are excluded from validation.
 * 
 * @param stages - Array of interview stages to validate
 * @param requiredTypes - Optional array of specific stage types to require
 * @returns Array of incomplete stages
 */
export function validateAllStagesComplete(
  stages: InterviewStage[],
  requiredTypes?: string[]
): IncompleteStage[] {
  // Filter out cancelled and no_show stages
  const validStages = stages.filter(
    stage => stage.state !== 'cancelled' && stage.state !== 'no_show'
  );

  // If no stages configured, consider complete
  if (validStages.length === 0) {
    return [];
  }

  // Filter by required types if specified
  const stagesToCheck = requiredTypes && requiredTypes.length > 0
    ? validStages.filter(stage => requiredTypes.includes(stage.type))
    : validStages;

  // Find incomplete stages
  const incomplete = stagesToCheck
    .filter(stage => stage.state !== 'completed')
    .map(stage => ({
      id: stage.id,
      type: stage.type,
      state: stage.state,
      scheduledDate: stage.scheduledAt || undefined,
      hasScorecards: (stage as any).scorecards?.length > 0
    }));

  return incomplete;
}

/**
 * Build human-readable message for validation result
 * 
 * @param isComplete - Whether all prerequisites are complete
 * @param incompleteStages - Array of incomplete stages
 * @param missingAssessment - Whether assessment is missing
 * @returns Descriptive message
 */
function buildMessage(
  isComplete: boolean,
  incompleteStages: IncompleteStage[],
  missingAssessment: boolean
): string {
  if (isComplete) {
    return 'All prerequisites complete';
  }

  const missingItems: string[] = [];

  // Add incomplete stages
  incompleteStages.forEach(stage => {
    const stateLabel = stage.state === 'scheduled' ? 'scheduled' : 'in progress';
    missingItems.push(`${formatStageType(stage.type)} Interview (${stateLabel})`);
  });

  // Add assessment if missing
  if (missingAssessment) {
    missingItems.push('Assessment Score');
  }

  return `Missing: ${missingItems.join(', ')}`;
}

/**
 * Format stage type for display
 */
function formatStageType(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
