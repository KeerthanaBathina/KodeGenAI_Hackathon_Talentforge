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

import { generateErrorReportCSV, importRequisitionsFromCSV, type ImportResult } from '../../services/csvImportService';

function buildCsv(rowCount: number): string {
  const rows = Array.from({ length: rowCount }, (_, i) =>
    `Engineer ${i},Engineering,Remote,full_time,1,Software Development`
  );

  return `role_title,department,location,job_type,slots,job_family\n${rows.join('\n')}`;
}

describe('csvImportService performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    let createCounter = 0;
    mocks.jobFamilyFindMany.mockResolvedValue([{ id: 'jf-1', name: 'Software Development' }]);
    mocks.requisitionFindFirst.mockResolvedValue(null);
    mocks.requisitionCreate.mockImplementation(async () => {
      createCounter += 1;
      return { id: `req-${createCounter}` };
    });
    mocks.auditEvent.mockResolvedValue(undefined);
  });

  it('processes small file (10 rows) in under 1 second', async () => {
    const start = Date.now();
    const result = await importRequisitionsFromCSV(Buffer.from(buildCsv(10)), 'user-123');
    const duration = Date.now() - start;

    expect(result.totalRows).toBe(10);
    expect(result.importedRequisitions).toHaveLength(10);
    expect(duration).toBeLessThan(1000);
  });

  it('processes medium file (100 rows) in under 5 seconds', async () => {
    const start = Date.now();
    const result = await importRequisitionsFromCSV(Buffer.from(buildCsv(100)), 'user-123');
    const duration = Date.now() - start;

    expect(result.totalRows).toBe(100);
    expect(result.importedRequisitions).toHaveLength(100);
    expect(duration).toBeLessThan(5000);
  });

  it('processes large file (1000 rows) in under 30 seconds', async () => {
    const start = Date.now();
    const result = await importRequisitionsFromCSV(Buffer.from(buildCsv(1000)), 'user-123');
    const duration = Date.now() - start;

    expect(result.totalRows).toBe(1000);
    expect(result.importedRequisitions).toHaveLength(1000);
    expect(duration).toBeLessThan(30000);
  });

  it('generates error report in under 500ms', () => {
    const result: ImportResult = {
      success: false,
      totalRows: 200,
      validRows: 0,
      invalidRows: 100,
      duplicateRows: 100,
      importedRequisitions: [],
      errors: Array.from({ length: 100 }, (_, i) => ({
        rowNumber: i + 2,
        field: 'role_title',
        value: '',
        message: 'Role title is required'
      })),
      duplicates: Array.from({ length: 100 }, (_, i) => ({
        rowNumber: i + 102,
        title: `Engineer ${i}`,
        department: 'Engineering',
        location: 'Remote',
        existingRequisitionId: `req-${i}`
      }))
    };

    const start = Date.now();
    const csv = generateErrorReportCSV(result);
    const duration = Date.now() - start;

    expect(csv).toContain('row_number,error_type,field,value,message');
    expect(csv).toContain('validation');
    expect(csv).toContain('duplicate');
    expect(duration).toBeLessThan(500);
  });
});
