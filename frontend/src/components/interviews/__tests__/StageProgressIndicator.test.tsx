import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StageProgressIndicator } from '../StageProgressIndicator';

describe('StageProgressIndicator', () => {
    it('should render all stages', () => {
        const stages = [
            { stage: 'aptitude', status: 'completed' as const, prerequisites: [], missingPrerequisites: [] },
            { stage: 'technical', status: 'available' as const, prerequisites: ['aptitude'], missingPrerequisites: [] },
            { stage: 'cultural', status: 'locked' as const, prerequisites: ['aptitude', 'technical'], missingPrerequisites: ['technical'] },
        ];

        render(<StageProgressIndicator stages={stages} />);

        expect(screen.getByText('Aptitude')).toBeInTheDocument();
        expect(screen.getByText('Technical')).toBeInTheDocument();
        expect(screen.getByText('Cultural Fit')).toBeInTheDocument();
    });

    it('should show checkmark for completed stages', () => {
        const stages = [
            { stage: 'aptitude', status: 'completed' as const, prerequisites: [], missingPrerequisites: [] },
        ];

        const { container } = render(<StageProgressIndicator stages={stages} />);

        expect(container.textContent).toContain('✓');
    });

    it('should show lock icon for locked stages', () => {
        const stages = [
            { stage: 'technical', status: 'locked' as const, prerequisites: ['aptitude'], missingPrerequisites: ['aptitude'] },
        ];

        const { container } = render(<StageProgressIndicator stages={stages} />);

        expect(container.textContent).toContain('🔒');
    });

    it('should display missing prerequisites', () => {
        const stages = [
            { stage: 'cultural', status: 'locked' as const, prerequisites: ['aptitude', 'technical'], missingPrerequisites: ['technical'] },
        ];

        render(<StageProgressIndicator stages={stages} />);

        expect(screen.getByText(/Requires:.*Technical/i)).toBeInTheDocument();
    });

    it('should highlight current stage', () => {
        const stages = [
            { stage: 'aptitude', status: 'completed' as const, prerequisites: [], missingPrerequisites: [] },
            { stage: 'technical', status: 'available' as const, prerequisites: ['aptitude'], missingPrerequisites: [] },
        ];

        const { container } = render(<StageProgressIndicator stages={stages} currentStage="technical" />);

        const technicalLabel = screen.getByText('Technical');
        expect(technicalLabel).toHaveStyle({ fontWeight: 'bold' });
    });

    it('should show available stage with open circle', () => {
        const stages = [
            { stage: 'technical', status: 'available' as const, prerequisites: ['aptitude'], missingPrerequisites: [] },
        ];

        const { container } = render(<StageProgressIndicator stages={stages} />);

        expect(container.textContent).toContain('○');
    });

    it('should dim not_applicable stages', () => {
        const stages = [
            { stage: 'aptitude', status: 'not_applicable' as const, prerequisites: [], missingPrerequisites: [] },
        ];

        const { container } = render(<StageProgressIndicator stages={stages} />);

        // Find the stage container div (second level div with opacity style)
        const stageContainers = container.querySelectorAll('div > div[style*="opacity"]');
        expect(stageContainers.length).toBeGreaterThan(0);
        const stageContainer = stageContainers[0] as HTMLElement;
        expect(stageContainer.style.opacity).toBe('0.3');
    });

    it('should display multiple missing prerequisites', () => {
        const stages = [
            { stage: 'cultural', status: 'locked' as const, prerequisites: ['aptitude', 'technical'], missingPrerequisites: ['aptitude', 'technical'] },
        ];

        render(<StageProgressIndicator stages={stages} />);

        expect(screen.getByText(/Requires:.*Aptitude, Technical/i)).toBeInTheDocument();
    });
});
