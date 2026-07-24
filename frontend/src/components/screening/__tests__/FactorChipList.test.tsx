import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FactorChip } from '../FactorChip';
import { FactorChipList } from '../FactorChipList';

describe('FactorChip', () => {
    it('should render chip with label', () => {
        render(<FactorChip label="Python (5 yrs)" />);
        expect(screen.getByText('Python (5 yrs)')).toBeInTheDocument();
    });

    it('should have proper ARIA label', () => {
        render(<FactorChip label="AWS Certified" />);
        expect(screen.getByLabelText('Positive factor: AWS Certified')).toBeInTheDocument();
    });

    it('should have role="status"', () => {
        const { container } = render(<FactorChip label="Test" />);
        const chip = container.firstChild;
        expect(chip).toHaveAttribute('role', 'status');
    });

    it('should display checkmark SVG icon', () => {
        const { container } = render(<FactorChip label="Test" />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('should add title attribute for hover', () => {
        const { container } = render(<FactorChip label="Long skill name here" />);
        const span = container.querySelector('span[title]');
        expect(span).toHaveAttribute('title', 'Long skill name here');
    });

    it('should apply custom className', () => {
        const { container } = render(<FactorChip label="Test" className="custom" />);
        expect(container.firstChild).toHaveClass('custom');
    });
});

describe('FactorChipList', () => {
    it('should render all factor chips', () => {
        const factors = ['Python (5 yrs)', 'AWS Certified', 'Team lead'];
        render(<FactorChipList factors={factors} />);

        expect(screen.getByText('Python (5 yrs)')).toBeInTheDocument();
        expect(screen.getByText('AWS Certified')).toBeInTheDocument();
        expect(screen.getByText('Team lead')).toBeInTheDocument();
    });

    it('should show empty message when no factors', () => {
        render(<FactorChipList factors={[]} />);
        expect(screen.getByText('No positive factors identified')).toBeInTheDocument();
    });

    it('should use custom empty message', () => {
        render(<FactorChipList factors={[]} emptyMessage="Custom message" />);
        expect(screen.getByText('Custom message')).toBeInTheDocument();
    });

    it('should have proper ARIA labels', () => {
        const factors = ['Python'];
        render(<FactorChipList factors={factors} />);

        const list = screen.getByRole('list');
        expect(list).toHaveAttribute('aria-label', 'Positive screening factors');
    });

    it('should render list items with role="listitem"', () => {
        const factors = ['Factor 1', 'Factor 2'];
        render(<FactorChipList factors={factors} />);

        const listItems = screen.getAllByRole('listitem');
        expect(listItems).toHaveLength(2);
    });

    it('should handle single factor', () => {
        render(<FactorChipList factors={['Single factor']} />);
        expect(screen.getByText('Single factor')).toBeInTheDocument();
    });

    it('should handle many factors', () => {
        const factors = Array.from({ length: 10 }, (_, i) => `Factor ${i + 1}`);
        render(<FactorChipList factors={factors} />);

        factors.forEach((factor) => {
            expect(screen.getByText(factor)).toBeInTheDocument();
        });
    });

    it('should apply custom className', () => {
        const { container } = render(
            <FactorChipList factors={['Test']} className="custom-list" />
        );
        expect(container.firstChild).toHaveClass('custom-list');
    });
});
