import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, beforeEach, expect } from 'vitest';
import { CSVUploader } from '../CSVUploader';
import { ToastProvider } from '@/contexts/ToastContext';

const mockOnUploadStart = vi.fn();
const mockOnUploadComplete = vi.fn();

function renderUploader(isUploading = false) {
  return render(
    <ToastProvider>
      <CSVUploader
        onUploadStart={mockOnUploadStart}
        onUploadComplete={mockOnUploadComplete}
        isUploading={isUploading}
      />
    </ToastProvider>
  );
}

describe('CSVUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should render upload zone', () => {
    renderUploader();

    expect(screen.getByText(/Drop your CSV file here/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Select File/i })).toBeInTheDocument();
  });

  it('should handle file selection', () => {
    renderUploader();

    const file = new File(['role_title,department'], 'test.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('test.csv')).toBeInTheDocument();
  });

  it('should reject non-CSV files', () => {
    renderUploader();

    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.queryByText('test.txt')).not.toBeInTheDocument();
  });

  it('should reject oversized files', () => {
    renderUploader();

    const oversized = new File([new ArrayBuffer(6 * 1024 * 1024)], 'large.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [oversized] } });

    expect(screen.queryByText('large.csv')).not.toBeInTheDocument();
  });

  it('should disable upload button during upload', () => {
    renderUploader(true);

    const file = new File(['role_title,department'], 'test.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const uploadButton = screen.getByRole('button', { name: /Uploading/i });
    expect(uploadButton).toBeDisabled();
  });

  it('should upload valid CSV and call completion handler', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Successfully imported 1 requisition(s)',
        results: {
          totalRows: 1,
          importedCount: 1,
          invalidCount: 0,
          duplicateCount: 0,
          importedRequisitions: ['req-100']
        }
      })
    } as Response);

    renderUploader();

    const file = new File(['role_title,department'], 'test.csv', { type: 'text/csv' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /Upload and Import/i }));

    await waitFor(() => {
      expect(mockOnUploadStart).toHaveBeenCalledTimes(1);
      expect(mockOnUploadComplete).toHaveBeenCalledTimes(1);
    });
  });
});
