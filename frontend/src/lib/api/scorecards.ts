import {
    Scorecard,
    ScorecardValidation,
    RubricTemplate,
    CreateScorecardRequest,
    UpdateScorecardRequest,
} from '../../types/scorecard';

/**
 * Create a new draft scorecard for an interview stage
 */
export async function createScorecard(
    request: CreateScorecardRequest
): Promise<Scorecard> {
    const response = await fetch('/api/scorecards', {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to create scorecard';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Get a scorecard by ID
 */
export async function getScorecard(scorecardId: string): Promise<Scorecard> {
    const response = await fetch(`/api/scorecards/${scorecardId}`, {
        credentials: 'include',
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to fetch scorecard';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Update scorecard dimensions (partial save)
 */
export async function updateScorecard(
    scorecardId: string,
    request: UpdateScorecardRequest
): Promise<{ scorecard: Scorecard; validation: ScorecardValidation }> {
    const response = await fetch(`/api/scorecards/${scorecardId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to update scorecard';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Get scorecard validation status
 */
export async function getScorecardValidation(
    scorecardId: string
): Promise<ScorecardValidation> {
    const response = await fetch(`/api/scorecards/${scorecardId}/validation`, {
        credentials: 'include',
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to fetch validation';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Get rubric template for an interview stage type
 */
export async function getRubricTemplate(stageType: string): Promise<RubricTemplate> {
    const response = await fetch(`/api/scorecards/rubric/${stageType}`, {
        credentials: 'include',
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        const errorMessage = errorPayload?.error || 'Failed to fetch rubric template';
        throw new Error(errorMessage);
    }

    return response.json();
}

/**
 * Submit a completed scorecard (validates, locks, calculates aggregate)
 */
export async function submitScorecard(scorecardId: string): Promise<Scorecard> {
    const response = await fetch(`/api/scorecards/${scorecardId}/submit`, {
        method: 'POST',
        credentials: 'include',
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        
        // Handle validation errors specially
        if (response.status === 422 && errorPayload?.validation) {
            const error: any = new Error(errorPayload.error || 'Scorecard is incomplete');
            error.validation = errorPayload.validation;
            throw error;
        }
        
        const errorMessage = errorPayload?.error || 'Failed to submit scorecard';
        throw new Error(errorMessage);
    }

    return response.json();
}
