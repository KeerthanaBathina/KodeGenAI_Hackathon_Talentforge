import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualReviewQueueTable } from '../ManualReviewQueueTable';

const openSpy = vi.fn();

const mocks = vi.hoisted(() => ({
  getManualReviewQueue: vi.fn(),
  getManualReviewReasonCodes: vi.fn(),
  markApplicationAsReviewed: vi.fn(),
  overrideApplicationPath: vi.fn(),
  scheduleInitialInterviewFromReview: vi.fn(),
  bulkRejectApplications: vi.fn(),
}));

const realtimeMocks = vi.hoisted(() => ({
  ensureRealtime: vi.fn(),
  subscribeSlaTick: vi.fn(),
  slaTickHandler: null as null | (() => void),
}));

vi.mock('@/lib/api/manualReview', () => ({
  getManualReviewQueue: mocks.getManualReviewQueue,
  getManualReviewReasonCodes: mocks.getManualReviewReasonCodes,
  markApplicationAsReviewed: mocks.markApplicationAsReviewed,
  overrideApplicationPath: mocks.overrideApplicationPath,
  scheduleInitialInterviewFromReview: mocks.scheduleInitialInterviewFromReview,
  bulkRejectApplications: mocks.bulkRejectApplications,
}));

vi.mock('@/lib/reviewQueueRealtime', () => ({
  ensureReviewQueueBadgeRealtime: realtimeMocks.ensureRealtime,
  subscribeToReviewQueueSlaTick: (handler: () => void) => {
    realtimeMocks.slaTickHandler = handler;
    realtimeMocks.subscribeSlaTick(handler);
    return () => undefined;
  },
}));

function buildResponse() {
  return {
    items: [
      {
        id: 'app-red',
        candidateId: 'cand-1',
        candidateName: 'Alex Red',
        candidateEmail: 'alex@example.com',
        requisitionId: 'req-1',
        requisitionTitle: 'Backend Engineer',
        requisitionDepartment: 'Engineering',
        status: 'pending_review',
        manualReviewReason: 'low_confidence',
        resumeId: 'resume-red',
        resumeFileName: 'alex-red-resume.pdf',
        resumeMimeType: 'application/pdf',
        submittedAt: '2026-07-25T00:00:00.000Z',
        screeningScore: 82,
        screeningConfidence: 0.9,
        path: 'fresher',
        pathOverridden: false,
        slaDeadlineAt: '2026-07-27T00:00:00.000Z',
        slaRemainingSeconds: 3661,
        slaElapsedPercent: 85,
        slaSeverity: 'red',
        isUrgent: true,
        canShortlist: true,
        canReject: true,
        decisionLocked: false,
      },
      {
        id: 'app-amber',
        candidateId: 'cand-2',
        candidateName: 'Blair Amber',
        candidateEmail: 'blair@example.com',
        requisitionId: 'req-2',
        requisitionTitle: 'QA Engineer',
        requisitionDepartment: 'Engineering',
        status: 'pending_review',
        manualReviewReason: 'flagged',
        resumeId: 'resume-amber',
        resumeFileName: 'blair-amber-resume.docx',
        resumeMimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        submittedAt: '2026-07-25T00:00:00.000Z',
        screeningScore: 71,
        screeningConfidence: 0.7,
        aptitudeScore: 84,
        scheduledStageType: 'coding',
        path: 'experienced',
        pathOverridden: true,
        slaDeadlineAt: '2026-07-27T00:00:00.000Z',
        slaRemainingSeconds: 7200,
        slaElapsedPercent: 60,
        slaSeverity: 'amber',
        isUrgent: false,
        canShortlist: true,
        canReject: true,
        decisionLocked: false,
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
    totalPages: 1,
  };
}

describe('ManualReviewQueueTable', () => {
  beforeEach(() => {
    openSpy.mockReset();
    vi.stubGlobal('open', openSpy);
    mocks.getManualReviewQueue.mockReset();
    mocks.getManualReviewReasonCodes.mockReset();
    mocks.markApplicationAsReviewed.mockReset();
    mocks.overrideApplicationPath.mockReset();
    mocks.scheduleInitialInterviewFromReview.mockReset();
    mocks.bulkRejectApplications.mockReset();
    realtimeMocks.ensureRealtime.mockReset();
    realtimeMocks.subscribeSlaTick.mockReset();
    realtimeMocks.slaTickHandler = null;
    mocks.getManualReviewQueue.mockResolvedValue(buildResponse());
    mocks.getManualReviewReasonCodes.mockImplementation(async (decision?: 'shortlisted' | 'rejected') => {
      if (decision === 'shortlisted') {
        return [
          {
            code: 'strong_skills_match',
            displayText: 'Strong skills match',
            category: 'decision',
          },
        ];
      }

      return [
        {
          code: 'insufficient_experience',
          displayText: 'Insufficient experience',
          category: 'rejection',
        },
      ];
    });
  });

  it('renders SLA chip format and urgent badge only for red rows', async () => {
    render(<ManualReviewQueueTable />);

    expect(await screen.findByText('Alex Red')).toBeInTheDocument();
    expect(screen.getByTestId('sla-chip-app-red')).toHaveTextContent('01:01:01');
    expect(screen.getByTestId('sla-chip-app-amber')).toHaveTextContent('02:00:00');

    expect(screen.getByTestId('urgent-badge-app-red')).toBeInTheDocument();
    expect(screen.queryByTestId('urgent-badge-app-amber')).not.toBeInTheDocument();
  });

  it('requests default SLA ascending sort on initial load', async () => {
    render(<ManualReviewQueueTable />);

    await waitFor(() => {
      expect(mocks.getManualReviewQueue).toHaveBeenCalledWith(
        {},
        { page: 1, limit: 20 },
        { sortBy: 'sla', sortDir: 'asc' }
      );
    });
  });

  it('issues sort request when sort header is clicked', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');

    await user.click(screen.getByRole('button', { name: /candidate sort/i }));

    await waitFor(() => {
      expect(mocks.getManualReviewQueue).toHaveBeenLastCalledWith(
        {},
        { page: 1, limit: 20 },
        { sortBy: 'candidate', sortDir: 'asc' }
      );
    });
  });

  it('reloads queue when realtime SLA tick event is received', async () => {
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');

    expect(realtimeMocks.ensureRealtime).toHaveBeenCalled();
    expect(realtimeMocks.subscribeSlaTick).toHaveBeenCalled();
    expect(realtimeMocks.slaTickHandler).not.toBeNull();

    const callCountAfterInitialLoad = mocks.getManualReviewQueue.mock.calls.length;

    realtimeMocks.slaTickHandler?.();

    await waitFor(() => {
      expect(mocks.getManualReviewQueue.mock.calls.length).toBeGreaterThan(callCountAfterInitialLoad);
    });
  });

  it('loads reason options and enables confirm once reason is selected', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');

    await user.click(screen.getByRole('button', { name: 'Shortlist Alex Red' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mocks.getManualReviewReasonCodes).toHaveBeenCalledWith('shortlisted');

    const confirmButton = screen.getByRole('button', { name: /confirm shortlisted decision/i });
    expect(confirmButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Decision reason code'), 'strong_skills_match');
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(mocks.markApplicationAsReviewed).toHaveBeenCalledWith(
        'app-red',
        'shortlisted',
        'strong_skills_match',
        undefined
      );
    });
  });

  it('shows inline reject message and keeps confirm disabled without reason code', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');
    await user.click(screen.getByRole('button', { name: 'Reject Alex Red' }));

    expect(await screen.findByText('A reason code is required before rejecting.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm rejected decision/i })).toBeDisabled();
  });

  it('enforces 500-char comment limit with live count', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');
    await user.click(screen.getByRole('button', { name: 'Reject Alex Red' }));

    const textarea = screen.getByLabelText('Decision comment');
    fireEvent.change(textarea, { target: { value: 'a'.repeat(520) } });

    expect((textarea as HTMLTextAreaElement).value.length).toBe(500);
    expect(screen.getByTestId('decision-comment-count')).toHaveTextContent('500/500');
  });

  it('renders path badges and overridden state', async () => {
    render(<ManualReviewQueueTable />);

    expect(await screen.findByText('Alex Red')).toBeInTheDocument();
    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('Test Score')).toBeInTheDocument();
    expect(screen.getByLabelText('Interview path fresher')).toBeInTheDocument();
    expect(screen.getByText('experienced (overridden)')).toBeInTheDocument();
    expect(screen.getByText('84%')).toBeInTheDocument();
  });

  it('opens resume in a new tab', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');
    await user.click(screen.getByRole('button', { name: 'View resume for Alex Red' }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/manual-review-queue/app-red/resume'),
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('shows scheduled stage text in review reason when a stage is scheduled', async () => {
    render(<ManualReviewQueueTable />);

    expect(await screen.findByText('Alex Red')).toBeInTheDocument();
    expect(screen.getByText('Programming Scheduled')).toBeInTheDocument();
    expect(screen.queryByText('queue unavailable dev')).not.toBeInTheDocument();
  });

  it('opens path override modal, validates justification length, and submits override', async () => {
    const user = userEvent.setup();
    mocks.overrideApplicationPath.mockResolvedValue({
      success: true,
      message: 'Application path overridden',
      override: {
        applicationId: 'app-red',
        originalPath: 'fresher',
        newPath: 'experienced',
        justification: 'Candidate has solid internship record and production coding exposure.',
        overriddenAt: '2026-07-25T16:00:00.000Z',
      },
    });

    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');
    await user.click(screen.getByRole('button', { name: 'Override path for Alex Red' }));

    expect(await screen.findByRole('dialog', { name: 'Override interview path form' })).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Confirm path override' });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText('Path override justification'), 'too short');
    expect(screen.getByText('Justification must be at least 20 characters.')).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText('Path override justification'));
    await user.type(
      screen.getByLabelText('Path override justification'),
      'Candidate has solid internship record and production coding exposure.'
    );
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(mocks.overrideApplicationPath).toHaveBeenCalledWith(
        'app-red',
        'experienced',
        'Candidate has solid internship record and production coding exposure.'
      );
    });
  });

  it('allows setting path when current path is unassigned', async () => {
    const user = userEvent.setup();
    const response = buildResponse();
    response.items[0].path = null;

    mocks.getManualReviewQueue.mockResolvedValueOnce(response);
    mocks.overrideApplicationPath.mockResolvedValue({
      success: true,
      message: 'Application path overridden',
      override: {
        applicationId: 'app-red',
        originalPath: null,
        newPath: 'experienced',
        justification: 'Candidate has strong project depth and leadership across internships.',
        overriddenAt: '2026-07-25T16:00:00.000Z',
      },
    });

    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');
    const overrideButton = screen.getByRole('button', { name: 'Override path for Alex Red' });
    expect(overrideButton).toBeEnabled();

    await user.click(overrideButton);
    expect(await screen.findByRole('dialog', { name: 'Override interview path form' })).toBeInTheDocument();
    expect(screen.getByText('unassigned')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Override path'), 'experienced');
    await user.type(
      screen.getByLabelText('Path override justification'),
      'Candidate has strong project depth and leadership across internships.'
    );

    await user.click(screen.getByRole('button', { name: 'Confirm path override' }));

    await waitFor(() => {
      expect(mocks.overrideApplicationPath).toHaveBeenCalledWith(
        'app-red',
        'experienced',
        'Candidate has strong project depth and leadership across internships.'
      );
    });
  });

  it('enables schedule interview only after path override is present', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');

    expect(screen.getByRole('button', { name: 'Schedule interview for Alex Red' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Schedule interview for Blair Amber' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Schedule interview for Blair Amber' }));
    expect(await screen.findByRole('dialog', { name: 'Schedule interview form' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule Aptitude stage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule Programming stage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule Tech Interview stage' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Schedule HR Round stage' })).toBeInTheDocument();
  });

  it('hides the interview link field for fresher aptitude scheduling', async () => {
    const user = userEvent.setup();
    const response = buildResponse();
    response.items[0].pathOverridden = true;

    mocks.getManualReviewQueue.mockResolvedValueOnce(response);

    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');
    await user.click(screen.getByRole('button', { name: 'Schedule interview for Alex Red' }));

    expect(await screen.findByRole('dialog', { name: 'Schedule interview form' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Interview Link')).not.toBeInTheDocument();
    expect(
      screen.getByText(/A secure aptitude test link will be generated automatically/i)
    ).toBeInTheDocument();
  });

  it('keeps bulk reject disabled until at least two applications are selected', async () => {
    const user = userEvent.setup();
    render(<ManualReviewQueueTable />);

    await screen.findByText('Alex Red');

    const bulkRejectButton = screen.getByRole('button', { name: 'Bulk reject selected applications' });
    expect(bulkRejectButton).toBeDisabled();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Select at least 2 applications for bulk action.');

    await user.click(screen.getByLabelText('Select Alex Red for bulk action'));
    expect(bulkRejectButton).toBeDisabled();

    await user.click(screen.getByLabelText('Select Blair Amber for bulk action'));
    expect(bulkRejectButton).toBeEnabled();
  });

  it('supports select-all and submits bulk reject with shared reason code', async () => {
    const user = userEvent.setup();
    mocks.bulkRejectApplications.mockResolvedValue({
      success: true,
      message: 'Bulk reject action completed',
      result: {
        processedCount: 2,
        rejectedIds: ['app-red', 'app-amber'],
        skipped: [],
        reasonCode: 'insufficient_experience',
        correlationId: 'corr-1',
        communicationsQueued: 2,
      },
    });

    render(<ManualReviewQueueTable />);
    await screen.findByText('Alex Red');

    await user.click(screen.getByLabelText('Select all visible applications'));
    expect(screen.getByLabelText('Select Alex Red for bulk action')).toBeChecked();
    expect(screen.getByLabelText('Select Blair Amber for bulk action')).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Bulk reject selected applications' }));
    expect(await screen.findByRole('dialog', { name: 'Bulk reject applications form' })).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Confirm bulk reject' });
    expect(confirmButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Bulk reject reason code'), 'insufficient_experience');
    expect(confirmButton).toBeEnabled();

    await user.click(confirmButton);

    await waitFor(() => {
      expect(mocks.bulkRejectApplications).toHaveBeenCalledWith(
        ['app-red', 'app-amber'],
        'insufficient_experience',
        undefined
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Alex Red')).not.toBeInTheDocument();
      expect(screen.queryByText('Blair Amber')).not.toBeInTheDocument();
    });
  });
});
