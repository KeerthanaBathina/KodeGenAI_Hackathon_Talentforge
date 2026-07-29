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
  type ImportResult
} from '../../services/csvImportService';

describe('CSV Import Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    let createCounter = 0;
    mocks.jobFamilyFindMany.mockResolvedValue([
      { id: 'jf-1', name: 'Software Development' },
      { id: 'jf-2', name: 'Product Management' }
    ]);
    mocks.requisitionFindFirst.mockResolvedValue(null);
    mocks.requisitionCreate.mockImplementation(async () => {
      createCounter += 1;
      return { id: `req-${createCounter}` };
    });
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  describe('Large File Handling', () => {
    it('should handle CSV with 1000 rows efficiently', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) =>
        `Engineer ${i},Engineering,Remote,full_time,1,Software Development`
      );
      const csv = `role_title,department,location,job_type,slots,job_family\n${rows.join('\n')}`;

      const startTime = Date.now();
      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');
      const duration = Date.now() - startTime;

      expect(result.totalRows).toBe(1000);
      expect(result.importedRequisitions).toHaveLength(1000);
      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Special Characters in Data', () => {
    it('should handle commas within quoted fields', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\n"Senior Engineer, Backend",Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Senior Engineer, Backend'
          }),
          select: { id: true }
        })
      );
    });

    it('should handle newlines within quoted fields', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\n"Senior Engineer\nFull Stack",Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Senior Engineer\nFull Stack'
          })
        })
      );
    });

    it('should handle special characters in skills', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,required_skills\nSenior Engineer,Engineering,Remote,full_time,2,Software Development,"C#, .NET, SQL Server"`;

      await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiredSkills: ['C#', '.NET', 'SQL Server']
          })
        })
      );
    });

    it('should handle unicode characters', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nIngenieur Logiciel,Ingenierie,Montreal,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Ingenieur Logiciel'
          })
        })
      );
    });
  });

  describe('Empty and Whitespace Handling', () => {
    it('should trim whitespace from fields', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\n  Senior Engineer  ,  Engineering  ,  Remote  ,full_time,2,Software Development`;

      await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Senior Engineer',
            department: 'Engineering',
            location: 'Remote'
          })
        })
      );
    });

    it('should skip completely empty rows', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\n\nProduct Manager,Product,San Francisco,full_time,1,Product Management`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.totalRows).toBe(2);
      expect(result.importedRequisitions).toHaveLength(2);
    });

    it('should handle optional fields left empty', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,required_skills,min_experience_years\nSenior Engineer,Engineering,Remote,full_time,2,Software Development,,`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requiredSkills: [],
            minExperienceYears: 0
          })
        })
      );
    });
  });

  describe('JSON Eligibility Criteria', () => {
    it('should parse valid JSON eligibility criteria', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,eligibility_criteria\nSenior Engineer,Engineering,Remote,full_time,2,Software Development,"{""citizenship"": ""US Citizen"", ""clearance"": ""Secret""}"`;

      await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(mocks.requisitionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eligibilityCriteria: {
              citizenship: 'US Citizen',
              clearance: 'Secret'
            }
          })
        })
      );
    });

    it('should reject invalid JSON in eligibility criteria', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,eligibility_criteria\nSenior Engineer,Engineering,Remote,full_time,2,Software Development,"{invalid json}"`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('eligibility_criteria');
    });
  });

  describe('Duplicate Detection Edge Cases', () => {
    it('should detect case-insensitive duplicates', async () => {
      mocks.requisitionFindFirst.mockResolvedValueOnce({ id: 'req-existing' });

      const csv = `role_title,department,location,job_type,slots,job_family\nsenior engineer,engineering,remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.duplicateRows).toBe(1);
      expect(result.importedRequisitions).toHaveLength(0);
    });

    it('should not flag cancelled requisitions as duplicates by query design', async () => {
      await checkDuplicate('Senior Engineer', 'Engineering', 'Remote');

      expect(mocks.requisitionFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['cancelled'] }
          })
        })
      );
    });

    it('should detect duplicates within the same CSV', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Software Development\nProduct Manager,Product,San Francisco,full_time,1,Product Management\nSenior Engineer,Engineering,Remote,full_time,3,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(2);
      expect(result.duplicateRows).toBe(1);
      expect(result.duplicates[0]?.existingRequisitionId).toBe('duplicate_in_file');
    });
  });

  describe('Job Family Lookup', () => {
    it('should perform case-insensitive job family lookup', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,software development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it('should reject non-existent job family', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,2,Non-Existent Family`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('job_family');
    });
  });

  describe('Boundary Value Testing', () => {
    it('should accept minimum valid slot count', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,1,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it('should reject zero slots', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,0,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('slots');
    });

    it('should reject negative slots', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family\nSenior Engineer,Engineering,Remote,full_time,-1,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('slots');
    });

    it('should reject role_title exceeding 255 characters', async () => {
      const longTitle = 'A'.repeat(256);
      const csv = `role_title,department,location,job_type,slots,job_family\n${longTitle},Engineering,Remote,full_time,2,Software Development`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('role_title');
    });

    it('should accept minimum experience years of 0', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,min_experience_years\nSenior Engineer,Engineering,Remote,full_time,2,Software Development,0`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.importedRequisitions).toHaveLength(1);
    });

    it('should reject negative experience years', async () => {
      const csv = `role_title,department,location,job_type,slots,job_family,min_experience_years\nSenior Engineer,Engineering,Remote,full_time,2,Software Development,-1`;

      const result = await importRequisitionsFromCSV(Buffer.from(csv), 'user-123');

      expect(result.invalidRows).toBe(1);
      expect(result.errors[0]?.field).toBe('min_experience_years');
    });
  });

  describe('Error Report Generation', () => {
    it('should include all error types in report', () => {
      const result: ImportResult = {
        success: false,
        totalRows: 3,
        validRows: 0,
        invalidRows: 2,
        duplicateRows: 1,
        importedRequisitions: [],
        errors: [
          {
            rowNumber: 2,
            field: 'role_title',
            value: '',
            message: 'Role title is required'
          },
          {
            rowNumber: 3,
            field: 'job_type',
            value: 'invalid',
            message: 'Invalid job type'
          }
        ],
        duplicates: [
          {
            rowNumber: 4,
            title: 'Senior Engineer',
            department: 'Engineering',
            location: 'Remote',
            existingRequisitionId: 'req-123'
          }
        ]
      };

      const csv = generateErrorReportCSV(result);

      expect(csv).toContain('validation');
      expect(csv).toContain('duplicate');
      expect(csv).toContain('Role title is required');
      expect(csv).toContain('Invalid job type');
      expect(csv).toContain('req-123');
    });

    it('should generate valid CSV format', () => {
      const result: ImportResult = {
        success: false,
        totalRows: 1,
        validRows: 0,
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
      const lines = csv.trim().split('\n');

      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('row_number,error_type,field,value,message');
    });
  });
});
