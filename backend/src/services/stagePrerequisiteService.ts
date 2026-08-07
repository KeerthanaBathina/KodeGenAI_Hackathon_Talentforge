import { InterviewStageType, ApplicationPath } from '@prisma/client';
import { prisma } from '../db/prisma';

export interface StagePrerequisite {
    stage: InterviewStageType;
    prerequisiteStages: InterviewStageType[];
}

export interface PrerequisiteCheckResult {
    canSchedule: boolean;
    missingStages: InterviewStageType[];
    reason?: string;
}

export interface StageStatus {
    stage: InterviewStageType;
    status: 'completed' | 'available' | 'locked' | 'not_applicable';
    prerequisites: InterviewStageType[];
    missingPrerequisites: InterviewStageType[];
}

// Path-specific stage sequences
export const pathStageSequences: Record<ApplicationPath, StagePrerequisite[]> = {
    fresher: [
        { stage: 'aptitude', prerequisiteStages: [] },
        { stage: 'coding', prerequisiteStages: ['aptitude'] },
        { stage: 'technical', prerequisiteStages: ['aptitude', 'coding'] },
        { stage: 'hr', prerequisiteStages: ['aptitude', 'coding', 'technical'] },
    ],
    experienced: [
        { stage: 'technical', prerequisiteStages: [] },
        { stage: 'hr', prerequisiteStages: ['technical'] },
    ],
};

/**
 * Get the stage sequence for a given path
 */
export function getStageSequence(path: ApplicationPath): StagePrerequisite[] {
    return pathStageSequences[path];
}

/**
 * Check if a stage can be scheduled for an application
 */
export async function canScheduleStage(
    applicationId: string,
    requestedStage: InterviewStageType
): Promise<PrerequisiteCheckResult> {
    // Get application and its path
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
            interviewStages: {
                where: { state: 'completed' },
                select: { type: true },
            },
        },
    });

    if (!application) {
        throw new Error(`Application ${applicationId} not found`);
    }

    const path = application.path as ApplicationPath;
    const stageSequence = getStageSequence(path);

    // Find prerequisites for requested stage
    const stageConfig = stageSequence.find((s) => s.stage === requestedStage);

    if (!stageConfig) {
        return {
            canSchedule: false,
            missingStages: [],
            reason: `Stage ${requestedStage} is not part of ${path} path`,
        };
    }

    // Check if all prerequisites are completed
    const completedStages = new Set(
        application.interviewStages.map((stage) => stage.type)
    );

    const missingStages = stageConfig.prerequisiteStages.filter(
        (prereq) => !completedStages.has(prereq)
    );

    if (missingStages.length > 0) {
        const missingStageNames = missingStages.join(', ');
        return {
            canSchedule: false,
            missingStages,
            reason: `Prerequisites not met: ${missingStageNames} must be completed before scheduling ${requestedStage}`,
        };
    }

    return {
        canSchedule: true,
        missingStages: [],
    };
}

/**
 * Get all available stages for an application (prerequisites met)
 */
export async function getAvailableStages(
    applicationId: string
): Promise<InterviewStageType[]> {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
            path: true,
            interviewStages: {
                select: { type: true, state: true },
            },
        },
    });

    if (!application) {
        throw new Error(`Application ${applicationId} not found`);
    }

    const path = application.path as ApplicationPath;
    const stageSequence = getStageSequence(path);

    const completedStages = new Set(
        application.interviewStages
            .filter((stage) => stage.state === 'completed')
            .map((stage) => stage.type)
    );

    const scheduledStages = new Set(
        application.interviewStages.map((stage) => stage.type)
    );

    // Return stages where prerequisites are met and not yet scheduled
    return stageSequence
        .filter((stageConfig) => {
            // Skip if already scheduled
            if (scheduledStages.has(stageConfig.stage)) {
                return false;
            }

            // Check if all prerequisites are completed
            return stageConfig.prerequisiteStages.every((prereq) =>
                completedStages.has(prereq)
            );
        })
        .map((stageConfig) => stageConfig.stage);
}

/**
 * Get status of all stages for an application
 */
export async function getApplicationStageStatus(
    applicationId: string
): Promise<StageStatus[]> {
    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
            interviewStages: {
                select: { type: true, state: true },
            },
        },
    });

    if (!application) {
        throw new Error(`Application ${applicationId} not found`);
    }

    const path = application.path as ApplicationPath;
    const stageSequence = getStageSequence(path);

    const completedStages = new Set(
        application.interviewStages
            .filter((stage) => stage.state === 'completed')
            .map((stage) => stage.type)
    );

    const scheduledStages = new Set(
        application.interviewStages.map((stage) => stage.type)
    );

    return stageSequence.map((stageConfig) => {
        if (completedStages.has(stageConfig.stage)) {
            return {
                stage: stageConfig.stage,
                status: 'completed' as const,
                prerequisites: stageConfig.prerequisiteStages,
                missingPrerequisites: [],
            };
        }

        const missingPrereqs = stageConfig.prerequisiteStages.filter(
            (prereq) => !completedStages.has(prereq)
        );

        if (missingPrereqs.length > 0) {
            return {
                stage: stageConfig.stage,
                status: 'locked' as const,
                prerequisites: stageConfig.prerequisiteStages,
                missingPrerequisites: missingPrereqs,
            };
        }

        if (scheduledStages.has(stageConfig.stage)) {
            return {
                stage: stageConfig.stage,
                status: 'available' as const, // Scheduled but not completed
                prerequisites: stageConfig.prerequisiteStages,
                missingPrerequisites: [],
            };
        }

        return {
            stage: stageConfig.stage,
            status: 'available' as const,
            prerequisites: stageConfig.prerequisiteStages,
            missingPrerequisites: [],
        };
    });
}
