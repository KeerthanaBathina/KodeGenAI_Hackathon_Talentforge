import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { ScorecardForm } from '../ScorecardForm';
import * as scorecardsApi from '../../lib/api/scorecards';

// Mock the API module
vi.mock('../../lib/api/scorecards');

describe('ScorecardForm', () => {
    const mockScorecard = {
        id: 'scorecard-1',
        interviewStageId: 'stage-1',
        interviewerId: 'interviewer-1',
        status: 'draft' as const,
        recommendation: null,
        aggregateScore: null,
        submittedAt: null,
        createdAt: '2026-07-25T10:00:00Z',
        updatedAt: '2026-07-25T10:00:00Z',
        dimensions: [
            {
                id: 'dim-1',
                dimensionName: 'Problem Solving',
                score: null,
                notes: null,
                description: 'Ability to solve complex problems',
                displayOrder: 1,
            },
            {
                id: 'dim-2',
                dimensionName: 'Code Quality',
                score: null,
                notes: null,
                description: 'Quality of code written',
                displayOrder: 2,
            },
            {
                id: 'dim-3',
                dimensionName: 'Communication',
                score: null,
                notes: null,
                description: 'Ability to communicate effectively',
                displayOrder: 3,
            },
            {
                id: 'dim-4',
                dimensionName: 'System Design',
                score: null,
                notes: null,
                description: 'Understanding of system architecture',
                displayOrder: 4,
            },
        ],
    };

    const mockValidation = {
        isComplete: false,
        missingDimensions: ['Problem Solving', 'Code Quality', 'Communication', 'System Design'],
        hasRecommendation: false,
        completionPercentage: 0,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('displays rubric dimensions dynamically', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Problem Solving')).toBeInTheDocument();
        });

        expect(screen.getByText('Code Quality')).toBeInTheDocument();
        expect(screen.getByText('Communication')).toBeInTheDocument();
        expect(screen.getByText('System Design')).toBeInTheDocument();
        expect(screen.getByText('Ability to solve complex problems')).toBeInTheDocument();
    });

    it('has 1-5 Likert scale selector for each dimension', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Problem Solving')).toBeInTheDocument();
        });

        // Check that there are 5 radio buttons for each dimension (4 dimensions × 5 = 20 total)
        const radioButtons = screen.getAllByRole('radio');
        expect(radioButtons).toHaveLength(20);

        // Check labels are present
        expect(screen.getAllByText(/Poor \/ Below Expectations/i)).toHaveLength(4);
        expect(screen.getAllByText(/Excellent \/ Outstanding/i)).toHaveLength(4);
    });

    it('has optional notes field for each dimension', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Problem Solving')).toBeInTheDocument();
        });

        const textareas = screen.getAllByPlaceholderText(/Add any additional comments/i);
        expect(textareas).toHaveLength(4);
    });

    it('triggers auto-save on dimension score change', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);
        vi.mocked(scorecardsApi.updateScorecard).mockResolvedValue({
            scorecard: { ...mockScorecard, dimensions: [{ ...mockScorecard.dimensions[0], score: 4 }] },
            validation: { ...mockValidation, completionPercentage: 25, missingDimensions: ['Code Quality', 'Communication', 'System Design'] },
        });

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Problem Solving')).toBeInTheDocument();
        });

        // Select score 4 for Problem Solving
        const radioButtons = screen.getAllByRole('radio');
        const score4Button = radioButtons[3]; // 4th button (index 3) for first dimension
        fireEvent.click(score4Button);

        // Wait for debounced save (500ms)
        await waitFor(
            () => {
                expect(scorecardsApi.updateScorecard).toHaveBeenCalledWith('scorecard-1', {
                    dimensions: [
                        {
                            dimensionName: 'Problem Solving',
                            score: 4,
                            notes: undefined,
                        },
                    ],
                    recommendation: undefined,
                });
            },
            { timeout: 1000 }
        );
    });

    it('shows progress indicator with completion percentage', async () => {
        const partialValidation = {
            isComplete: false,
            missingDimensions: ['Communication', 'System Design'],
            hasRecommendation: false,
            completionPercentage: 50,
        };

        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(partialValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('50% Complete')).toBeInTheDocument();
        });

        expect(screen.getByText(/Missing: Communication, System Design/i)).toBeInTheDocument();
    });

    it('disables submit button until all dimensions scored', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Submit Scorecard')).toBeInTheDocument();
        });

        const submitButton = screen.getByText('Submit Scorecard');
        expect(submitButton).toBeDisabled();
    });

    it('enables submit button when all dimensions scored and recommendation selected', async () => {
        const completeValidation = {
            isComplete: true,
            missingDimensions: [],
            hasRecommendation: true,
            completionPercentage: 100,
        };

        const completeScorecard = {
            ...mockScorecard,
            recommendation: 'advance' as const,
            dimensions: mockScorecard.dimensions.map((d, i) => ({ ...d, score: i + 3 })),
        };

        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(completeScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(completeValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Submit Scorecard')).toBeInTheDocument();
        });

        const submitButton = screen.getByText('Submit Scorecard');
        expect(submitButton).not.toBeDisabled();
    });

    it('highlights missing dimensions when incomplete', async () => {
        const partialValidation = {
            isComplete: false,
            missingDimensions: ['System Design'],
            hasRecommendation: true,
            completionPercentage: 75,
        };

        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(partialValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText(/Missing: System Design/i)).toBeInTheDocument();
        });
    });

    it('displays read-only mode for submitted scorecards', async () => {
        const submittedScorecard = {
            ...mockScorecard,
            status: 'submitted' as const,
            recommendation: 'advance' as const,
            aggregateScore: 4.2,
            submittedAt: '2026-07-25T15:00:00Z',
            dimensions: mockScorecard.dimensions.map((d, i) => ({ ...d, score: i + 3 })),
        };

        vi.mocked(scorecardsApi.getScorecard).mockResolvedValue(submittedScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue({
            isComplete: true,
            missingDimensions: [],
            hasRecommendation: true,
            completionPercentage: 100,
        });

        render(<ScorecardForm interviewStageId="stage-1" scorecardId="scorecard-1" isReadOnly />);

        await waitFor(() => {
            expect(screen.getByText('Submitted')).toBeInTheDocument();
        });

        expect(screen.getByText(/Aggregate Score: 4\.2 \/ 5\.0/i)).toBeInTheDocument();
        expect(screen.getByText(/Submitted on/i)).toBeInTheDocument();

        // Check that inputs are disabled
        const radioButtons = screen.getAllByRole('radio');
        radioButtons.forEach((button) => {
            expect(button).toBeDisabled();
        });

        // Submit button should not be present
        expect(screen.queryByText('Submit Scorecard')).not.toBeInTheDocument();
    });

    it('shows validation warning when trying to submit incomplete scorecard', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Submit Scorecard')).toBeInTheDocument();
        });

        expect(
            screen.getByText(/Please score all dimensions and select a recommendation/i)
        ).toBeInTheDocument();
    });

    it('allows selecting recommendation', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);
        vi.mocked(scorecardsApi.updateScorecard).mockResolvedValue({
            scorecard: { ...mockScorecard, recommendation: 'advance' },
            validation: { ...mockValidation, hasRecommendation: true },
        });

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(screen.getByText('Advance to Next Stage')).toBeInTheDocument();
        });

        const advanceButton = screen.getByText('Advance to Next Stage');
        fireEvent.click(advanceButton);

        // Wait for debounced save
        await waitFor(
            () => {
                expect(scorecardsApi.updateScorecard).toHaveBeenCalledWith('scorecard-1', {
                    dimensions: [],
                    recommendation: 'advance',
                });
            },
            { timeout: 1000 }
        );
    });

    it('creates new scorecard if no scorecardId provided', async () => {
        vi.mocked(scorecardsApi.createScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" />);

        await waitFor(() => {
            expect(scorecardsApi.createScorecard).toHaveBeenCalledWith({
                interviewStageId: 'stage-1',
            });
        });
    });

    it('loads existing scorecard if scorecardId provided', async () => {
        vi.mocked(scorecardsApi.getScorecard).mockResolvedValue(mockScorecard);
        vi.mocked(scorecardsApi.getScorecardValidation).mockResolvedValue(mockValidation);

        render(<ScorecardForm interviewStageId="stage-1" scorecardId="scorecard-1" />);

        await waitFor(() => {
            expect(scorecardsApi.getScorecard).toHaveBeenCalledWith('scorecard-1');
        });
    });
});
