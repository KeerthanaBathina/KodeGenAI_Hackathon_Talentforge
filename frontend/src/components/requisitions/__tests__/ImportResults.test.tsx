import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToastProvider } from '@/contexts/ToastContext';
import { ImportResults } from '../ImportResults';
import type { ImportResultData } from '../types';

function renderResults(result: ImportResultData) {
  return render(
    <ToastProvider>
      <ImportResults result={result} />
    </ToastProvider>
  );
}

describe('ImportResults', () => {
  const baseResult: ImportResultData = {
    success: true,
    message: 'Successfully imported 2 requisition(s)',
    results: {
      totalRows: 2,
      importedCount: 2,
      invalidCount: 0,
      duplicateCount: 0,
      importedRequisitions: ['req-1', 'req-2']
    },
    processingTime: 1400
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should render import statistics', () => {
    renderResults(baseResult);

    expect(screen.getByText('Total Rows')).toBeInTheDocument();
    expect(screen.getByText('Imported')).toBeInTheDocument();
    expect(screen.getByText('Invalid')).toBeInTheDocument();
    expect(screen.getByText('Duplicates')).toBeInTheDocument();
    expect(screen.getByText('Successfully imported 2 requisition(s)')).toBeInTheDocument();
  });

  it('should render imported requisition IDs', () => {
    renderResults(baseResult);

    const details = screen.getByText(/View Requisition IDs/i);
    fireEvent.click(details);

    expect(screen.getByText('req-1')).toBeInTheDocument();
    expect(screen.getByText('req-2')).toBeInTheDocument();
  });

  it('should show error report action when errors exist', () => {
    renderResults({
      ...baseResult,
      success: false,
      message: 'Import completed with errors',
      results: {
        ...baseResult.results,
        importedCount: 1,
        invalidCount: 1,
        importedRequisitions: ['req-1']
      },
      errorReportUrl: '/api/requisitions/bulk-import/error-report/report-1'
    });

    expect(screen.getByRole('button', { name: /Download error report/i })).toBeInTheDocument();
  });

  it('should not show error report action when no error report URL exists', () => {
    renderResults({
      ...baseResult,
      success: false,
      message: 'Import completed with errors',
      results: {
        ...baseResult.results,
        invalidCount: 1
      },
      errorReportUrl: undefined
    });

    expect(screen.queryByRole('button', { name: /Download error report/i })).not.toBeInTheDocument();
  });
});
