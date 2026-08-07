import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jobFamilyFindMany: vi.fn(),
  requisitionFindFirst: vi.fn(),
  requisitionCreate: vi.fn(),
  auditEvent: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock('../../db/prisma', () => ({
  default: {
    jobFamily: {
      findMany: mocks.jobFamilyFindMany
    },
    requisition: {
      findFirst: mocks.requisitionFindFirst,
      create: mocks.requisitionCreate
    }
  }
}));

vi.mock('../../services/auditService', () => ({
  auditEvent: mocks.auditEvent
}));

vi.mock('../../utils/logger', () => ({
  default: {
    error: mocks.loggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}));

import {
  checkDuplicate,
  generateErrorReportCSV,
  importRequisitionsFromCSV,
  parseCSVFile,
  validateCSVColumns,
  validateRow,
  type ImportResult
} from '../../services/csvImportService';

describe('csvImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.jobFamilyFindMany.mockResolvedValue([
      { id: 'jf-1', name: 'Software Development' },
      { id: 'jf-2', name: 'Product Management' }
    ]);
    mocks.requisitionFindFirst.mockResolvedValue(null);
    mocks.requisitionCreate.mockImplementation(async () => ({ id: `req-${Math.random().toString(16).slice(2)}` }));
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  describe('parseCSVFile', () => {
    it('parses valid CSV with headers', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development`;

      const result = await parseCSVFile(Buffer.from(csv));

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.role_title).toBe('Senior Engineer');
    });

    it('handles empty lines', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\n\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\n\n`;

      const result = await parseCSVFile(Buffer.from(csv));
      expect(result.data).toHaveLength(1);
    });
  });

  describe('validateCSVColumns', () => {
    it('passes with all required columns', () => {
      const headers = ['role_title', 'department', 'location', 'job_type', 'slots', 'job_family'];
      const result = validateCSVColumns(headers);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails with missing required column', () => {
      const headers = ['role_title', 'department', 'location', 'slots', 'job_family'];
      const result = validateCSVColumns(headers);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'column_missing',
          column: 'job_type'
        })
      );
    });

    it('warns about unknown columns', () => {
      const headers = [
        'role_title',
        'department',
        'location',
        'job_type',
        'slots',
        'job_family',
        'unknown_column'
      ];
      const result = validateCSVColumns(headers);

      expect(result.valid).toBe(true);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          type: 'column_extra',
          column: 'unknown_column'
        })
      );
    });
  });

  describe('validateRow', () => {
    it('validates row with all required fields', async () => {
      const jobFamilyCache = new Map([['software development', 'jf-123']]);
      const row = {
        role_title: 'Senior Engineer',
        department: 'Engineering',
        location: 'Remote',
        job_type: 'full_time',
        slots: '2',
        job_family: 'Software Development'
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects row with missing required field', async () => {
      const jobFamilyCache = new Map([['software development', 'jf-123']]);
      const row = {
        role_title: '',
        department: 'Engineering',
        location: 'Remote',
        job_type: 'full_time',
        slots: '2',
        job_family: 'Software Development'
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'role_title',
          message: 'Role title is required'
        })
      );
    });

    it('rejects row with invalid job_type', async () => {
      const jobFamilyCache = new Map([['software development', 'jf-123']]);
      const row = {
        role_title: 'Engineer',
        department: 'Engineering',
        location: 'Remote',
        job_type: 'invalid_type',
        slots: '2',
        job_family: 'Software Development'
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'job_type',
          message: expect.stringContaining('Invalid job type')
        })
      );
    });

    it('accepts hyphenated and case-varied job_type', async () => {
      const jobFamilyCache = new Map([['software development', 'jf-123']]);
      const row = {
        role_title: 'Engineer',
        department: 'Engineering',
        location: 'Remote',
        job_type: 'Full-time',
        slots: '2',
        job_family: 'Software Development'
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(true);
      expect(result.data.job_type).toBe('full_time');
    });

    it('rejects row with non-existent job family', async () => {
      const jobFamilyCache = new Map([['software development', 'jf-123']]);
      const row = {
        role_title: 'Engineer',
        department: 'Engineering',
        location: 'Remote',
        job_type: 'full_time',
        slots: '2',
        job_family: 'Non-Existent Family'
      };

      const result = await validateRow(row, 2, jobFamilyCache);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'job_family',
          message: expect.stringContaining('not found in system')
        })
      );
    });
  });

  describe('checkDuplicate', () => {
    it('detects duplicate requisition', async () => {
      mocks.requisitionFindFirst.mockResolvedValueOnce({ id: 'req-existing' });

      const result = await checkDuplicate('Senior Engineer', 'Engineering', 'Remote');

      expect(result.isDuplicate).toBe(true);
      expect(result.existingRequisitionId).toBe('req-existing');
    });

    it('does not detect duplicate when no existing requisition', async () => {
      mocks.requisitionFindFirst.mockResolvedValueOnce(null);

      const result = await checkDuplicate('Senior Engineer', 'Engineering', 'Remote');

      expect(result.isDuplicate).toBe(false);
      expect(result.existingRequisitionId).toBeUndefined();
    });
  });

  describe('importRequisitionsFromCSV', () => {
    it('imports valid CSV with multiple rows', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\nProduct Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), '11111111-1111-1111-1111-111111111111');

      expect(result.success).toBe(true);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);
      expect(result.importedRequisitions).toHaveLength(2);
      expect(mocks.auditEvent).toHaveBeenCalledOnce();
    });

    it('skips invalid rows and still imports valid rows', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\n,Marketing,New York,full_time,1,Product Management\nProduct Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), '11111111-1111-1111-1111-111111111111');

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(2);
      expect(result.invalidRows).toBe(1);
      expect(result.importedRequisitions).toHaveLength(2);
      expect(result.errors[0]?.field).toBe('role_title');
    });

    it('detects and skips duplicates against existing requisitions', async () => {
      mocks.requisitionFindFirst.mockResolvedValueOnce({ id: 'req-existing' }).mockResolvedValueOnce(null);

      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\nProduct Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), '11111111-1111-1111-1111-111111111111');

      expect(result.duplicateRows).toBe(1);
      expect(result.importedRequisitions).toHaveLength(1);
      expect(result.duplicates[0]?.title).toBe('Senior Engineer');
    });

    it('rejects CSV with missing required columns', async () => {
      const csv = `role_title,department,location,slots,job_family\nSenior Engineer,Engineering,Remote,2,Software Development`;

      await expect(
        importRequisitionsFromCSV(Buffer.from(csv), '11111111-1111-1111-1111-111111111111')
      ).rejects.toThrow('Missing required column: job_type');
    });

    it('records database insert errors and continues remaining rows', async () => {
      mocks.requisitionCreate.mockRejectedValueOnce(new Error('Insert failed')).mockResolvedValueOnce({ id: 'req-ok' });

      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\nProduct Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), '11111111-1111-1111-1111-111111111111');

      expect(result.importedRequisitions).toHaveLength(1);
      expect(result.invalidRows).toBe(1);
      expect(result.errors.some((error) => error.message.includes('Database error'))).toBe(true);
      expect(mocks.loggerError).toHaveBeenCalled();
    });
  });

  describe('generateErrorReportCSV', () => {
    it('generates CSV with validation errors', () => {
      const result: ImportResult = {
        success: false,
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
        duplicateRows: 0,
        importedRequisitions: [],
        errors: [
          {
            rowNumber: 2,
            field: 'role_title',
            value: '',
            message: 'Role title is required'
          }
        ],
        duplicates: []
      };

      const csv = generateErrorReportCSV(result);

      expect(csv).toContain('row_number');
      expect(csv).toContain('error_type');
      expect(csv).toContain('validation');
      expect(csv).toContain('Role title is required');
    });

    it('includes duplicate errors in report', () => {
      const result: ImportResult = {
        success: true,
        totalRows: 2,
        validRows: 1,
        invalidRows: 0,
        duplicateRows: 1,
        importedRequisitions: ['req-123'],
        errors: [],
        duplicates: [
          {
            rowNumber: 2,
            title: 'Senior Engineer',
            department: 'Engineering',
            location: 'Remote',
            existingRequisitionId: 'req-existing'
          }
        ]
      };

      const csv = generateErrorReportCSV(result);

      expect(csv).toContain('duplicate');
      expect(csv).toContain('req-existing');
    });
  });
});