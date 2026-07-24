import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResumeUpload } from '../ResumeUpload';

global.fetch = vi.fn();
global.XMLHttpRequest = vi.fn(() => ({
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    upload: {
        addEventListener: vi.fn(),
    },
    addEventListener: vi.fn((event, handler) => {
        if (event === 'load') {
            setTimeout(() => {
                Object.defineProperty(global.XMLHttpRequest.prototype, 'status', { value: 200 });
                handler();
            }, 100);
        }
    }),
})) as any;

describe('ResumeUpload', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render upload button', () => {
        render(<ResumeUpload applicationId="app-1" />);
        expect(screen.getByText('Upload Resume')).toBeInTheDocument();
    });

    it('should display format information', () => {
        render(<ResumeUpload applicationId="app-1" />);
        expect(screen.getByText(/Accepted formats:/)).toBeInTheDocument();
        expect(screen.getByText(/PDF, DOCX/)).toBeInTheDocument();
        expect(screen.getByText(/Maximum file size:/)).toBeInTheDocument();
        expect(screen.getByText(/10 MB/)).toBeInTheDocument();
    });

    it('should trigger file input when button is clicked', () => {
        render(<ResumeUpload applicationId="app-1" />);
        const button = screen.getByText('Upload Resume');
        const input = document.querySelector('input[type="file"]') as HTMLInputElement;

        const clickSpy = vi.spyOn(input, 'click');
        fireEvent.click(button);

        expect(clickSpy).toHaveBeenCalled();
    });

    it('should reject file that is too large', async () => {
        const onError = vi.fn();
        render(<ResumeUpload applicationId="app-1" onError={onError} />);

        const file = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.pdf', {
            type: 'application/pdf',
        });

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [file] });

        fireEvent.change(input);

        await waitFor(() => {
            expect(screen.getByText(/File size must not exceed 10 MB/)).toBeInTheDocument();
        });

        expect(onError).toHaveBeenCalledWith(expect.stringContaining('File size'));
    });

    it('should reject invalid file type', async () => {
        const onError = vi.fn();
        render(<ResumeUpload applicationId="app-1" onError={onError} />);

        const file = new File(['content'], 'resume.txt', { type: 'text/plain' });

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [file] });

        fireEvent.change(input);

        await waitFor(() => {
            expect(screen.getByText(/Only PDF and DOCX files are accepted/)).toBeInTheDocument();
        });

        expect(onError).toHaveBeenCalledWith(expect.stringContaining('PDF and DOCX'));
    });

    it('should upload valid PDF file', async () => {
        const onSuccess = vi.fn();

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ uploadUrl: 'https://upload.url', resumeId: 'resume-1' }),
        } as Response);

        render(<ResumeUpload applicationId="app-1" onSuccess={onSuccess} />);

        const file = new File([new ArrayBuffer(1024)], 'resume.pdf', {
            type: 'application/pdf',
        });

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [file] });

        fireEvent.change(input);

        await waitFor(() => {
            expect(screen.getByText(/Resume uploaded successfully!/)).toBeInTheDocument();
        });

        expect(onSuccess).toHaveBeenCalledWith('resume-1');
    });

    it('should show progress bar during upload', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ uploadUrl: 'https://upload.url', resumeId: 'resume-1' }),
        } as Response);

        render(<ResumeUpload applicationId="app-1" />);

        const file = new File([new ArrayBuffer(1024)], 'resume.pdf', {
            type: 'application/pdf',
        });

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [file] });

        fireEvent.change(input);

        await waitFor(() => {
            expect(screen.getByText(/Uploading.../)).toBeInTheDocument();
        });
    });

    it('should show error message on upload failure', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: { message: 'Upload failed' } }),
        } as Response);

        render(<ResumeUpload applicationId="app-1" />);

        const file = new File([new ArrayBuffer(1024)], 'resume.pdf', {
            type: 'application/pdf',
        });

        const input = document.querySelector('input[type="file"]') as HTMLInputElement;
        Object.defineProperty(input, 'files', { value: [file] });

        fireEvent.change(input);

        await waitFor(() => {
            expect(screen.getByText(/Upload failed/)).toBeInTheDocument();
        });
    });
});
