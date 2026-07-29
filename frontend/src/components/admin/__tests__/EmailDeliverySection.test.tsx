import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailDeliverySection } from '../../EmailDeliverySection';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// Mock date-fns
vi.mock('date-fns', () => ({
  format: (date: Date, format: string) => '10:00 AM',
}));

describe('EmailDeliverySection', () => {
  it('should not render when emailDelivery is undefined', () => {
    const { container } = render(<EmailDeliverySection />);

    expect(container.firstChild).toBeNull();
  });

  it('should render email delivery metrics with header', () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 95,
      failed: 5,
      successRate: 95,
      failedEmails: [],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    expect(screen.getByText(/Email Delivery Metrics/)).toBeInTheDocument();
    expect(screen.getByText('95%')).toBeInTheDocument(); // Success rate
    expect(screen.getByText('100')).toBeInTheDocument(); // Total attempted
  });

  it('should display all metric cards', () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 95,
      failed: 5,
      successRate: 95,
      failedEmails: [],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    expect(screen.getByText('Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Total Attempted')).toBeInTheDocument();
    expect(screen.getByText('Successful')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('should not show failed emails section when failed count is 0', () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 100,
      failed: 0,
      successRate: 100,
      failedEmails: [],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    expect(screen.getByText(/All Email Deliveries Successful/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed Emails/)).not.toBeInTheDocument();
  });

  it('should show failed emails section when failed count > 0', () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 95,
      failed: 5,
      successRate: 95,
      failedEmails: [],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    expect(screen.getByText(/Failed Emails \(5\)/)).toBeInTheDocument();
  });

  it('should expand/collapse failed emails list', async () => {
    const user = userEvent.setup();
    const emailDelivery = {
      totalAttempted: 100,
      successful: 95,
      failed: 2,
      successRate: 95,
      failedEmails: [
        {
          id: 'email1',
          to: 'user1@example.com',
          templateType: 'onboarding',
          status: 'failed',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    // Initially should show "View Failed" button
    expect(screen.getByText(/View Failed/)).toBeInTheDocument();

    // Click to expand
    const button = screen.getByRole('button');
    await user.click(button);

    // Should now show "Hide" and email table
    expect(screen.getByText(/Hide/)).toBeInTheDocument();
    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
  });

  it('should display failed email details in table', () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 95,
      failed: 2,
      successRate: 95,
      failedEmails: [
        {
          id: 'email1',
          to: 'user1@example.com',
          templateType: 'onboarding',
          status: 'failed',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'email2',
          to: 'user2@example.com',
          templateType: 'reminder',
          status: 'failed',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    const button = screen.getByRole('button');
    userEvent.click(button);

    expect(screen.getByText('user1@example.com')).toBeInTheDocument();
    expect(screen.getByText('user2@example.com')).toBeInTheDocument();
    expect(screen.getByText('onboarding')).toBeInTheDocument();
    expect(screen.getByText('reminder')).toBeInTheDocument();
  });

  it('should show success rate color coding', () => {
    const { rerender } = render(
      <EmailDeliverySection
        emailDelivery={{
          totalAttempted: 100,
          successful: 98,
          failed: 2,
          successRate: 98,
          failedEmails: [],
        }}
      />
    );

    expect(screen.getByText('98%')).toBeInTheDocument();

    // Re-render with lower success rate
    rerender(
      <EmailDeliverySection
        emailDelivery={{
          totalAttempted: 100,
          successful: 85,
          failed: 15,
          successRate: 85,
          failedEmails: [],
        }}
      />
    );

    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('should display link to all failed emails page', async () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 95,
      failed: 5,
      successRate: 95,
      failedEmails: [],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    const button = screen.getByRole('button');
    await userEvent.click(button);

    const link = screen.getByText(/View All Failed Emails/);
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/admin/health/email/failed');
  });

  it('should handle empty failed emails gracefully', () => {
    const emailDelivery = {
      totalAttempted: 100,
      successful: 99,
      failed: 1,
      successRate: 99,
      failedEmails: [],
    };

    render(<EmailDeliverySection emailDelivery={emailDelivery} />);

    const button = screen.getByRole('button');
    userEvent.click(button);

    // Should show table headers and no-data indication
    expect(screen.getByText(/To/i)).toBeInTheDocument();
  });
});
