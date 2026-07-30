'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './ScorecardForm.css';
import {
    Scorecard,
    DimensionScore,
    InterviewRecommendation,
    ScorecardValidation,
} from '../types/scorecard';
import {
    createScorecard,
    getScorecard,
    updateScorecard,
    getScorecardValidation,
    submitScorecard,
} from '../lib/api/scorecards';

interface ScorecardFormProps {
    interviewStageId: string;
    scorecardId?: string;
    isReadOnly?: boolean;
    onSubmitSuccess?: () => void;
}

// Debounce utility
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

const LIKERT_LABELS = {
    1: 'Poor / Below Expectations',
    2: 'Fair / Needs Improvement',
    3: 'Good / Meets Expectations',
    4: 'Very Good / Exceeds Expectations',
    5: 'Excellent / Outstanding',
};

export const ScorecardForm: React.FC<ScorecardFormProps> = ({
    interviewStageId,
    scorecardId: initialScorecardId,
    isReadOnly = false,
    onSubmitSuccess,
}) => {
    const [scorecardId, setScorecardId] = useState<string | undefined>(initialScorecardId);
    const [scorecard, setScorecard] = useState<Scorecard | null>(null);
    const [dimensions, setDimensions] = useState<DimensionScore[]>([]);
    const [recommendation, setRecommendation] = useState<InterviewRecommendation | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [validationState, setValidationState] = useState<ScorecardValidation>({
        isComplete: false,
        missingDimensions: [],
        hasRecommendation: false,
        completionPercentage: 0,
    });

    // Load or create scorecard on mount
    useEffect(() => {
        const initializeScorecard = async () => {
            try {
                setIsLoading(true);
                setError(null);

                let loadedScorecard: Scorecard;

                if (scorecardId) {
                    // Load existing scorecard
                    loadedScorecard = await getScorecard(scorecardId);
                } else {
                    // Create new draft scorecard
                    loadedScorecard = await createScorecard({ interviewStageId });
                    setScorecardId(loadedScorecard.id);
                }

                setScorecard(loadedScorecard);
                setDimensions(loadedScorecard.dimensions);
                setRecommendation(loadedScorecard.recommendation);

                // Load initial validation state
                const validation = await getScorecardValidation(loadedScorecard.id);
                setValidationState(validation);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load scorecard');
            } finally {
                setIsLoading(false);
            }
        };

        initializeScorecard();
    }, [interviewStageId, scorecardId]);

    // Debounced save function
    const debouncedSave = useMemo(
        () =>
            debounce(
                async (
                    updatedDimensions: DimensionScore[],
                    updatedRecommendation: InterviewRecommendation | null
                ) => {
                    if (!scorecardId) return;

                    setIsSaving(true);
                    setSaveError(null);

                    try {
                        // Only send dimensions that have scores
                        const dimensionsToSave = updatedDimensions
                            .filter((d) => d.score !== null)
                            .map((d) => ({
                                dimensionName: d.dimensionName,
                                score: d.score!,
                                notes: d.notes || undefined,
                            }));

                        const result = await updateScorecard(scorecardId, {
                            dimensions: dimensionsToSave,
                            recommendation: updatedRecommendation || undefined,
                        });

                        setScorecard(result.scorecard);
                        setValidationState(result.validation);
                    } catch (err) {
                        setSaveError(err instanceof Error ? err.message : 'Auto-save failed');
                    } finally {
                        setIsSaving(false);
                    }
                },
                500
            ),
        [scorecardId]
    );

    // Handle score change
    const handleScoreChange = useCallback(
        (dimensionName: string, score: number) => {
            const updated = dimensions.map((d) =>
                d.dimensionName === dimensionName ? { ...d, score } : d
            );
            setDimensions(updated);
            debouncedSave(updated, recommendation);
        },
        [dimensions, recommendation, debouncedSave]
    );

    // Handle notes change
    const handleNotesChange = useCallback(
        (dimensionName: string, notes: string) => {
            const updated = dimensions.map((d) =>
                d.dimensionName === dimensionName ? { ...d, notes } : d
            );
            setDimensions(updated);
            debouncedSave(updated, recommendation);
        },
        [dimensions, recommendation, debouncedSave]
    );

    // Handle recommendation change
    const handleRecommendationChange = useCallback(
        (newRecommendation: InterviewRecommendation) => {
            setRecommendation(newRecommendation);
            debouncedSave(dimensions, newRecommendation);
        },
        [dimensions, debouncedSave]
    );

    // Handle submit
    const handleSubmit = async () => {
        if (!validationState.isComplete || !scorecardId) return;

        // Show confirmation dialog
        const confirmed = window.confirm(
            'Are you sure you want to submit this scorecard? You will not be able to edit it after submission.'
        );

        if (!confirmed) return;

        setIsSubmitting(true);
        setError(null);

        try {
            // Submit the scorecard
            const result = await submitScorecard(scorecardId);

            // Update local state
            setScorecard(result);
            setDimensions(result.dimensions);
            setRecommendation(result.recommendation);

            // Call success callback if provided
            if (onSubmitSuccess) {
                onSubmitSuccess();
            }
        } catch (err: any) {
            // Handle validation errors
            if (err.validation) {
                setError(
                    `Cannot submit incomplete scorecard. Missing: ${err.validation.missingDimensions.join(', ')}`
                );
            } else {
                setError(err instanceof Error ? err.message : 'Failed to submit scorecard');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="scorecard-form loading">
                <div className="loading-spinner">Loading scorecard...</div>
            </div>
        );
    }

    if (error && !scorecard) {
        return (
            <div className="scorecard-form error">
                <div className="error-message">
                    <strong>Error:</strong> {error}
                </div>
            </div>
        );
    }

    return (
        <div className="scorecard-form">
            {/* Read-only header for submitted scorecards */}
            {isReadOnly && scorecard && (
                <div className="scorecard-header">
                    <span className="status-badge submitted">Submitted</span>
                    {scorecard.aggregateScore && (
                        <span className="aggregate-score">
                            Aggregate Score: {scorecard.aggregateScore.toFixed(1)} / 5.0
                        </span>
                    )}
                    {scorecard.submittedAt && (
                        <span className="submitted-at">
                            Submitted on {new Date(scorecard.submittedAt).toLocaleDateString()}
                        </span>
                    )}
                </div>
            )}

            {/* Save indicator */}
            {!isReadOnly && (
                <div className="save-indicator">
                    {isSaving && <span className="saving">Saving...</span>}
                    {!isSaving && !saveError && <span className="saved">✓ Saved</span>}
                    {saveError && <span className="save-error">⚠ {saveError}</span>}
                </div>
            )}

            {/* Progress indicator */}
            {!isReadOnly && (
                <div className="progress-indicator">
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${validationState.completionPercentage}%` }}
                        />
                    </div>
                    <div className="progress-text">
                        <span className="percentage">
                            {validationState.completionPercentage}% Complete
                        </span>
                        {validationState.missingDimensions.length > 0 && (
                            <span className="missing-dimensions">
                                Missing: {validationState.missingDimensions.join(', ')}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Dimensions */}
            <div className="dimensions-list">
                {dimensions.map((dimension, index) => (
                    <div key={dimension.dimensionName} className="dimension-card">
                        <div className="dimension-header">
                            <h3 className="dimension-name">
                                {dimension.dimensionName}
                                {dimension.score !== null && (
                                    <span className="scored-indicator" aria-label="Scored">
                                        ✓
                                    </span>
                                )}
                            </h3>
                        </div>

                        {dimension.description && (
                            <p className="dimension-description">{dimension.description}</p>
                        )}

                        {/* Likert scale */}
                        <div className="likert-scale">
                            {[1, 2, 3, 4, 5].map((value) => (
                                <label
                                    key={value}
                                    className={`likert-option ${
                                        dimension.score === value ? 'selected' : ''
                                    }`}
                                    title={LIKERT_LABELS[value as keyof typeof LIKERT_LABELS]}
                                >
                                    <input
                                        type="radio"
                                        name={`dimension-${dimension.dimensionName}`}
                                        value={value}
                                        checked={dimension.score === value}
                                        onChange={() => handleScoreChange(dimension.dimensionName, value)}
                                        disabled={isReadOnly}
                                    />
                                    <span className="likert-value">{value}</span>
                                    <span className="likert-label">
                                        {LIKERT_LABELS[value as keyof typeof LIKERT_LABELS]}
                                    </span>
                                </label>
                            ))}
                        </div>

                        {/* Notes */}
                        <div className="dimension-notes">
                            <label htmlFor={`notes-${dimension.dimensionName}`}>
                                Optional Notes:
                            </label>
                            <textarea
                                id={`notes-${dimension.dimensionName}`}
                                placeholder="Add any additional comments or observations..."
                                value={dimension.notes || ''}
                                onChange={(e) =>
                                    handleNotesChange(dimension.dimensionName, e.target.value)
                                }
                                disabled={isReadOnly}
                                rows={3}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Recommendation section */}
            <div className="recommendation-section">
                <h3 className="recommendation-title">Overall Recommendation</h3>
                <div className="recommendation-buttons">
                    <button
                        type="button"
                        className={`recommendation-button advance ${
                            recommendation === 'advance' ? 'selected' : ''
                        }`}
                        onClick={() => handleRecommendationChange('advance')}
                        disabled={isReadOnly}
                    >
                        <span className="icon">✓</span>
                        <span className="label">Advance to Next Stage</span>
                    </button>
                    <button
                        type="button"
                        className={`recommendation-button hold ${
                            recommendation === 'hold' ? 'selected' : ''
                        }`}
                        onClick={() => handleRecommendationChange('hold')}
                        disabled={isReadOnly}
                    >
                        <span className="icon">⏸</span>
                        <span className="label">Hold (Additional Review Needed)</span>
                    </button>
                    <button
                        type="button"
                        className={`recommendation-button reject ${
                            recommendation === 'reject' ? 'selected' : ''
                        }`}
                        onClick={() => handleRecommendationChange('reject')}
                        disabled={isReadOnly}
                    >
                        <span className="icon">✗</span>
                        <span className="label">Reject</span>
                    </button>
                </div>
            </div>

            {/* Validation error */}
            {!validationState.isComplete && !isReadOnly && (
                <div className="validation-warning">
                    Please score all dimensions and select a recommendation before submitting.
                </div>
            )}

            {/* Submit button */}
            {!isReadOnly && (
                <div className="form-actions">
                    <button
                        type="button"
                        className="submit-button"
                        onClick={handleSubmit}
                        disabled={!validationState.isComplete || isSubmitting}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Scorecard'}
                    </button>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="error-message">
                    <strong>Error:</strong> {error}
                </div>
            )}
        </div>
    );
};
