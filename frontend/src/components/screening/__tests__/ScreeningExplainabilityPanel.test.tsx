import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreeningExplainabilityPanel } from '../ScreeningExplainabilityPanel';
import * as screeningApi from '@/lib/api/screening';

// Mock the API module
vi.mock('@/lib/api/screening', () => ({
    getScreeningByApplication: vi.fn(),
    getActiveThresholds: vi.fn(),
}));

describe('ScreeningExplainabilityPanel', () => {
    const mockScreeningData = {
        id: 'screening-1',
        applicationId: 'app-1',
        score: 82,
        recommendation: 'shortlist' as const,
        factors: {
            positiveFactors: ['Python (5 yrs)', 'AWS Certified', 'Team lead experience'],
            skillGaps: ['Docker', 'Kubernetes'],
            scoreBreakdown: {
                skillMatch: 42,
                experienceMatch: 25,
                educationMatch: 15,
            },
        },
        thresholdVersion: 1,
        screenedAt: '2026-07-24T10:00:00Z',
        createdAt: '2026-07-24T10:00:00Z',
        updatedAt: '2026-07-24T10:00:00Z',
    };

    const mockThresholdsData = {
        shortlistThreshold: 75,
        borderlineMin: 40,
        borderlineMax: 74,
        rejectThreshold: 39,
        version: 1,
        effectiveFrom: '2026-07-24',
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should display loading state initially', () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockImplementation(
            () => new Promise(() => { }) // Never resolves
        );
        vi.mocked(screeningApi.getActiveThresholds).mockImplementation(
            () => new Promise(() => { })
        );

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);
        expect(screen.getByText('Loading screening analysis...')).toBeInTheDocument();
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should display error state when API call fails', async () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockRejectedValue(
            new Error('Failed to fetch screening data')
        );
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument();
            expect(screen.getByText('Failed to fetch screening data')).toBeInTheDocument();
        });
    });

    it('should display empty state when no screening data', async () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(null as any);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(
                screen.getByText('No screening data available for this application')
            ).toBeInTheDocument();
        });
    });

    it('should render complete screening panel with all data', async () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(mockScreeningData);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screen.getByText('AI Screening Analysis')).toBeInTheDocument();
        });

        // Check confidence meter
        expect(screen.getByText('Strong Match')).toBeInTheDocument();
        expect(screen.getByText('82%')).toBeInTheDocument();

        // Check score breakdown
        expect(screen.getByText('Score Breakdown')).toBeInTheDocument();
        expect(screen.getByText('Skills')).toBeInTheDocument();
        expect(screen.getByText('42/50')).toBeInTheDocument();
        expect(screen.getByText('Experience')).toBeInTheDocument();
        expect(screen.getByText('25/30')).toBeInTheDocument();
        expect(screen.getByText('Education')).toBeInTheDocument();
        expect(screen.getByText('15/20')).toBeInTheDocument();

        // Check positive factors
        expect(screen.getByText('Positive Factors')).toBeInTheDocument();
        expect(screen.getByText('Python (5 yrs)')).toBeInTheDocument();
        expect(screen.getByText('AWS Certified')).toBeInTheDocument();
        expect(screen.getByText('Team lead experience')).toBeInTheDocument();

        // Check skill gaps
        expect(screen.getByText('Skill Gaps')).toBeInTheDocument();
        expect(screen.getByText('Docker')).toBeInTheDocument();
        expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    });

    it('should handle screening without score breakdown', async () => {
        const dataWithoutBreakdown = {
            ...mockScreeningData,
            factors: {
                positiveFactors: ['Python'],
                skillGaps: ['Docker'],
                scoreBreakdown: null as any,
            },
        };

        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(dataWithoutBreakdown);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screen.getByText('AI Screening Analysis')).toBeInTheDocument();
        });

        // Score breakdown should not be rendered
        expect(screen.queryByText('Score Breakdown')).not.toBeInTheDocument();

        // Other sections should still render
        expect(screen.getByText('Positive Factors')).toBeInTheDocument();
        expect(screen.getByText('Skill Gaps')).toBeInTheDocument();
    });

    it('should handle empty positive factors', async () => {
        const dataWithNoFactors = {
            ...mockScreeningData,
            factors: {
                positiveFactors: [],
                skillGaps: ['Docker'],
                scoreBreakdown: mockScreeningData.factors.scoreBreakdown,
            },
        };

        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(dataWithNoFactors);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screen.getByText('No positive factors identified')).toBeInTheDocument();
        });
    });

    it('should handle empty skill gaps', async () => {
        const dataWithNoGaps = {
            ...mockScreeningData,
            factors: {
                positiveFactors: ['Python'],
                skillGaps: [],
                scoreBreakdown: mockScreeningData.factors.scoreBreakdown,
            },
        };

        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(dataWithNoGaps);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screen.getByText('No skill gaps identified')).toBeInTheDocument();
        });
    });

    it('should apply custom className', async () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(mockScreeningData);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        const { container } = render(
            <ScreeningExplainabilityPanel applicationId="app-1" className="custom-panel" />
        );

        await waitFor(() => {
            expect(screen.getByText('AI Screening Analysis')).toBeInTheDocument();
        });

        const panel = container.querySelector('.custom-panel');
        expect(panel).toBeInTheDocument();
    });

    it('should fetch data on mount', async () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(mockScreeningData);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screeningApi.getScreeningByApplication).toHaveBeenCalledWith('app-1');
            expect(screeningApi.getActiveThresholds).toHaveBeenCalled();
        });
    });

    it('should refetch data when applicationId changes', async () => {
        vi.mocked(screeningApi.getScreeningByApplication).mockResolvedValue(mockScreeningData);
        vi.mocked(screeningApi.getActiveThresholds).mockResolvedValue(mockThresholdsData);

        const { rerender } = render(<ScreeningExplainabilityPanel applicationId="app-1" />);

        await waitFor(() => {
            expect(screeningApi.getScreeningByApplication).toHaveBeenCalledWith('app-1');
        });

        vi.clearAllMocks();

        rerender(<ScreeningExplainabilityPanel applicationId="app-2" />);

        await waitFor(() => {
            expect(screeningApi.getScreeningByApplication).toHaveBeenCalledWith('app-2');
        });
    });
});
