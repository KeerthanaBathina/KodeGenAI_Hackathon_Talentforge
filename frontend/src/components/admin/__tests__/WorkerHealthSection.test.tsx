import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerHealthSection } from '../../WorkerHealthSection';

describe('WorkerHealthSection', () => {
  it('should render online worker with green status', () => {
    const workers = [
      {
        workerName: 'AI Screening Worker',
        status: 'online' as const,
        lastHeartbeat: new Date().toISOString(),
        minutesSinceHeartbeat: 1,
      },
    ];

    render(<WorkerHealthSection workers={workers} />);

    expect(screen.getByText('AI Screening Worker')).toBeInTheDocument();
    expect(screen.getByText(/ONLINE/)).toBeInTheDocument();
    expect(screen.getByText(/1 min ago/)).toBeInTheDocument();
  });

  it('should render degraded worker with amber status', () => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    const workers = [
      {
        workerName: 'Email Delivery Worker',
        status: 'degraded' as const,
        lastHeartbeat: threeMinutesAgo.toISOString(),
        minutesSinceHeartbeat: 3,
      },
    ];

    render(<WorkerHealthSection workers={workers} />);

    expect(screen.getByText('Email Delivery Worker')).toBeInTheDocument();
    expect(screen.getByText(/DEGRADED/)).toBeInTheDocument();
    expect(screen.getByText(/3 min ago/)).toBeInTheDocument();
  });

  it('should render offline worker with red status', () => {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const workers = [
      {
        workerName: 'Resume Parser Worker',
        status: 'offline' as const,
        lastHeartbeat: tenMinutesAgo.toISOString(),
        minutesSinceHeartbeat: 10,
      },
    ];

    render(<WorkerHealthSection workers={workers} />);

    expect(screen.getByText('Resume Parser Worker')).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE/)).toBeInTheDocument();
  });

  it('should handle worker with no heartbeat', () => {
    const workers = [
      {
        workerName: 'Offer Processing Worker',
        status: 'offline' as const,
        lastHeartbeat: null,
        minutesSinceHeartbeat: null,
      },
    ];

    render(<WorkerHealthSection workers={workers} />);

    expect(screen.getByText('Offer Processing Worker')).toBeInTheDocument();
    expect(screen.getByText(/No heartbeat detected/)).toBeInTheDocument();
  });

  it('should render multiple workers', () => {
    const workers = [
      {
        workerName: 'Worker 1',
        status: 'online' as const,
        lastHeartbeat: new Date().toISOString(),
        minutesSinceHeartbeat: 1,
      },
      {
        workerName: 'Worker 2',
        status: 'degraded' as const,
        lastHeartbeat: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        minutesSinceHeartbeat: 3,
      },
      {
        workerName: 'Worker 3',
        status: 'offline' as const,
        lastHeartbeat: null,
        minutesSinceHeartbeat: null,
      },
    ];

    render(<WorkerHealthSection workers={workers} />);

    expect(screen.getByText('Worker 1')).toBeInTheDocument();
    expect(screen.getByText('Worker 2')).toBeInTheDocument();
    expect(screen.getByText('Worker 3')).toBeInTheDocument();
  });

  it('should render header', () => {
    render(<WorkerHealthSection workers={[]} />);

    expect(screen.getByText('Worker Health Status')).toBeInTheDocument();
  });
});
