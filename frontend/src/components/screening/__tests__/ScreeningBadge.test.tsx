import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScreeningBadge } from '../ScreeningBadge';

describe('ScreeningBadge', () => {
    it('should render "Shortlist" for shortlist recommendation', () => {
        render(<ScreeningBadge recommendation="shortlist" />);
        expect(screen.getByText('Shortlist')).toBeInTheDocument();
    });

    it('should render "Manual Review" for manual_review recommendation', () => {
        render(<ScreeningBadge recommendation="manual_review" />);
        expect(screen.getByText('Manual Review')).toBeInTheDocument();
    });

    it('should render "Reject" for reject recommendation', () => {
        render(<ScreeningBadge recommendation="reject" />);
        expect(screen.getByText('Reject')).toBeInTheDocument();
    });

    it('should have proper ARIA label for shortlist', () => {
        render(<ScreeningBadge recommendation="shortlist" />);
        expect(
            screen.getByLabelText('Screening recommendation: Shortlist')
        ).toBeInTheDocument();
    });

    it('should have proper ARIA label for manual_review', () => {
        render(<ScreeningBadge recommendation="manual_review" />);
        expect(
            screen.getByLabelText('Screening recommendation: Manual Review')
        ).toBeInTheDocument();
    });

    it('should have proper ARIA label for reject', () => {
        render(<ScreeningBadge recommendation="reject" />);
        expect(screen.getByLabelText('Screening recommendation: Reject')).toBeInTheDocument();
    });

    it('should have role="status"', () => {
        const { container } = render(<ScreeningBadge recommendation="shortlist" />);
        const badge = container.firstChild;
        expect(badge).toHaveAttribute('role', 'status');
    });

    it('should apply custom className', () => {
        const { container } = render(
            <ScreeningBadge recommendation="shortlist" className="custom-badge" />
        );
        expect(container.firstChild).toHaveClass('custom-badge');
    });

    it('should use green colors for shortlist', () => {
        const { container } = render(<ScreeningBadge recommendation="shortlist" />);
        const badge = container.firstChild as HTMLElement;
        expect(badge.style.backgroundColor).toBe('rgb(209, 250, 229)'); // #D1FAE5
        expect(badge.style.color).toBe('rgb(6, 95, 70)'); // #065F46
    });

    it('should use amber colors for manual_review', () => {
        const { container } = render(<ScreeningBadge recommendation="manual_review" />);
        const badge = container.firstChild as HTMLElement;
        expect(badge.style.backgroundColor).toBe('rgb(254, 243, 199)'); // #FEF3C7
        expect(badge.style.color).toBe('rgb(146, 64, 14)'); // #92400E
    });

    it('should use red colors for reject', () => {
        const { container } = render(<ScreeningBadge recommendation="reject" />);
        const badge = container.firstChild as HTMLElement;
        expect(badge.style.backgroundColor).toBe('rgb(254, 226, 226)'); // #FEE2E2
        expect(badge.style.color).toBe('rgb(153, 27, 27)'); // #991B1B
    });
});
