import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { StageGateScheduler } from '../StageGateScheduler';
import * as api from '@/lib/api/interviews';

vi.mock('@/lib/api/interviews');

describe('StageGateScheduler', () => {
    const mockStageStatus = [
        {
            stage: 'aptitude',
            status: 'completed' as const,
            prerequisites: [],
            missingPrerequisites: [],
        },
        {
            stage: 'technical',
            status: 'available' as const,
            prerequisites: ['aptitude'],
            missingPrerequisites: [],
        },
        {
            stage: 'cultural',
            status: 'locked' as const,
            prerequisites: ['aptitude', 'technical'],
            missingPrerequisites: ['technical'],
        },
    ];

    beforeEach(() => {
        vi.mocked(api.getApplicationStageStatus).mockResolvedValue(mockStageStatus);
    });

    it('should show completed stage with checkmark', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/Aptitude ✓ Completed/i)).toBeInTheDocument();
        });
    });

    it('should enable available stages', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            const technicalBtn = screen.getByRole('button', { name: /Schedule Technical/i });
            expect(technicalBtn).not.toBeDisabled();
        });
    });

    it('should disable locked stages with tooltip', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            const culturalBtn = screen.getByRole('button', { name: /before scheduling Cultural/i });
            expect(culturalBtn).toBeDisabled();
            expect(culturalBtn).toHaveAttribute(
                'title',
                expect.stringContaining('before scheduling')
            );
        });
    });

    it('should show fresher path with 3 stages', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/Fresher Path/i)).toBeInTheDocument();
            // Verify all three stages appear in the document (use getAllByText since they appear in multiple places)
            expect(screen.getAllByText(/Aptitude/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Technical/).length).toBeGreaterThan(0);
            expect(screen.getAllByText(/Cultural Fit/).length).toBeGreaterThan(0);
        });
    });

    it('should show experienced path without aptitude', async () => {
        const experiencedStages = [
            { stage: 'technical', status: 'available' as const, prerequisites: [], missingPrerequisites: [] },
            { stage: 'system_design', status: 'locked' as const, prerequisites: ['technical'], missingPrerequisites: ['technical'] },
            { stage: 'cultural', status: 'locked' as const, prerequisites: ['technical', 'system_design'], missingPrerequisites: ['technical', 'system_design'] },
        ];
        vi.mocked(api.getApplicationStageStatus).mockResolvedValue(experiencedStages);

        render(
            <StageGateScheduler
                applicationId="app-456"
                applicationPath="experienced"
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/Experienced Path/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Aptitude/i })).not.toBeInTheDocument();
            expect(screen.getAllByText(/System Design/i).length).toBeGreaterThan(0);
        });
    });

    it('should call onSchedule callback when available stage is clicked', async () => {
        const onScheduleMock = vi.fn();
        const user = userEvent.setup();

        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
                onSchedule={onScheduleMock}
            />
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Schedule Technical/i })).toBeInTheDocument();
        });

        const technicalBtn = screen.getByRole('button', { name: /Schedule Technical/i });
        await user.click(technicalBtn);

        expect(onScheduleMock).toHaveBeenCalledWith('technical');
    });

    it('should show loading state initially', () => {
        vi.mocked(api.getApplicationStageStatus).mockReturnValue(new Promise(() => {}));

        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        expect(screen.getByText(/Loading stage information/i)).toBeInTheDocument();
    });

    it('should handle API error gracefully', async () => {
        vi.mocked(api.getApplicationStageStatus).mockRejectedValue(new Error('API Error'));
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to load stage status:',
                expect.any(Error)
            );
        });

        consoleErrorSpy.mockRestore();
    });

    it('should show stage progression indicator', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Aptitude')).toBeInTheDocument();
            expect(screen.getByText('Technical')).toBeInTheDocument();
            expect(screen.getByText('Cultural Fit')).toBeInTheDocument();
        });
    });

    it('should filter out not_applicable stages from path display', async () => {
        const stagesWithNA = [
            { stage: 'aptitude', status: 'not_applicable' as const, prerequisites: [], missingPrerequisites: [] },
            { stage: 'technical', status: 'available' as const, prerequisites: [], missingPrerequisites: [] },
            { stage: 'cultural', status: 'locked' as const, prerequisites: ['technical'], missingPrerequisites: ['technical'] },
        ];
        vi.mocked(api.getApplicationStageStatus).mockResolvedValue(stagesWithNA);

        render(
            <StageGateScheduler
                applicationId="app-456"
                applicationPath="experienced"
            />
        );

        await waitFor(() => {
            // Verify Technical and Cultural appear, but not Aptitude button
            expect(screen.getByRole('button', { name: /Schedule Technical/i })).toBeInTheDocument();
            // Cultural will have lock emoji in button text
            expect(screen.getByRole('button', { name: /before scheduling Cultural/i })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /Aptitude/i })).not.toBeInTheDocument();
        });
    });

    it('should disable completed stages', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            const aptitudeBtn = screen.getByRole('button', { name: /stage has been completed/i });
            expect(aptitudeBtn).toBeDisabled();
            expect(aptitudeBtn.textContent).toContain('Completed');
        });
    });

    it('should show appropriate tooltip for completed stages', async () => {
        render(
            <StageGateScheduler
                applicationId="app-123"
                applicationPath="fresher"
            />
        );

        await waitFor(() => {
            const aptitudeBtn = screen.getByRole('button', { name: /stage has been completed/i });
            expect(aptitudeBtn).toHaveAttribute('title', 'This stage has been completed');
        });
    });
});
