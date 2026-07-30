import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ScreeningThresholdHistory,
  ScoringThresholdHistory,
  ApprovalPolicyHistory,
  PolicyHistoryViewer,
} from '../components/admin';
import { ChangeBadge, DecimalChangeBadge, CurrencyChangeBadge } from '../components/admin/ChangeBadge';
import {
  screeningThresholdHistoryToCSV,
  scoringThresholdHistoryToCSV,
  approvalPolicyHistoryToCSV,
} from '../utils/historyExport';
import * as policyService from '../services/policyService';

// Mock the policy service
vi.mock('../services/policyService');

describe('ChangeBadge Component', () => {
  it('renders current value when no previous value', () => {
    render(<ChangeBadge current={80} />);
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  it('shows green up arrow for increase', () => {
    render(<ChangeBadge current={80} previous={70} />);
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.getByText('↑ 10')).toBeInTheDocument();
  });

  it('shows red down arrow for decrease', () => {
    render(<ChangeBadge current={70} previous={80} />);
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('↓ 10')).toBeInTheDocument();
  });

  it('handles no change gracefully', () => {
    render(<ChangeBadge current={80} previous={80} />);
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(screen.queryByText('↑')).not.toBeInTheDocument();
    expect(screen.queryByText('↓')).not.toBeInTheDocument();
  });
});

describe('DecimalChangeBadge Component', () => {
  it('formats decimal values correctly', () => {
    render(
      <DecimalChangeBadge
        current="0.8500"
        previous="0.8000"
        decimals={4}
      />
    );
    expect(screen.getByText('0.8500')).toBeInTheDocument();
    expect(screen.getByText('↑ 0.0500')).toBeInTheDocument();
  });

  it('handles string and number formats', () => {
    render(
      <DecimalChangeBadge
        current={0.85}
        previous="0.80"
        decimals={4}
      />
    );
    expect(screen.getByText('0.8500')).toBeInTheDocument();
  });
});

describe('CurrencyChangeBadge Component', () => {
  it('formats currency values correctly', () => {
    render(
      <CurrencyChangeBadge
        current={150000}
        previous={100000}
      />
    );
    expect(screen.getByText('$150,000.00')).toBeInTheDocument();
    expect(screen.getByText('↑ $50,000.00')).toBeInTheDocument();
  });

  it('handles string currency values', () => {
    render(
      <CurrencyChangeBadge
        current="150000"
        previous="100000"
      />
    );
    expect(screen.getByText('$150,000.00')).toBeInTheDocument();
  });
});

describe('History Export Utilities', () => {
  describe('screeningThresholdHistoryToCSV', () => {
    it('converts screening thresholds to CSV format', () => {
      const mockHistory = [
        {
          id: '1',
          version: 1,
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: '2026-07-01T00:00:00Z',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ];

      const csv = screeningThresholdHistoryToCSV(mockHistory as any);
      expect(csv).toContain('Version');
      expect(csv).toContain('v1');
      expect(csv).toContain('80');
      expect(csv).toContain('Shortlist Threshold');
    });

    it('escapes special characters in CSV', () => {
      const mockHistory = [
        {
          id: '1',
          version: 1,
          shortlistThreshold: 80,
          borderlineMin: 40,
          borderlineMax: 60,
          rejectThreshold: 20,
          effectiveFrom: '2026-07-01T00:00:00Z',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ];

      const csv = screeningThresholdHistoryToCSV(mockHistory as any);
      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // Header + 1 row
    });
  });

  describe('scoringThresholdHistoryToCSV', () => {
    it('converts scoring thresholds to CSV format', () => {
      const mockHistory = [
        {
          id: '1',
          jobFamilyId: 'jf-1',
          aiShortlistThreshold: '0.8500',
          confidenceThreshold: '0.7000',
          experienceThresholdYears: 5,
          effectiveFrom: '2026-07-01T00:00:00Z',
          createdAt: '2026-07-01T00:00:00Z',
          createdBy: 'admin',
        },
      ];

      const csv = scoringThresholdHistoryToCSV(mockHistory as any);
      expect(csv).toContain('Job Family');
      expect(csv).toContain('0.8500');
      expect(csv).toContain('AI Shortlist Threshold');
    });
  });

  describe('approvalPolicyHistoryToCSV', () => {
    it('converts approval policies to CSV format', () => {
      const mockHistory = [
        {
          id: '1',
          compensationBandMin: '100000',
          compensationBandMax: '150000',
          requiredApprovers: [],
          effectiveFrom: '2026-07-01T00:00:00Z',
          active: true,
          createdAt: '2026-07-01T00:00:00Z',
          createdBy: 'admin',
        },
      ];

      const csv = approvalPolicyHistoryToCSV(mockHistory as any);
      expect(csv).toContain('Compensation Band Min');
      expect(csv).toContain('100000');
      expect(csv).toContain('Active');
    });
  });
});

describe('ScreeningThresholdHistory Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays screening threshold history', async () => {
    const mockHistory = [
      {
        id: '1',
        version: 2,
        shortlistThreshold: 85,
        borderlineMin: 45,
        borderlineMax: 65,
        rejectThreshold: 25,
        effectiveFrom: '2026-07-15T00:00:00Z',
        createdAt: '2026-07-15T00:00:00Z',
      },
      {
        id: '2',
        version: 1,
        shortlistThreshold: 80,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
        effectiveFrom: '2026-07-01T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z',
      },
    ];

    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ScreeningThresholdHistory />);

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
    });
  });

  it('shows current version badge for latest version', async () => {
    const mockHistory = [
      {
        id: '1',
        version: 2,
        shortlistThreshold: 85,
        borderlineMin: 45,
        borderlineMax: 65,
        rejectThreshold: 25,
        effectiveFrom: '2026-07-15T00:00:00Z',
        createdAt: '2026-07-15T00:00:00Z',
      },
    ];

    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ScreeningThresholdHistory />);

    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });

  it('displays empty state when no history available', async () => {
    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue([]);

    render(<ScreeningThresholdHistory />);

    await waitFor(() => {
      expect(
        screen.getByText('No screening threshold history available')
      ).toBeInTheDocument();
    });
  });

  it('shows Details button for viewing version details', async () => {
    const mockHistory = [
      {
        id: '1',
        version: 1,
        shortlistThreshold: 80,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
        effectiveFrom: '2026-07-01T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z',
      },
    ];

    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ScreeningThresholdHistory />);

    await waitFor(() => {
      expect(screen.getByText('Details')).toBeInTheDocument();
    });
  });

  it('shows Compare button for non-latest versions', async () => {
    const mockHistory = [
      {
        id: '1',
        version: 2,
        shortlistThreshold: 85,
        borderlineMin: 45,
        borderlineMax: 65,
        rejectThreshold: 25,
        effectiveFrom: '2026-07-15T00:00:00Z',
        createdAt: '2026-07-15T00:00:00Z',
      },
      {
        id: '2',
        version: 1,
        shortlistThreshold: 80,
        borderlineMin: 40,
        borderlineMax: 60,
        rejectThreshold: 20,
        effectiveFrom: '2026-07-01T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z',
      },
    ];

    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ScreeningThresholdHistory />);

    await waitFor(() => {
      const compareButtons = screen.getAllByText('Compare');
      expect(compareButtons.length).toBeGreaterThan(0);
    });
  });
});

describe('ScoringThresholdHistory Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads job families and scoring threshold history', async () => {
    const mockJobFamilies = [
      { id: 'jf-1', name: 'Software Engineer' },
      { id: 'jf-2', name: 'Product Manager' },
    ];

    const mockHistory = [
      {
        id: '1',
        jobFamilyId: 'jf-1',
        aiShortlistThreshold: '0.8500',
        confidenceThreshold: '0.7000',
        experienceThresholdYears: 5,
        effectiveFrom: '2026-07-01T00:00:00Z',
        createdAt: '2026-07-01T00:00:00Z',
        createdBy: 'admin',
      },
    ];

    vi.mocked(policyService.getJobFamilies).mockResolvedValue(
      mockJobFamilies as any
    );
    vi.mocked(policyService.getScoringThresholdHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ScoringThresholdHistory />);

    await waitFor(() => {
      expect(screen.getByText('Software Engineer')).toBeInTheDocument();
    });
  });

  it('filters history by selected job family', async () => {
    const mockJobFamilies = [
      { id: 'jf-1', name: 'Software Engineer' },
    ];

    const mockHistory = [];

    vi.mocked(policyService.getJobFamilies).mockResolvedValue(
      mockJobFamilies as any
    );
    vi.mocked(policyService.getScoringThresholdHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ScoringThresholdHistory />);

    await waitFor(() => {
      const select = screen.getByDisplayValue('jf-1') as HTMLSelectElement;
      expect(select).toBeInTheDocument();
    });
  });
});

describe('ApprovalPolicyHistory Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and displays approval policy history', async () => {
    const mockHistory = [
      {
        id: '1',
        compensationBandMin: '100000',
        compensationBandMax: '150000',
        requiredApprovers: [
          {
            tier: 1,
            approverId: 'user-1',
            displayName: 'John Doe',
            role: 'Manager',
          },
        ],
        effectiveFrom: '2026-07-01T00:00:00Z',
        active: true,
        createdAt: '2026-07-01T00:00:00Z',
        createdBy: 'admin',
      },
    ];

    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ApprovalPolicyHistory />);

    await waitFor(() => {
      expect(screen.getByText('$100,000.00')).toBeInTheDocument();
    });
  });

  it('shows active status badge', async () => {
    const mockHistory = [
      {
        id: '1',
        compensationBandMin: '100000',
        compensationBandMax: '150000',
        requiredApprovers: [],
        effectiveFrom: '2026-07-01T00:00:00Z',
        active: true,
        createdAt: '2026-07-01T00:00:00Z',
        createdBy: 'admin',
      },
    ];

    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ApprovalPolicyHistory />);

    await waitFor(() => {
      expect(screen.getByText('✓ Active')).toBeInTheDocument();
    });
  });

  it('displays approver tier information', async () => {
    const mockHistory = [
      {
        id: '1',
        compensationBandMin: '100000',
        compensationBandMax: '150000',
        requiredApprovers: [
          {
            tier: 1,
            approverId: 'user-1',
            displayName: 'John Doe',
            role: 'Manager',
          },
        ],
        effectiveFrom: '2026-07-01T00:00:00Z',
        active: true,
        createdAt: '2026-07-01T00:00:00Z',
        createdBy: 'admin',
      },
    ];

    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue(
      mockHistory as any
    );

    render(<ApprovalPolicyHistory />);

    await waitFor(() => {
      expect(screen.getByText(/Tier 1/)).toBeInTheDocument();
      expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    });
  });
});

describe('PolicyHistoryViewer Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with tab navigation', () => {
    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getJobFamilies).mockResolvedValue([]);
    vi.mocked(policyService.getScoringThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue([]);

    render(<PolicyHistoryViewer />);

    expect(screen.getByText('Screening Thresholds')).toBeInTheDocument();
    expect(screen.getByText('Scoring Thresholds')).toBeInTheDocument();
    expect(screen.getByText('Approval Policies')).toBeInTheDocument();
  });

  it('switches between tabs when clicked', async () => {
    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getJobFamilies).mockResolvedValue([]);
    vi.mocked(policyService.getScoringThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue([]);

    render(<PolicyHistoryViewer />);

    const scoringTab = screen.getByText('Scoring Thresholds');
    fireEvent.click(scoringTab);

    await waitFor(() => {
      expect(scoringTab.closest('button')).toHaveClass('border-blue-600');
    });
  });

  it('provides export functionality', () => {
    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getJobFamilies).mockResolvedValue([]);
    vi.mocked(policyService.getScoringThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue([]);

    render(<PolicyHistoryViewer />);

    expect(screen.getByText('Export to CSV')).toBeInTheDocument();
  });

  it('displays help section', () => {
    vi.mocked(policyService.getScreeningThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getJobFamilies).mockResolvedValue([]);
    vi.mocked(policyService.getScoringThresholdHistory).mockResolvedValue([]);
    vi.mocked(policyService.getApprovalPoliciesHistory).mockResolvedValue([]);

    render(<PolicyHistoryViewer />);

    expect(screen.getByText('How to use this viewer')).toBeInTheDocument();
  });
});
