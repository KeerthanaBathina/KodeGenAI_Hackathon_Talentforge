import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GapChip } from '../GapChip';
import { GapChipList } from '../GapChipList';

describe('GapChip', () => {
    it('should render chip with label', () => {
        render(<GapChip label="Docker" />);
        expect(screen.getByText('Docker')).toBeInTheDocument();
    });

    it('should have proper ARIA label', () => {
        render(<GapChip label="Kubernetes" />);
        expect(screen.getByLabelText('Missing skill: Kubernetes')).toBeInTheDocument();
    });

    it('should have role="status"', () => {
        const { container } = render(<GapChip label="Test" />);
        const chip = container.firstChild;
        expect(chip).toHaveAttribute('role', 'status');
    });

    it('should display warning SVG icon', () => {
        const { container } = render(<GapChip label="Test" />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveAttribute('aria-hidden', 'true');
    });

    it('should add title attribute for hover', () => {
        const { container } = render(<GapChip label="Long skill name" />);
        const span = container.querySelector('span[title]');
        expect(span).toHaveAttribute('title', 'Long skill name');
    });

    it('should apply custom className', () => {
        const { container } = render(<GapChip label="Test" className="custom" />);
        expect(container.firstChild).toHaveClass('custom');
    });
});

describe('GapChipList', () => {
    it('should render all gap chips', () => {
        const gaps = ['Docker', 'Kubernetes'];
        render(<GapChipList gaps={gaps} />);

        expect(screen.getByText('Docker')).toBeInTheDocument();
        expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    });

    it('should show empty message when no gaps', () => {
        render(<GapChipList gaps={[]} />);
        expect(screen.getByText('No skill gaps identified')).toBeInTheDocument();
    });

    it('should use custom empty message', () => {
        render(<GapChipList gaps={[]} emptyMessage="All skills matched!" />);
        expect(screen.getByText('All skills matched!')).toBeInTheDocument();
    });

    it('should have proper ARIA labels', () => {
        const gaps = ['Docker'];
        render(<GapChipList gaps={gaps} />);

        const list = screen.getByRole('list');
        expect(list).toHaveAttribute('aria-label', 'Skill gaps');
    });

    it('should render list items with role="listitem"', () => {
        const gaps = ['Gap 1', 'Gap 2'];
        render(<GapChipList gaps={gaps} />);

        const listItems = screen.getAllByRole('listitem');
        expect(listItems).toHaveLength(2);
    });

    it('should handle single gap', () => {
        render(<GapChipList gaps={['Single gap']} />);
        expect(screen.getByText('Single gap')).toBeInTheDocument();
    });

    it('should handle many gaps', () => {
        const gaps = Array.from({ length: 8 }, (_, i) => `Gap ${i + 1}`);
        render(<GapChipList gaps={gaps} />);

        gaps.forEach((gap) => {
            expect(screen.getByText(gap)).toBeInTheDocument();
        });
    });

    it('should apply custom className', () => {
        const { container } = render(<GapChipList gaps={['Test']} className="custom-list" />);
        expect(container.firstChild).toHaveClass('custom-list');
    });
});
