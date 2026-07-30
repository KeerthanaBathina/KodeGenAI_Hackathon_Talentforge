import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecisionPdfData } from '../decisionPdfService';

// Hoist mocks before module imports
const { mockPdfDoc, mockStorage, mockStorageClient } = vi.hoisted(() => {
  const mockPdfDoc = {
    on: vi.fn(),
    end: vi.fn(),
    fontSize: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis()
  };

  const mockStorage = {
    upload: vi.fn(),
    createSignedUrl: vi.fn()
  };

  const mockStorageClient = {
    from: vi.fn(() => mockStorage),
    getBucket: vi.fn()
  };

  return { mockPdfDoc, mockStorage, mockStorageClient };
});

// Mock PDFKit
vi.mock('pdfkit', () => ({
  default: vi.fn(() => mockPdfDoc)
}));

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: mockStorageClient
  }))
}));

vi.mock('../../config/env', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key'
  }
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

import logger from '../../utils/logger';
import { generateDecisionPdf, checkStorageBucket } from '../decisionPdfService';

const mockLogError = vi.mocked(logger.error);
const mockLogDebug = vi.mocked(logger.debug);
const mockLogInfo = vi.mocked(logger.info);
const mockLogWarn = vi.mocked(logger.warn);

const { on: mockPdfOn, end: mockPdfEnd, text: mockPdfText, fontSize: mockPdfFontSize } = mockPdfDoc;
const { upload: mockUpload, createSignedUrl: mockCreateSignedUrl } = mockStorage;
const { getBucket: mockGetBucket } = mockStorageClient;

const mockPdfData: DecisionPdfData = {
  decisionId: 'dec-123',
  candidateName: 'Jane Doe',
  requisitionTitle: 'Senior Software Engineer',
  outcome: 'reject',
  reasonCode: 'skills_gap',
  reasonLabel: 'Skills Gap',
  justification: 'Candidate lacks required experience in distributed systems.',
  decidedBy: 'user-456',
  decidedByName: 'John Manager',
  decidedAt: new Date('2026-07-27T10:00:00Z')
};

beforeEach(() => {
  vi.clearAllMocks();
  
  // Setup default PDF mock behavior
  mockPdfOn.mockImplementation((event: string, callback: (...args: any[]) => void) => {
    if (event === 'data') {
      // Simulate PDF data chunks
      callback(Buffer.from('pdf-chunk-1'));
      callback(Buffer.from('pdf-chunk-2'));
    } else if (event === 'end') {
      // Call end callback immediately for tests
      setTimeout(() => callback(), 0);
    }
    return mockPdfOn;
  });
});

describe('DecisionPdfService', () => {
  describe('generateDecisionPdf', () => {
    it('should generate PDF and return signed URL', async () => {
      mockUpload.mockResolvedValue({
        data: { path: 'decision-dec-123-1234567890.pdf' },
        error: null
      });

      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/storage/v1/object/sign/decision-pdfs/decision-dec-123-1234567890.pdf?token=abc123' },
        error: null
      });

      const url = await generateDecisionPdf(mockPdfData);

      expect(url).toMatch(/^https:\/\/test\.supabase\.co/);
      expect(url).toContain('decision-dec-123');

      // Verify PDF content was written
      expect(mockPdfText).toHaveBeenCalledWith('Hiring Decision Summary', { align: 'center' });
      expect(mockPdfText).toHaveBeenCalledWith(`Decision ID: ${mockPdfData.decisionId}`);
      expect(mockPdfText).toHaveBeenCalledWith(`Name: ${mockPdfData.candidateName}`);
      expect(mockPdfText).toHaveBeenCalledWith(`Position: ${mockPdfData.requisitionTitle}`);
      expect(mockPdfText).toHaveBeenCalledWith(`Outcome: ${mockPdfData.outcome.toUpperCase()}`);

      // Verify upload was called
      expect(mockUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^decision-dec-123-\d+\.pdf$/),
        expect.any(Buffer),
        {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: false
        }
      );

      // Verify signed URL was created with 7-day expiration
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        expect.stringMatching(/^decision-dec-123-\d+\.pdf$/),
        7 * 24 * 60 * 60
      );

      expect(mockLogInfo).toHaveBeenCalledWith('Decision PDF generated successfully', {
        decisionId: 'dec-123',
        filename: expect.stringMatching(/^decision-dec-123-\d+\.pdf$/),
        urlExpiresIn: '7 days'
      });
    });

    it('should include justification when provided', async () => {
      mockUpload.mockResolvedValue({ data: {}, error: null });
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed-url' },
        error: null
      });

      await generateDecisionPdf(mockPdfData);

      expect(mockPdfText).toHaveBeenCalledWith('Justification', { underline: true });
      expect(mockPdfText).toHaveBeenCalledWith(
        mockPdfData.justification,
        { align: 'justify' }
      );
    });

    it('should skip justification section when empty', async () => {
      mockUpload.mockResolvedValue({ data: {}, error: null });
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed-url' },
        error: null
      });

      const dataWithoutJustification = {
        ...mockPdfData,
        justification: ''
      };

      await generateDecisionPdf(dataWithoutJustification);

      // Justification header should not be written
      const justificationCalls = mockPdfText.mock.calls.filter(
        call => call[0] === 'Justification'
      );
      expect(justificationCalls.length).toBe(0);
    });

    it('should throw error when PDF upload fails', async () => {
      mockUpload.mockResolvedValue({
        data: null,
        error: { message: 'Storage quota exceeded' }
      });

      await expect(
        generateDecisionPdf(mockPdfData)
      ).rejects.toThrow('Failed to upload PDF: Storage quota exceeded');

      expect(mockLogError).toHaveBeenCalledWith('Failed to upload PDF to storage', {
        decisionId: 'dec-123',
        error: 'Storage quota exceeded'
      });
    });

    it('should throw error when signed URL generation fails', async () => {
      mockUpload.mockResolvedValue({ data: {}, error: null });
      mockCreateSignedUrl.mockResolvedValue({
        data: null,
        error: { message: 'Invalid permissions' }
      });

      await expect(
        generateDecisionPdf(mockPdfData)
      ).rejects.toThrow('Failed to generate signed URL');

      expect(mockLogError).toHaveBeenCalledWith('Failed to generate signed URL', {
        decisionId: 'dec-123',
        error: 'Invalid permissions'
      });
    });

    it('should handle PDF generation errors', async () => {
      mockPdfOn.mockImplementation((event: string, callback: (...args: any[]) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('PDF generation failed')), 0);
        }
        return mockPdfOn;
      });

      await expect(
        generateDecisionPdf(mockPdfData)
      ).rejects.toThrow('PDF generation failed');

      expect(mockLogError).toHaveBeenCalledWith('Error generating decision PDF', {
        decisionId: 'dec-123',
        error: 'PDF generation failed'
      });
    });

    it('should log PDF size after generation', async () => {
      mockUpload.mockResolvedValue({ data: {}, error: null });
      mockCreateSignedUrl.mockResolvedValue({
        data: { signedUrl: 'https://test.supabase.co/signed-url' },
        error: null
      });

      await generateDecisionPdf(mockPdfData);

      expect(mockLogDebug).toHaveBeenCalledWith('PDF document generated', {
        decisionId: 'dec-123',
        sizeBytes: expect.any(Number)
      });
    });
  });

  describe('checkStorageBucket', () => {
    it('should return true when bucket exists', async () => {
      mockGetBucket.mockResolvedValue({
        data: { id: 'decision-pdfs', name: 'decision-pdfs' },
        error: null
      });

      const exists = await checkStorageBucket();

      expect(exists).toBe(true);
      expect(mockGetBucket).toHaveBeenCalledWith('decision-pdfs');
    });

    it('should return false when bucket does not exist', async () => {
      mockGetBucket.mockResolvedValue({
        data: null,
        error: { message: 'Bucket not found' }
      });

      const exists = await checkStorageBucket();

      expect(exists).toBe(false);
      expect(mockLogWarn).toHaveBeenCalledWith('Storage bucket check failed', {
        error: 'Bucket not found'
      });
    });

    it('should return false and log error on exception', async () => {
      mockGetBucket.mockRejectedValue(new Error('Network error'));

      const exists = await checkStorageBucket();

      expect(exists).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('Error checking storage bucket', {
        error: 'Network error'
      });
    });
  });
});
