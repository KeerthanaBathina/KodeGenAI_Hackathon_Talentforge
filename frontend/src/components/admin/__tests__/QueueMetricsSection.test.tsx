import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueMetricsSection } from '../../QueueMetricsSection';

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

import { vi } from 'vitest';

describe('QueueMetricsSection', () => {
  it('should render queue metrics table with headers', () => {
    const queues = [
      {
        queueName: 'resume-screening',
        active: 5,
        waiting: 10,
        failed: 2,
        delayed: 3,
        completed: 150,
      },
    ];

    render(<QueueMetricsSection queues={queues} />);

    expect(screen.getByText('BullMQ Queue Metrics')).toBeInTheDocument();
    expect(screen.getByText(/Queue Name/i)).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Waiting/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed/i)).toBeInTheDocument();
  });

  it('should display queue data correctly', () => {
    const queues = [
      {
        queueName: 'email-delivery',
        active: 3,
        waiting: 15,
        failed: 1,
        delayed: 2,
        completed: 500,
      },
    ];

    render(<QueueMetricsSection queues={queues} />);

    expect(screen.getByText(/Email Delivery/)).toBeInTheDocument();
    expect(screen.getByText(/^3$/)).toBeInTheDocument(); // active count
    expect(screen.getByText(/500/)).toBeInTheDocument(); // completed
  });

  it('should show warning indicator for failed jobs', () => {
    const queues = [
      {
        queueName: 'screening',
        active: 5,
        waiting: 10,
        failed: 5,
        delayed: 3,
        completed: 150,
      },
    ];

    render(<QueueMetricsSection queues={queues} />);

    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('should show warning indicator for high waiting count', () => {
    const queues = [
      {
        queueName: 'resume-parse',
        active: 5,
        waiting: 150,
        failed: 0,
        delayed: 3,
        completed: 150,
      },
    ];

    render(<QueueMetricsSection queues={queues} />);

    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('should render multiple queues', () => {
    const queues = [
      {
        queueName: 'queue1',
        active: 1,
        waiting: 5,
        failed: 0,
        delayed: 0,
        completed: 10,
      },
      {
        queueName: 'queue2',
        active: 2,
        waiting: 10,
        failed: 1,
        delayed: 2,
        completed: 20,
      },
      {
        queueName: 'queue3',
        active: 3,
        waiting: 15,
        failed: 2,
        delayed: 3,
        completed: 30,
      },
    ];

    render(<QueueMetricsSection queues={queues} />);

    expect(screen.getByText(/Queue1/)).toBeInTheDocument();
    expect(screen.getByText(/Queue2/)).toBeInTheDocument();
    expect(screen.getByText(/Queue3/)).toBeInTheDocument();
  });

  it('should show message when no queues available', () => {
    render(<QueueMetricsSection queues={[]} />);

    expect(screen.getByText(/No queue data available/)).toBeInTheDocument();
  });

  it('should display Details link for each queue', () => {
    const queues = [
      {
        queueName: 'screening',
        active: 5,
        waiting: 10,
        failed: 2,
        delayed: 3,
        completed: 150,
      },
    ];

    render(<QueueMetricsSection queues={queues} />);

    const detailsLinks = screen.getAllByText(/Details →/);
    expect(detailsLinks.length).toBeGreaterThan(0);
  });
});
