/**
 * API client for prerequisite validation
 * 
 * Handles fetching prerequisite completion status for applications.
 */

export interface PrerequisiteStatus {
  isComplete: boolean;
  items: PrerequisiteItem[];
}

export interface PrerequisiteItem {
  id: string;
  type: 'interview_stage' | 'assessment';
  label: string;
  status: 'completed' | 'pending';
  scheduledDate?: string;
}

export class PrerequisiteError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'PrerequisiteError';
  }
}

/**
 * Fetch prerequisite completion status for an application
 * 
 * @param applicationId - UUID of the application
 * @returns Prerequisite status with list of items
 * @throws PrerequisiteError if fetch fails
 */
export async function fetchPrerequisites(
  applicationId: string
): Promise<PrerequisiteStatus> {
  const response = await fetch(
    `/api/applications/${applicationId}/prerequisites`,
    {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new PrerequisiteError('Application not found', 404);
    }
    
    if (response.status === 401) {
      throw new PrerequisiteError('Authentication required', 401);
    }
    
    if (response.status === 403) {
      throw new PrerequisiteError('Access denied', 403);
    }
    
    throw new PrerequisiteError(
      'Failed to fetch prerequisites',
      response.status
    );
  }

  return response.json();
}

/**
 * Transform backend prerequisite result to frontend format
 * 
 * Converts the backend PrerequisiteCheckResult to the frontend PrerequisiteStatus format
 * with structured items for display.
 * 
 * @param backendResult - Raw result from backend API
 * @returns Transformed status for frontend consumption
 */
export function transformPrerequisiteResult(backendResult: any): PrerequisiteStatus {
  const items: PrerequisiteItem[] = [];
  
  // Add incomplete stages
  if (backendResult.incompleteStages && Array.isArray(backendResult.incompleteStages)) {
    backendResult.incompleteStages.forEach((stage: any) => {
      items.push({
        id: stage.id,
        type: 'interview_stage',
        label: formatStageLabel(stage.type),
        status: 'pending',
        scheduledDate: stage.scheduledDate
      });
    });
  }
  
  // Add missing assessment
  if (backendResult.missingAssessment) {
    items.push({
      id: 'assessment',
      type: 'assessment',
      label: 'Technical Assessment',
      status: 'pending'
    });
  }
  
  return {
    isComplete: backendResult.isComplete ?? false,
    items
  };
}

/**
 * Format interview stage type as human-readable label
 */
function formatStageLabel(type: string): string {
  const labels: Record<string, string> = {
    hr: 'HR Interview',
    technical: 'Technical Interview',
    coding: 'Coding Interview',
    behavioral: 'Behavioral Interview',
    aptitude: 'Aptitude Assessment',
    panel: 'Panel Interview',
    final: 'Final Interview'
  };
  
  return labels[type] || `${type.charAt(0).toUpperCase()}${type.slice(1)} Interview`;
}
