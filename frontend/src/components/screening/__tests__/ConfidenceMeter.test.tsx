import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfidenceMeter } from '../ConfidenceMeter';

describe('ConfidenceMeter', () => {
    const defaultThresholds = {
        shortlistThreshold: 75,
        borderlineMin: 40,
        rejectThreshold: 39,
    };

    it('should display "Strong Match" for score >= shortlist threshold', () => {
        render(<ConfidenceMeter score={85} {...defaultThresholds} />);
        expect(screen.getByText('Strong Match')).toBeInTheDocument();
    });

    it('should display "Borderline" for score in borderline range', () => {
        render(<ConfidenceMeter score={55} {...defaultThresholds} />);
        expect(screen.getByText('Borderline')).toBeInTheDocument();
    });

    it('should display "Below Threshold" for score <= reject threshold', () => {
        render(<ConfidenceMeter score={25} {...defaultThresholds} />);
        expect(screen.getByText('Below Threshold')).toBeInTheDocument();
    });

    it('should set progress bar width to match score', () => {
        const { container } = render(<ConfidenceMeter score={60} {...defaultThresholds} />);
        const progressBar = container.querySelector('[role="progressbar"] > div');
        expect(progressBar).toHaveStyle({ width: '60%' });
    });

    it('should have proper ARIA attributes', () => {
        render(<ConfidenceMeter score={70} {...defaultThresholds} />);
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute('aria-valuenow', '70');
        expect(progressBar).toHaveAttribute('aria-valuemin', '0');
        expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('should handle boundary: score exactly at shortlist threshold', () => {
        render(<ConfidenceMeter score={75} {...defaultThresholds} />);
        expect(screen.getByText('Strong Match')).toBeInTheDocument();
    });

    it('should handle boundary: score exactly at reject threshold', () => {
        render(<ConfidenceMeter score={39} {...defaultThresholds} />);
        expect(screen.getByText('Below Threshold')).toBeInTheDocument();
    });

    it('should handle boundary: score one point above reject threshold', () => {
        render(<ConfidenceMeter score={40} {...defaultThresholds} />);
        expect(screen.getByText('Borderline')).toBeInTheDocument();
    });

    it('should handle boundary: score one point below shortlist threshold', () => {
        render(<ConfidenceMeter score={74} {...defaultThresholds} />);
        expect(screen.getByText('Borderline')).toBeInTheDocument();
    });

    it('should display 0% score correctly', () => {
        render(<ConfidenceMeter score={0} {...defaultThresholds} />);
        expect(screen.getByText('0%')).toBeInTheDocument();
        expect(screen.getByText('Below Threshold')).toBeInTheDocument();
    });

    it('should display 100% score correctly', () => {
        render(<ConfidenceMeter score={100} {...defaultThresholds} />);
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.getByText('Strong Match')).toBeInTheDocument();
    });

    it('should display score percentage text', () => {
        render(<ConfidenceMeter score={82} {...defaultThresholds} />);
        expect(screen.getByText('82%')).toBeInTheDocument();
    });

    it('should have accessible label for score', () => {
        render(<ConfidenceMeter score={82} {...defaultThresholds} />);
        expect(screen.getByLabelText('Score: 82 out of 100')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
        const { container } = render(
            <ConfidenceMeter score={50} {...defaultThresholds} className="custom-class" />
        );
        expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should have accessible progress bar label', () => {
        render(<ConfidenceMeter score={65} {...defaultThresholds} />);
        const progressBar = screen.getByRole('progressbar');
        expect(progressBar).toHaveAttribute(
            'aria-label',
            'Screening confidence: 65 percent, Borderline'
        );
    });
});
